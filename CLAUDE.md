# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start development server
npm run build    # TypeScript check + production build
npm run lint     # ESLint
npm test         # Run calculation tests
```

## Architecture

This is a React retirement planning calculator that projects portfolio growth and simulates tax-optimized withdrawals.

### Core Calculation Flow

1. **Accumulation Phase** (`src/utils/projections.ts`): Projects account growth from current age to retirement using compound interest, annual contributions, contribution growth rates, and employer matching.

2. **Withdrawal Phase** (`src/utils/withdrawals.ts`): Simulates retirement spending with a tax-optimized withdrawal strategy:
   - Takes Required Minimum Distributions (RMDs) from traditional accounts first (age 73+)
   - Fills 12% tax bracket with additional traditional withdrawals
   - Uses Roth accounts (tax-free)
   - Uses taxable accounts (with capital gains tracking)
   - Uses HSA last
   - Falls back to additional traditional withdrawals if needed

3. **Tax Calculations** (`src/utils/taxes.ts`): Computes federal income tax, capital gains tax, and state tax using 2024 brackets.

### Data Flow

- `App.tsx` holds state for accounts, profile, and assumptions (persisted to localStorage via `useLocalStorage` hook)
- `useRetirementCalc` hook orchestrates calculations, returning `AccumulationResult` and `RetirementResult`
- Chart components receive results and render visualizations using Recharts

### Key Types (`src/types/index.ts`)

- `Account`: Investment account with balance, contributions, return rate, type (traditional_401k, roth_ira, etc.)
- `Profile`: User info including ages, filing status, Social Security
- `Assumptions`: Economic parameters (inflation, withdrawal rate, retirement return)
- `AccumulationResult` / `RetirementResult`: Yearly projections with balances, withdrawals, taxes

### Key Features

**Configurable Withdrawal Ages:**
- Each account has optional `withdrawalRules: { startAge: number }`
- Defaults are smart: traditional accounts default to 60 (US) or retirement age (Canada)
- Validation enforces RMD age constraints (can't delay past age 73 US, 71 Canada)
- Early withdrawals trigger 10% penalty for US traditional accounts before age 59.5

**Known Simplifications (Penalty Calculations):**
- Roth contributions vs earnings not tracked separately. In reality, Roth contributions can be withdrawn penalty-free at any time; only earnings face the 10% penalty before age 59.5.
- HSA non-medical penalty (20% before age 65) not implemented. HSA withdrawals are modeled as penalty-free.
- 5-year rule for Roth accounts not tracked. Account opening dates are not stored.

### Tailwind v4

Uses `@tailwindcss/vite` plugin. Dark mode requires this CSS directive:
```css
@custom-variant dark (&:where(.dark, .dark *));
```

### Chart Components

All chart components accept `isDarkMode` prop for proper axis/legend coloring. Pass from App.tsx which manages dark mode state.

## Working Agreement (read before editing)

These rules exist because ignoring them has caused expensive rework — failed edits that
got committed anyway, then discovered and re-fixed across multiple commits, burning large
amounts of tokens for zero net progress. Follow them to keep changes cheap and correct.

### Never batch a commit with the work it commits
Do NOT put `Edit`, `npm run build`, `npm test`, `git commit`, and `git push` in one
parallel tool block. Run edits → STOP and read the results → build/test → STOP and read →
only then stage and commit. The commit is its own step, after green has been seen. A commit
fired in the same batch as its edits will run even if those edits silently failed.

### Treat a failed `Edit` as a hard stop
`Edit` returning "String to replace not found" means the change did NOT happen. Do not
proceed to build/commit assuming it did. Re-read the file, fix the match, confirm the edit
landed. Never commit on top of an unverified edit.

### Commit messages report, they don't predict
A commit message may only state facts already seen in a tool output **in the current turn**:
- Don't write a test count unless `npm test` was just run and the number read.
- Don't write "verified in browser" unless a preview eval actually returned the evidence.
- Don't claim a file was changed unless its `Edit` succeeded and it's in `git status`.
If it hasn't been observed this turn, it doesn't go in the message.

### Verify before claiming, and separate measurement failure from code failure
A `false`/`null`/empty result is often a bad *measurement* (stale serverId, same-tick DOM
read before React commits, CSS-transformed text vs raw `textContent`), not a real bug. Check
the measurement before raising an alarm — and never report success that wasn't actually read back.

### Preview/eval discipline (`mcp__Claude_Preview__*`)
- Get the `serverId` from a `preview_list` or `preview_start` output **immediately prior**.
  Never invent or reuse a guessed ID — that was a repeated time-sink.
- Click and read in **separate** eval calls; React commits between calls, not within one.
- Launch config lives in `.claude/launch.json` (server name: `dev`, port 5173).

### Test suite shape
`src/tests/calculations.test.ts` is a single tsx script run via `npm test` (not a framework).
To add tests: write a `testXxx()` function, register it inside `runAllTests()`, and import any
new util at the top. A missing import throws a `ReferenceError` that aborts the whole run — so
after adding tests, read the final "Passed/Failed/Total" line to confirm the suite completed.
