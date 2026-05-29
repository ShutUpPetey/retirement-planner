import { useState, useMemo } from 'react';
import {
  Account, Profile, Assumptions, AccumulationResult, RetirementResult,
  IncomeStream, getTaxTreatment,
} from '../types';
import { getStandardDeduction } from '../utils/taxes';
import type { CountryConfig } from '../countries';

interface MathDebugPanelProps {
  accounts: Account[];
  profile: Profile;
  assumptions: Assumptions;
  incomeStreams: IncomeStream[];
  accumulation: AccumulationResult;
  retirement: RetirementResult;
  countryConfig: CountryConfig;
}

// ── formatters ────────────────────────────────────────────────────────────────
const fmt  = (v: number) => v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const pct  = (v: number) => `${(v * 100).toFixed(1)}%`;
const fmtM = (v: number, d = 3) => v.toFixed(d);

// ── helpers ───────────────────────────────────────────────────────────────────
function getIrsBase(account: Account, countryConfig: CountryConfig): number {
  const raw = countryConfig.getContributionLimits()[account.type];
  if (!raw) return 0;
  return typeof raw === 'number' ? raw : (raw.annual ?? raw.max ?? 0);
}

function irsMaxForYear(account: Account, countryConfig: CountryConfig, yearIndex: number, inflationRate: number): number {
  const base = getIrsBase(account, countryConfig);
  if (!base) return 0;
  return Math.round(base * Math.pow(1 + inflationRate, yearIndex) / 500) * 500;
}

// ── sub-components ────────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 border-b border-gray-200 dark:border-gray-700 pb-1">
        {title}
      </h4>
      {children}
    </div>
  );
}

function Row({ label, formula, result, note, dim }: {
  label: string; formula?: string; result: string; note?: string; dim?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
      <span className={`min-w-[190px] ${dim ? 'text-gray-400 dark:text-gray-500' : 'text-gray-500 dark:text-gray-400'}`}>{label}</span>
      {formula && <span className="text-gray-400 dark:text-gray-500 font-mono text-xs break-all">{formula}</span>}
      <span className={`font-semibold ml-auto ${dim ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-white'}`}>{result}</span>
      {note && <span className="w-full text-xs text-gray-400 dark:text-gray-500">{note}</span>}
    </div>
  );
}

function Divider() { return <hr className="border-gray-100 dark:border-gray-700" />; }

function Card({ children }: { children: React.ReactNode }) {
  return <div className="space-y-1.5 bg-gray-50 dark:bg-gray-700/40 rounded-md p-3">{children}</div>;
}

// ── main ──────────────────────────────────────────────────────────────────────
export function MathDebugPanel({
  accounts, profile, assumptions, incomeStreams: _streams,
  accumulation, retirement, countryConfig,
}: MathDebugPanelProps) {
  const [open, setOpen] = useState(false);
  const [selectedAge, setSelectedAge] = useState(profile.currentAge + 1);

  const currentCalYear = new Date().getFullYear();
  const irsLabel = profile.country === 'CA' ? 'CRA limit' : 'IRS limit';

  // ── derived from slider ──────────────────────────────────────────────────
  const yearIndex    = selectedAge - profile.currentAge;
  const calYear      = currentCalYear + yearIndex;
  const inflFactor   = Math.pow(1 + assumptions.inflationRate, yearIndex);
  const yearsToRetirement = Math.max(0, profile.retirementAge - profile.currentAge);
  const isAccum      = selectedAge < profile.retirementAge;
  const isRetired    = selectedAge >= profile.retirementAge;
  const retireYrIdx  = selectedAge - profile.retirementAge; // only valid when isRetired

  // ── accumulation snapshot for selected age ─────────────────────────────
  const accumSnap = useMemo(() => {
    if (!isAccum) return null;
    const yr     = accumulation.yearlyBalances.find(y => y.age === selectedAge);
    const prevYr = accumulation.yearlyBalances.find(y => y.age === selectedAge - 1);
    if (!yr) return null;

    return accounts.map(account => {
      const prevBal = prevYr?.balances[account.id] ?? account.balance;
      const newBal  = yr.balances[account.id] ?? 0;

      // Contribution for this year
      const irsMax = irsMaxForYear(account, countryConfig, yearIndex, assumptions.inflationRate);
      const irsBase = getIrsBase(account, countryConfig);
      const grownContrib = account.annualContribution * Math.pow(1 + account.contributionGrowthRate, yearIndex);
      const contrib = account.useIrsMaxContribution && irsMax > 0 ? irsMax : grownContrib;

      // Salary and match
      const salaryFactor = Math.pow(1 + account.contributionGrowthRate, yearIndex);
      const effectiveSalary = account.annualSalary ? account.annualSalary * salaryFactor : null;

      let match = 0;
      let matchFormula = '';
      let matchNote = '';

      if (account.employerMatchPercent && account.employerMatchPercent > 0) {
        if (account.employerMatchLimitType === 'salary_percent' && effectiveSalary && account.employerMatchLimitPercent) {
          const cap = effectiveSalary * account.employerMatchLimitPercent;
          match = Math.min(contrib, cap) * account.employerMatchPercent;
          matchFormula = `min(${fmt(contrib)}, ${fmt(effectiveSalary)} × ${pct(account.employerMatchLimitPercent)}) × ${pct(account.employerMatchPercent)} = min(${fmt(contrib)}, ${fmt(cap)}) × ${pct(account.employerMatchPercent)}`;
          matchNote = yearIndex > 0
            ? `Salary grown from ${fmt(account.annualSalary!)} at ${pct(account.contributionGrowthRate)}/yr × ${yearIndex} yrs`
            : '';
        } else if (account.employerMatchLimit) {
          match = Math.min(contrib * account.employerMatchPercent, account.employerMatchLimit);
          matchFormula = `min(${fmt(contrib)} × ${pct(account.employerMatchPercent)}, ${fmt(account.employerMatchLimit)})`;
          matchNote = 'Dollar cap is fixed — same every year';
        }
      }

      const growth = (prevBal + contrib + match) * account.returnRate;

      return {
        account, prevBal, newBal,
        contrib, grownContrib, irsMax, irsBase,
        effectiveSalary, match, matchFormula, matchNote,
        growth,
      };
    });
  }, [isAccum, selectedAge, yearIndex, accounts, accumulation, countryConfig, assumptions]);

  // ── retirement snapshot for selected age ───────────────────────────────
  const retireSnap = useMemo(() => {
    if (!isRetired) return null;
    const yr = retirement.yearlyWithdrawals.find(y => y.age === selectedAge);
    if (!yr) return null;

    const filingStatus   = profile.filingStatus ?? 'single';
    const baseDeduction  = getStandardDeduction(filingStatus);
    const stdDeduction   = assumptions.adjustTaxBracketsForInflation !== false
      ? baseDeduction * inflFactor
      : baseDeduction;
    const effectiveRate  = yr.grossIncome > 0 ? yr.totalTax / yr.grossIncome : 0;

    // Initial spending target (year 1 of retirement)
    const yr1 = retirement.yearlyWithdrawals[0];
    const initialSpend = yr1?.targetSpending ?? 0;
    const retireInflFactor = Math.pow(1 + assumptions.inflationRate, retireYrIdx);

    return { yr, stdDeduction, effectiveRate, initialSpend, retireInflFactor, baseDeduction };
  }, [isRetired, selectedAge, retirement, profile, assumptions, inflFactor, retireYrIdx]);

  if (!accumulation.yearlyBalances.length) return null;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">

      {/* ── toggle button ── */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full px-4 py-3 flex justify-between items-center hover:bg-gray-50 dark:hover:bg-gray-750 rounded-t-lg"
      >
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          Show the math
        </div>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-4 pb-5 pt-2 space-y-6 border-t border-gray-100 dark:border-gray-700">

          {/* ── Year selector ── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Show calculations for:
              </span>
              <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">
                Age {selectedAge} · {calYear}
              </span>
            </div>

            <input
              type="range"
              min={profile.currentAge}
              max={profile.lifeExpectancy}
              step={1}
              value={selectedAge}
              onChange={e => setSelectedAge(Number(e.target.value))}
              className="w-full accent-blue-600"
            />

            <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500">
              <span>Age {profile.currentAge} (now)</span>
              <span>Age {profile.retirementAge} (retire)</span>
              <span>Age {profile.lifeExpectancy}</span>
            </div>

            {/* Context pill */}
            <div className={`inline-flex flex-wrap gap-2 text-xs font-medium px-3 py-1.5 rounded-full ${
              isAccum
                ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                : 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300'
            }`}>
              <span>{isAccum ? '📈 Accumulation phase' : '🏖 Retirement phase'}</span>
              <span>·</span>
              <span>{yearIndex === 0 ? 'today' : `${yearIndex} yr${yearIndex !== 1 ? 's' : ''} from now`}</span>
              <span>·</span>
              <span>Inflation × {fmtM(inflFactor)} ({pct(inflFactor - 1)} cumulative)</span>
            </div>
          </div>

          {/* ── Accumulation content ── */}
          {isAccum && accumSnap && (
            <>
              {/* Out-of-pocket breakdown for this year */}
              {(() => {
                const yr = accumulation.yearlyBalances.find(y => y.age === selectedAge);
                if (!yr) return null;
                const grossNet = yr.netLifeEventCost + yr.contributionReductionFromEvents; // gross expense − income
                const reduction = yr.contributionReductionFromEvents;
                const oop = yr.netLifeEventCost;
                if (grossNet === 0 && reduction === 0) return null;
                return (
                  <Card>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">💸 Life Event Cash Flow This Year</p>
                    {grossNet > 0 && (
                      <Row label="Gross life event expense" result={fmt(grossNet)} />
                    )}
                    {grossNet < 0 && (
                      <Row label="Life event income" result={`+${fmt(-grossNet)}`} />
                    )}
                    {reduction > 0 && (
                      <Row
                        label="− Covered by reduced contributions"
                        result={`(${fmt(reduction)})`}
                        note="Retirement savings redirected toward the expense — already reflected in the contribution columns above"
                      />
                    )}
                    <Divider />
                    <Row
                      label={oop > 0 ? 'True out-of-pocket (from income)' : 'Net income benefit'}
                      result={oop > 0 ? fmt(oop) : `+${fmt(-oop)}`}
                      note={oop > 0
                        ? 'Extra cash needed from salary/savings beyond normal retirement contributions'
                        : 'Life event income more than covers any expenses this year'}
                    />
                  </Card>
                );
              })()}

              <Section title={`💰 Contributions & Match — Age ${selectedAge} (${calYear})`}>
                {accumSnap.map(({ account, contrib, grownContrib, irsMax, irsBase, effectiveSalary, match, matchFormula, matchNote }) => (
                  <Card key={account.id}>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {account.name}
                      <span className="ml-2 text-xs font-normal text-gray-400 dark:text-gray-500">
                        {getTaxTreatment(account.type)}
                      </span>
                    </p>

                    {account.useIrsMaxContribution && irsBase > 0 ? (
                      <Row
                        label={`${irsLabel} max in ${calYear}`}
                        formula={`${fmt(irsBase)} × (1 + ${pct(assumptions.inflationRate)})^${yearIndex} → rounded to $500`}
                        result={fmt(irsMax)}
                      />
                    ) : (
                      <Row
                        label="Contribution this year"
                        formula={yearIndex > 0
                          ? `${fmt(account.annualContribution)} × (1 + ${pct(account.contributionGrowthRate)})^${yearIndex}`
                          : undefined}
                        result={fmt(grownContrib)}
                        note={yearIndex > 0 ? `Started at ${fmt(account.annualContribution)}/yr, grown at ${pct(account.contributionGrowthRate)}/yr` : undefined}
                      />
                    )}

                    {account.employerMatchPercent && account.employerMatchPercent > 0 && (
                      <>
                        {account.employerMatchLimitType === 'salary_percent' && account.annualSalary && account.employerMatchLimitPercent && effectiveSalary ? (
                          <Row
                            label={`Salary in ${calYear}`}
                            formula={yearIndex > 0
                              ? `${fmt(account.annualSalary)} × (1 + ${pct(account.contributionGrowthRate)})^${yearIndex}`
                              : undefined}
                            result={fmt(effectiveSalary)}
                            note={matchNote}
                          />
                        ) : null}

                        <Row
                          label="Employer match"
                          formula={matchFormula}
                          result={match > 0 ? fmt(match) : '—'}
                          note={match === 0 && !matchFormula ? 'Enter match cap to calculate' : undefined}
                        />
                      </>
                    )}

                    {match > 0 && (
                      <>
                        <Divider />
                        <Row label="Total going in" result={fmt(contrib + match)} />
                      </>
                    )}
                  </Card>
                ))}
              </Section>

              <Section title={`📈 Balance Walk-through — Age ${selectedAge}`}>
                {(() => {
                  const yr = accumulation.yearlyBalances.find(y => y.age === selectedAge);
                  const oop = yr?.netLifeEventCost ?? 0;
                  return (
                    <>
                      {accumSnap.map(({ account, prevBal, contrib, match, growth, newBal }) => (
                        <Card key={account.id}>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">{account.name}</p>
                          <Row label="Starting balance" result={fmt(prevBal)} />
                          <Row label="+ Your contribution" result={fmt(contrib)} />
                          {match > 0 && <Row label="+ Employer match" result={fmt(match)} />}
                          <Row
                            label={`× ${pct(account.returnRate)} investment return`}
                            formula={`(${fmt(prevBal)} + ${fmt(contrib)}${match > 0 ? ` + ${fmt(match)}` : ''}) × ${pct(account.returnRate)}`}
                            result={fmt(growth)}
                          />
                          <Divider />
                          <Row label="End-of-year balance" result={fmt(newBal)} />
                        </Card>
                      ))}
                      {oop !== 0 && (
                        <Card>
                          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">💸 True Out-of-Pocket</p>
                          <Row
                            label={oop > 0 ? 'Extra cash from income/savings' : 'Net income benefit'}
                            result={oop > 0 ? fmt(oop) : `+${fmt(-oop)}`}
                            note={yr && yr.contributionReductionFromEvents > 0
                              ? `${fmt(yr.contributionReductionFromEvents)} of the expense was covered by reduced contributions (shown above)`
                              : 'All paid from income/savings; retirement contributions unchanged'}
                          />
                        </Card>
                      )}
                    </>
                  );
                })()}
              </Section>
            </>
          )}

          {/* ── Retirement content ── */}
          {isRetired && retireSnap && (
            <>
              <Section title={`🎯 Spending Target — Age ${selectedAge} (${calYear})`}>
                <Card>
                  <Row
                    label="Year-1 retirement spend"
                    result={fmt(retireSnap.initialSpend)}
                    note={`Set at age ${profile.retirementAge} based on ${assumptions.spendingMode === 'goal' ? 'spending goal' : 'portfolio × SWR'}`}
                  />
                  {retireYrIdx > 0 && (
                    <Row
                      label={`× ${retireYrIdx} yrs of inflation`}
                      formula={`${fmt(retireSnap.initialSpend)} × (1 + ${pct(assumptions.inflationRate)})^${retireYrIdx}`}
                      result={fmt(retireSnap.initialSpend * retireSnap.retireInflFactor)}
                    />
                  )}
                  <Divider />
                  <Row label="Target spending this year" result={fmt(retireSnap.yr.targetSpending)} />
                </Card>
              </Section>

              <Section title={`🧾 Tax Breakdown — Age ${selectedAge} (${calYear})`}>
                <Card>
                  <Row label="Portfolio withdrawal" result={fmt(retireSnap.yr.totalWithdrawal)} />
                  <Row label="+ Government benefits" result={fmt(retireSnap.yr.governmentBenefitIncome)} />
                  {retireSnap.yr.incomeStreamIncome > 0 && (
                    <Row label="+ Income streams" result={fmt(retireSnap.yr.incomeStreamIncome)} />
                  )}
                  <Row label="Gross income" result={fmt(retireSnap.yr.grossIncome)} />
                  <Divider />
                  <Row
                    label="− Standard deduction"
                    result={`(${fmt(retireSnap.stdDeduction)})`}
                    note={assumptions.adjustTaxBracketsForInflation !== false
                      ? `${fmt(retireSnap.baseDeduction)} base × ${fmtM(inflFactor)} inflation factor = ${fmt(retireSnap.stdDeduction)}`
                      : `Fixed at ${fmt(retireSnap.stdDeduction)} (bracket indexing off)`}
                  />
                  <Divider />
                  <Row label="Federal tax" result={fmt(retireSnap.yr.federalTax)} />
                  <Row
                    label="State tax"
                    result={fmt(retireSnap.yr.stateTax)}
                    note={profile.stateTaxRate ? `${pct(profile.stateTaxRate)} flat rate` : undefined}
                  />
                  {retireSnap.yr.totalPenalties > 0 && (
                    <Row label="Early withdrawal penalties" result={fmt(retireSnap.yr.totalPenalties)} />
                  )}
                  <Row label="Total tax" result={fmt(retireSnap.yr.totalTax)} />
                  <Divider />
                  <Row
                    label="Effective tax rate"
                    result={pct(retireSnap.effectiveRate)}
                    note="Total tax ÷ gross income"
                  />
                  <Row label="After-tax income" result={fmt(retireSnap.yr.afterTaxIncome)} />
                  <Row label="Remaining portfolio" result={fmt(retireSnap.yr.totalRemainingBalance)} />
                </Card>
              </Section>
            </>
          )}

          {/* ── What grows ── */}
          <Section title="📋 What grows and what doesn't">
            <div className="space-y-1 text-sm">
              {[
                { label: 'Your contributions',            grows: true,  how: `Contribution growth rate · ${pct(accounts[0]?.contributionGrowthRate ?? 0.03)}/yr` },
                { label: `${irsLabel} contribution limit`, grows: true,  how: `Inflation (${pct(assumptions.inflationRate)}/yr) · rounded to $500` },
                { label: 'Salary for % match cap',        grows: true,  how: 'Contribution growth rate — salary and contributions move together' },
                { label: 'Dollar match cap',              grows: false, how: 'Fixed nominal amount you entered' },
                { label: 'Retirement spending target',    grows: true,  how: `Inflation (${pct(assumptions.inflationRate)}/yr) each retirement year` },
                { label: 'Social Security / gov\'t benefits', grows: true,  how: `Inflation (${pct(assumptions.inflationRate)}/yr)` },
                { label: 'Income streams',                grows: true,  how: `Inflation (${pct(assumptions.inflationRate)}/yr)` },
                { label: 'Life events (inflation on)',    grows: true,  how: `Inflation (${pct(assumptions.inflationRate)}/yr)` },
                { label: 'Life events (inflation off)',   grows: false, how: 'Fixed amount you entered' },
                {
                  label: 'Tax bracket thresholds',
                  grows: assumptions.adjustTaxBracketsForInflation !== false,
                  how: assumptions.adjustTaxBracketsForInflation !== false
                    ? `Inflation (${pct(assumptions.inflationRate)}/yr) — on`
                    : 'Static 2026 brackets — toggle in Assumptions',
                },
              ].map(({ label, grows, how }) => (
                <div key={label} className="flex items-start gap-2">
                  <span className={`mt-0.5 text-xs font-bold flex-shrink-0 w-4 ${grows ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
                    {grows ? '↑' : '—'}
                  </span>
                  <span className="text-gray-700 dark:text-gray-300 min-w-[220px]">{label}</span>
                  <span className="text-gray-400 dark:text-gray-500 text-xs">{how}</span>
                </div>
              ))}
            </div>
          </Section>

          {/* ── Assumptions ── */}
          <Section title="⚙️ Assumptions in Use">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                ['Inflation rate', pct(assumptions.inflationRate)],
                ['Retirement return', pct(assumptions.retirementReturnRate)],
                ['Spending mode', assumptions.spendingMode === 'goal' ? 'Goal-driven' : 'SWR'],
                assumptions.spendingMode !== 'goal'
                  ? ['Safe withdrawal rate', pct(assumptions.safeWithdrawalRate)]
                  : ['Spending goal', fmt(assumptions.annualSpendingGoal ?? 0)],
                ['Tax brackets indexed', assumptions.adjustTaxBracketsForInflation !== false ? 'Yes' : 'No'],
                ['Years to retirement', String(yearsToRetirement)],
              ].map(([label, value]) => (
                <div key={label} className="bg-gray-50 dark:bg-gray-700/40 rounded p-2">
                  <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-white">{value}</div>
                </div>
              ))}
            </div>
          </Section>

        </div>
      )}
    </div>
  );
}
