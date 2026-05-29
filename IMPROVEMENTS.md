# Retirement Calculator — Improvement Backlog

Items are ranked in priority order. Check off each one as it ships.

Effort: **S** = 1–2 days · **M** = 3–7 days · **L** = 1–3 weeks · **XL** = 3+ weeks

---

## Backlog

### 1. Onboarding wizard · Effort: S · UX & sharing
- [x] **Done**

**What it does**
For new users with no saved data, a 3-step modal: (1) age + retirement age, (2) rough savings + income, (3) country + filing status. Auto-generates realistic accounts and meaningful defaults. Goal: meaningful numbers in under 2 minutes.

**Files to touch**
- `src/components/OnboardingWizard.tsx` (new)
- `src/App.tsx` — show wizard when localStorage empty
- `src/utils/constants.ts` — parameterize default account creation

**Key decisions**
- Maximum 3 steps. Savings as a slider (bands: $0 / $50K / $200K / $500K / $1M+).
- Skip button at every step for users who want to start from blank state.
- Detect first-time user via empty localStorage.

**Risks**
Very low. Pure UI work, no new calculations. Main risk is over-scoping with too many questions.

---

### 2. Milestone timeline chart · Effort: M · UX & sharing
- [ ] **Done**

**What it does**
A horizontal timeline showing when every major milestone lands across the plan: retirement, Social Security start, RMDs begin, early-access gap opens/closes, FIRE number hit, life events, account depletions, and portfolio end. Single at-a-glance view of the whole plan arc.

**Files to touch**
- `src/components/ChartTimeline.tsx` (new)
- `src/App.tsx` — wire up milestone data
- `src/types/index.ts` — `Milestone` type

**Key decisions**
- Auto-derive milestones from existing result objects: FIRE achieve age from `FireResult`, SS start from `IncomeStreams`, RMD start from constants, depletion age from `RetirementResult`, account unlock ages from `withdrawalRules`.
- Overlay user-defined LifeEvents if that feature is built (see #3).
- Render as a horizontal swimlane using Recharts scatter/reference lines to stay consistent with existing chart style.

**Risks**
Low — all the data already exists in result objects, this is purely a new visualization layer. Main design challenge is legibility when milestones cluster at similar ages (e.g. retirement + SS + RMDs all near 65–73). Becomes significantly richer if Life Events (#3) is built first.

---

### 3. Life events · Effort: M · Decision tools
- [ ] **Done**

**What it does**
Let users define one-time or time-bounded events that affect cashflow: mortgage payoff (frees up monthly cash), kids' college tuition (4-year expense spike), home purchase (lump-sum drawdown), car purchase, inheritance, rental income start/stop. These feed into the accumulation and withdrawal projections so the chart shows realistic bumps and dips rather than a smooth curve.

**Files to touch**
- `src/types/index.ts` — `LifeEvent` type
- `src/utils/projections.ts` — apply events during accumulation
- `src/utils/withdrawals.ts` — apply events during drawdown
- `src/components/LifeEventForm.tsx` (new)
- `src/components/LifeEventList.tsx` (new)
- `src/App.tsx`
- `src/hooks/useRetirementCalc.ts`

**Key decisions**
- Model: `LifeEvent { id, name, type: 'expense' | 'income' | 'lump_sum', amount (today's dollars), startAge, endAge?, inflationAdjust: bool }`
- Expense events during accumulation reduce annual contributions; during retirement they increase the spending target.
- Treat as an increase to the withdrawal target for that year and let the existing waterfall handle account sourcing.
- Very similar in structure to `IncomeStream`, which is already implemented — follow that pattern.

**Risks**
Main complexity is where the money comes from when a big expense hits. The waterfall approach (let existing withdrawal logic source it) keeps this contained. `IncomeStream` is a close analogue so the pattern is already proven in this codebase.

---

### 4. Inflation-indexed tax brackets · Effort: S · Modeling realism
- [ ] **Done**

**What it does**
Instead of static 2024 brackets in every future year, brackets grow with inflation so bracket creep doesn't artificially inflate future tax bills. Makes the withdrawal tax math honest for long retirements.

**Files to touch**
- `src/utils/taxes.ts` — accept `inflationFactor?: number` param
- `src/utils/withdrawals.ts` — compute and pass `inflationFactor` per year
- `src/countries/usa/taxes.ts` — same threading
- `src/countries/canada/taxes.ts` — same threading

**Key decisions**
- Add optional checkbox "Adjust tax brackets for inflation" in Assumptions, defaulting **on** (more accurate). Lets users see the difference.
- Standard deduction grows proportionally too.
- TCJA sunset modeling (reversion to pre-2017 brackets) is a future follow-on.

**Risks**
Very low. Well-contained change. Produces a small reduction in projected future taxes; worth noting in methodology docs.

---

### 5. Save & compare named scenarios · Effort: M · UX & sharing
- [ ] **Done**

**What it does**
Save the current state as a named scenario ("Retire at 55", "Coast to 60"), then view a side-by-side comparison table of key metrics: portfolio at retirement, depletion age, lifetime taxes, monthly sustainable withdrawal.

**Files to touch**
- `src/hooks/useScenarios.ts` (new)
- `src/components/ScenarioComparison.tsx` (new)
- `src/App.tsx` — "Save Scenario" button + comparison panel toggle
- `src/types/index.ts` — `SavedScenario` type

**Key decisions**
- Only save `AppState` (inputs), not computed results — recompute on demand in the comparison view to keep localStorage size small.
- Cap at 5–6 saved scenarios.
- One-click "Restore" to load a scenario back into the live editor.
- Comparison metrics: retirement age, total at retirement, depletion age, lifetime taxes, monthly sustainable withdrawal.

**Risks**
localStorage size is manageable if storing only inputs. Comparison view needs to re-run calculations for each scenario — could be slow with many scenarios; run synchronously on a small dataset so it's fine.

---

### 6. Monte Carlo simulation · Effort: L · Modeling realism
- [ ] **Done**

**What it does**
Runs 1,000+ randomized return sequences and shows (a) a success probability headline ("87% chance of not running out") and (b) a percentile fan chart (p10/p25/p50/p75/p90 portfolio bands over retirement). The single highest-credibility upgrade for serious planners.

**Files to touch**
- `src/utils/monteCarlo.ts` (new) — core simulation engine
- `src/workers/monteCarlo.worker.ts` (new) — Web Worker
- `src/components/ChartMonteCarlo.tsx` (new) — fan chart + success badge
- `src/types/index.ts` — `MonteCarloResult`, `MonteCarloConfig`
- `src/hooks/useRetirementCalc.ts`
- `src/App.tsx`

**Key decisions**
- Run in a Web Worker so the UI doesn't freeze during 1,000-run compute.
- Use a simplified per-year simulation (skip full tax calculation per year) for performance; overlay on the deterministic tax-accurate base run.
- Allow user to set return volatility (stddev) in Assumptions as an advanced option.

**Risks**
Web Worker bundling with Vite is untested in this repo (straightforward but adds ~1 day of setup). Log-normal parameterization needs care — arithmetic mean ≠ geometric mean, so the median simulation should match the deterministic line.

---

### 7. Historical backtesting · Effort: L · Modeling realism
- [ ] **Done**

**What it does**
Replays actual 1871–today return/inflation sequences (Shiller data, the cFIREsim approach). Shows success rate across all historical starting years, and a histogram of portfolio values at end-of-life to illustrate tail risk. Shows how the plan would have survived 1966 or 2000.

**Files to touch**
- `src/data/historicalReturns.ts` (new) — Shiller annual return + CPI data
- `src/utils/historicalBacktest.ts` (new) — simulation runner
- `src/components/ChartBacktest.tsx` (new) — success rate chart
- `src/types/index.ts` — `BacktestResult`
- `src/hooks/useRetirementCalc.ts`
- `src/App.tsx`

**Key decisions**
- Shiller data is public domain; embed directly (~12 KB).
- Use simplified inner loop (not full tax per year) for performance.
- Show both success rate and a table of worst historical periods (1966, 2000) so users understand why certain start years fail.

**Risks**
Historical equity-only returns don't map cleanly to diversified portfolios — needs a bond allocation slider or a clear methodology note. Adds ~20–30 KB to bundle.

---

### 8. Roth conversion ladder · Effort: M · Decision tools
- [ ] **Done**

**What it does**
For users retiring before 59.5, shows the optimal annual Roth conversions during low-income early-retirement years — how much to convert to fill the 12% bracket, the tax cost, and projected lifetime tax savings versus doing nothing.

**Files to touch**
- `src/utils/rothConversion.ts` (new)
- `src/components/FirePanel.tsx` — new "Roth Conversion Ladder" section
- `src/types/index.ts` — `RothConversionLadder`, `ConversionYear`

**Key decisions**
- Scope to gap years only (retirement age → penalty-free age) to keep it focused.
- Output: table showing age, conversion amount, tax cost, and cumulative lifetime tax delta.
- User can override suggested conversion amounts to model their own plan.
- US-only (CA TFSA is already tax-free).

**Risks**
Optimization involves projecting future bracket space, which requires estimating future ordinary income — already available from the withdrawal simulation. Medium complexity.

---

### 9. Social Security claiming optimizer · Effort: M · Decision tools
- [ ] **Done**

**What it does**
Breakeven analysis for claiming at 62, FRA (67 for those born after 1960), or 70. Displays cumulative benefit curves, crossover ages, and "what age do you need to live to for 70 to win?"

**Files to touch**
- `src/utils/socialSecurity.ts` (new)
- `src/components/FirePanel.tsx` — new SS optimizer section
- `src/types/index.ts` — `SSClaimingAnalysis`

**Key decisions**
- Take FRA benefit as input (user gets this from SSA.gov) rather than calculating from earnings history.
- Show spousal benefit (50% of higher earner's PIA for MFJ) using the existing `filingStatus` field.
- US-only; CA CPP is already modeled separately.
- Scope to three basic claiming ages only — file-and-suspend was eliminated in 2015.

**Risks**
Well-defined math. Main risk is UI clarity around breakeven framing for married couples.

---

### 10. ACA subsidy / MAGI modeling · Effort: M · Decision tools
- [ ] **Done**

**What it does**
For early retirees, shows how projected annual income (Roth conversions, SS, withdrawals) affects ACA premium tax credits. Flags "cliff" years where $1 of extra income eliminates thousands in subsidies, and shows the MAGI target to stay under.

**Files to touch**
- `src/utils/aca.ts` (new)
- `src/data/fpl.ts` (new) — Federal Poverty Level thresholds by household size
- `src/components/FirePanel.tsx` — ACA income bridge section
- `src/components/ProfileForm.tsx` — household size field
- `src/types/index.ts` — `ACAAnalysis`

**Key decisions**
- MAGI for ACA includes: ordinary income, SS (taxable portion), Roth conversions, capital gains — but NOT Roth distributions.
- Only show for users with `retirementAge < 65` (pre-Medicare).
- ARP subsidies are currently extended but could expire — add a "current law" caveat.
- US-only.

**Risks**
FPL tables change annually (maintenance burden). ARP subsidy extension policy risk. Medium complexity but high real-world value for FIRE users.

---

### 11. Guardrails withdrawal strategy · Effort: M · Decision tools
- [ ] **Done**

**What it does**
Instead of the rigid SWR, models flexible spending (Guyton-Klinger): if the portfolio drops below 80% of the on-plan path, cut spending 10%; if above 120%, increase spending 10%. Dramatically improves modeled success rates and more closely matches how real retirees behave.

**Files to touch**
- `src/utils/withdrawals.ts` — add `GuardrailsConfig` param and adjustment logic
- `src/types/index.ts` — `GuardrailsConfig`, extend `YearlyWithdrawal` with `guardrailTriggered: boolean`
- `src/components/AssumptionsForm.tsx` — "Withdrawal Strategy: Fixed SWR / Guardrails" toggle
- `src/components/ChartDrawdown.tsx` — annotate guardrail trigger years

**Key decisions**
- Make it a toggle (Fixed SWR vs Guardrails) so users can compare both.
- Default guardrails: lower 80% / upper 120% of on-plan portfolio, 10% spending adjustment. Let users customize.
- Show a "spending history" line on the drawdown chart showing actual vs planned spending.

**Risks**
Low architectural risk — the withdrawal loop is already year-by-year. Main complexity is explaining guardrail triggers in the UI without confusing users.

---

### 12. Roth basis tracking · Effort: S · Data & scope
- [ ] **Done**

**What it does**
Track the running sum of Roth contributions separately from earnings. Contributions can be withdrawn penalty-free at any age; only earnings face the 10% penalty before 59.5. Currently all Roth is treated identically.

**Files to touch**
- `src/types/index.ts` — optional `rothContributions?: number` on `Account`
- `src/utils/withdrawals.ts` — split Roth withdrawal into contributions vs earnings
- `src/utils/penaltyCalculator.ts` — only penalize earnings portion pre-59.5
- `src/components/AccountForm.tsx` — optional "Roth contributions (cost basis)" input

**Key decisions**
- Backwards-compatible — `rothContributions: undefined` falls back to current behavior.

**Risks**
Low. New field is optional. Existing localStorage state loads without change.

---

### 13. HSA non-medical penalty fix · Effort: S · Data & scope
- [ ] **Done**

**What it does**
HSA withdrawals before age 65 for non-medical expenses face a 20% penalty + income tax. Currently modeled as penalty-free. Adds accuracy for users who might tap HSA early for non-medical use.

**Files to touch**
- `src/utils/withdrawals.ts`
- `src/utils/penaltyCalculator.ts` — 20% penalty for non-medical HSA before 65
- `src/components/AccountForm.tsx` — optional "HSA medical-only" toggle

**Key decisions**
- Default: assume medical (conservative, matches most HSA savers' intent).
- Flag non-medical pre-65 withdrawals with 20% penalty when toggle is off.

**Risks**
Low. Well-contained in the penalty calculator.

---

### 14. Couples / dual-earner modeling · Effort: XL · Data & scope
- [ ] **Done**

**What it does**
Two ages, two income sets, two account sets with per-owner contribution timelines, combined spending, and survivor scenarios (one SS stream ends, spending drops ~20%, filing status changes to single).

**Files to touch**
- `src/types/index.ts` — spouse fields on `Profile`, `owner` field on `Account`
- `src/utils/projections.ts`
- `src/utils/withdrawals.ts`
- `src/utils/taxes.ts`
- `src/components/ProfileForm.tsx`
- `src/components/AccountForm.tsx`
- `src/App.tsx`
- `src/hooks/useRetirementCalc.ts`
- All chart components (retirement age reference line becomes two lines)

**Key decisions**
- Scope v1 tightly: shared pool, two ages, two SS streams — no survivor scenario in v1.
- Add survivor scenario as a follow-on phase.
- `Account` gains `owner: 'primary' | 'spouse'` — each account follows its owner's contribution end date.

**Risks**
Largest item on the list — touches nearly every file and requires a new mental model for the app. Strongly recommend breaking into phases: v1 (two ages + two SS streams) then v2 (survivor scenario).
