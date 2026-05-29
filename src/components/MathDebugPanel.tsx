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

const fmt  = (v: number) => v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const pct  = (v: number) => `${(v * 100).toFixed(1)}%`;
const fmtN = (v: number, d = 0) => v.toLocaleString('en-US', { maximumFractionDigits: d });

// ── helpers ──────────────────────────────────────────────────────────────────

function getIrsLimit(account: Account, countryConfig: CountryConfig): number {
  const raw = countryConfig.getContributionLimits()[account.type];
  if (!raw) return 0;
  return typeof raw === 'number' ? raw : (raw.annual ?? raw.max ?? 0);
}

function computeMatch(account: Account, effectiveContrib: number): number {
  if (!account.employerMatchPercent) return 0;
  if (account.employerMatchLimitType === 'salary_percent') {
    if (!account.annualSalary || !account.employerMatchLimitPercent) return 0;
    return Math.min(effectiveContrib, account.annualSalary * account.employerMatchLimitPercent)
      * account.employerMatchPercent;
  }
  if (!account.employerMatchLimit) return 0;
  return Math.min(effectiveContrib * account.employerMatchPercent, account.employerMatchLimit);
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

function FormulaRow({ label, formula, result, note, indent = false }: {
  label: string; formula?: string; result: string; note?: string; indent?: boolean;
}) {
  return (
    <div className={`flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm ${indent ? 'ml-4' : ''}`}>
      <span className="text-gray-500 dark:text-gray-400 min-w-[170px]">{label}</span>
      {formula && <span className="text-gray-400 dark:text-gray-500 font-mono text-xs">{formula}</span>}
      <span className="font-semibold text-gray-900 dark:text-white ml-auto">{result}</span>
      {note && <span className="w-full ml-0 text-xs text-gray-400 dark:text-gray-500">{note}</span>}
    </div>
  );
}

function Divider() {
  return <hr className="border-gray-100 dark:border-gray-700" />;
}

// ── main component ────────────────────────────────────────────────────────────

export function MathDebugPanel({
  accounts, profile, assumptions, incomeStreams: _incomeStreams,
  accumulation, retirement, countryConfig,
}: MathDebugPanelProps) {
  const [open, setOpen] = useState(false);

  const irsLimitLabel = profile.country === 'CA' ? 'CRA limit' : 'IRS limit';
  const yearsToRetirement = Math.max(0, profile.retirementAge - profile.currentAge);
  const inflationAtRetirement = Math.pow(1 + assumptions.inflationRate, yearsToRetirement);

  // ── Section 1: per-account contribution & match ──────────────────────────
  const accountDetails = useMemo(() => accounts.map(account => {
    const irsBase = getIrsLimit(account, countryConfig);
    const effectiveContrib = account.useIrsMaxContribution && irsBase > 0 ? irsBase : account.annualContribution;
    const match = computeMatch(account, effectiveContrib);
    const hasMatch = match > 0;
    const total = effectiveContrib + match;
    const isMaxed = !!account.useIrsMaxContribution && irsBase > 0;
    const isSalaryPct = account.employerMatchLimitType === 'salary_percent';

    let matchFormula = '';
    if (account.employerMatchPercent && (account.employerMatchLimit || (isSalaryPct && account.annualSalary && account.employerMatchLimitPercent))) {
      if (isSalaryPct) {
        const cap = (account.annualSalary! * account.employerMatchLimitPercent!);
        matchFormula = `min(${fmt(effectiveContrib)}, ${fmt(account.annualSalary!)} × ${pct(account.employerMatchLimitPercent!)}) × ${pct(account.employerMatchPercent)} = min(${fmt(effectiveContrib)}, ${fmt(cap)}) × ${pct(account.employerMatchPercent)}`;
      } else {
        matchFormula = `min(${fmt(effectiveContrib)} × ${pct(account.employerMatchPercent)}, ${fmt(account.employerMatchLimit!)}) = min(${fmt(effectiveContrib * account.employerMatchPercent)}, ${fmt(account.employerMatchLimit!)})`;
      }
    }

    const treatLabel: Record<string, string> = {
      pretax: 'Pre-tax', roth: 'Roth', taxable: 'Taxable', hsa: 'HSA',
    };

    return { account, effectiveContrib, match, hasMatch, total, isMaxed, matchFormula, irsBase, treatLabel };
  }), [accounts, countryConfig]);

  // ── Section 2: year-1 accumulation walk-through ───────────────────────────
  const yr1 = useMemo(() => {
    if (!accumulation.yearlyBalances[1]) return null;
    const yr = accumulation.yearlyBalances[1];

    return accounts.map(acct => {
      const prevBal = accumulation.yearlyBalances[0]?.balances[acct.id] ?? acct.balance;
      const newBal  = yr.balances[acct.id] ?? 0;
      const irsBase = getIrsLimit(acct, countryConfig);
      const contrib  = acct.useIrsMaxContribution && irsBase > 0 ? irsBase : acct.annualContribution;
      const match    = computeMatch(acct, contrib);
      const growth   = (prevBal + contrib + match) * acct.returnRate;
      return { acct, prevBal, contrib, match, growth, newBal };
    });
  }, [accounts, accumulation, countryConfig]);

  // ── Section 3: retirement spending target ────────────────────────────────
  const spendingMath = useMemo(() => {
    const isGoal = assumptions.spendingMode === 'goal';
    const totalAtRetirement = accumulation.totalAtRetirement;
    if (isGoal && assumptions.annualSpendingGoal) {
      const nominalAtRetirement = assumptions.annualSpendingGoal * inflationAtRetirement;
      return {
        mode: 'goal' as const,
        goal: assumptions.annualSpendingGoal,
        nominalAtRetirement,
        inflationAtRetirement,
      };
    }
    return {
      mode: 'swr' as const,
      totalAtRetirement,
      swr: assumptions.safeWithdrawalRate,
      annualSpend: totalAtRetirement * assumptions.safeWithdrawalRate,
    };
  }, [assumptions, accumulation, inflationAtRetirement]);

  // ── Section 4: year-1 retirement tax breakdown ────────────────────────────
  const retireTax1 = useMemo(() => {
    const yr = retirement.yearlyWithdrawals[0];
    if (!yr) return null;

    const filingStatus = profile.filingStatus ?? 'single';
    const stdDeduction = getStandardDeduction(filingStatus);
    const ordinaryIncome = yr.totalWithdrawal * 0.8 + yr.governmentBenefitIncome * 0.85 + yr.incomeStreamIncome * 0.85;
    const taxableOrdinary = Math.max(0, ordinaryIncome - stdDeduction);
    const fedTax = yr.federalTax;
    const stateTax = yr.stateTax;
    const effectiveRate = yr.grossIncome > 0 ? yr.totalTax / yr.grossIncome : 0;

    return { yr, stdDeduction, taxableOrdinary, fedTax, stateTax, effectiveRate, ordinaryIncome };
  }, [retirement, profile]);

  if (!accumulation.yearlyBalances.length) return null;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
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
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-4 pb-5 pt-1 space-y-5 border-t border-gray-100 dark:border-gray-700">

          {/* ── 1. Contributions & match ── */}
          <Section title="💰 Contributions & Employer Match (current year)">
            {accountDetails.map(({ account, effectiveContrib, match, hasMatch, total, isMaxed, matchFormula, irsBase, treatLabel }) => (
              <div key={account.id} className="space-y-1 bg-gray-50 dark:bg-gray-700/40 rounded-md p-3">
                <p className="text-sm font-medium text-gray-900 dark:text-white mb-2">
                  {account.name}
                  <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">
                    ({treatLabel[getTaxTreatment(account.type)] ?? getTaxTreatment(account.type)})
                  </span>
                </p>

                <FormulaRow
                  label="Your contribution"
                  result={fmt(effectiveContrib)}
                  note={isMaxed
                    ? `${irsLimitLabel} max (${fmt(irsBase)}) — grows with inflation each year`
                    : undefined}
                />

                {hasMatch ? (
                  <>
                    <FormulaRow
                      label="Employer match"
                      formula={matchFormula}
                      result={fmt(match)}
                    />
                    <Divider />
                    <FormulaRow
                      label="Total into account"
                      result={fmt(total)}
                    />
                  </>
                ) : (
                  !account.employerMatchPercent ? (
                    <FormulaRow label="Employer match" result="—" note="Not applicable for this account type" />
                  ) : (
                    <FormulaRow label="Employer match" result={fmt(0)} note="Fill in match cap to calculate" />
                  )
                )}
              </div>
            ))}
          </Section>

          {/* ── 2. Year-1 growth walk-through ── */}
          {yr1 && (
            <Section title="📈 Year 1 Growth Walk-through (age {profile.currentAge} → {profile.currentAge + 1})">
              {yr1.map(({ acct, prevBal, contrib, match, growth, newBal }) => (
                <div key={acct.id} className="space-y-1 bg-gray-50 dark:bg-gray-700/40 rounded-md p-3">
                  <p className="text-sm font-medium text-gray-900 dark:text-white mb-2">{acct.name}</p>
                  <FormulaRow label="Starting balance" result={fmt(prevBal)} />
                  <FormulaRow label="+ Your contribution" result={fmt(contrib)} />
                  {match > 0 && <FormulaRow label="+ Employer match" result={fmt(match)} />}
                  <FormulaRow
                    label={`× ${pct(acct.returnRate)} return`}
                    formula={`(${fmt(prevBal)} + ${fmt(contrib)}${match > 0 ? ` + ${fmt(match)}` : ''}) × ${pct(acct.returnRate)}`}
                    result={fmt(growth)}
                  />
                  <Divider />
                  <FormulaRow label="End of year balance" result={fmt(newBal)} />
                </div>
              ))}
            </Section>
          )}

          {/* ── 3. Retirement spending target ── */}
          <Section title="🎯 Retirement Spending Target">
            {spendingMath.mode === 'goal' ? (
              <div className="space-y-1 bg-gray-50 dark:bg-gray-700/40 rounded-md p-3">
                <FormulaRow
                  label="Spending goal today"
                  result={fmt(spendingMath.goal)}
                />
                <FormulaRow
                  label={`× inflation over ${yearsToRetirement} yrs`}
                  formula={`× (1 + ${pct(assumptions.inflationRate)})^${yearsToRetirement}`}
                  result={`× ${fmtN(spendingMath.inflationAtRetirement, 3)}`}
                />
                <Divider />
                <FormulaRow
                  label="Year-1 retirement spend"
                  result={fmt(spendingMath.nominalAtRetirement)}
                  note="Grows with inflation each subsequent year"
                />
              </div>
            ) : (
              <div className="space-y-1 bg-gray-50 dark:bg-gray-700/40 rounded-md p-3">
                <FormulaRow
                  label="Portfolio at retirement"
                  result={fmt(spendingMath.totalAtRetirement)}
                />
                <FormulaRow
                  label={`× ${pct(spendingMath.swr)} withdrawal rate`}
                  formula={`${fmt(spendingMath.totalAtRetirement)} × ${pct(spendingMath.swr)}`}
                  result={fmt(spendingMath.annualSpend)}
                />
                <Divider />
                <FormulaRow
                  label="Year-1 retirement spend"
                  result={fmt(spendingMath.annualSpend)}
                  note="Grows with inflation each subsequent year"
                />
              </div>
            )}
          </Section>

          {/* ── 4. Year-1 retirement tax breakdown ── */}
          {retireTax1 && (
            <Section title={`🧾 Tax Calculation — Age ${profile.retirementAge} (Year 1 of Retirement)`}>
              <div className="space-y-1 bg-gray-50 dark:bg-gray-700/40 rounded-md p-3">
                <FormulaRow label="Portfolio withdrawal" result={fmt(retireTax1.yr.totalWithdrawal)} />
                <FormulaRow label="+ Government benefits" result={fmt(retireTax1.yr.governmentBenefitIncome)} />
                {retireTax1.yr.incomeStreamIncome > 0 && (
                  <FormulaRow label="+ Income streams" result={fmt(retireTax1.yr.incomeStreamIncome)} />
                )}
                <FormulaRow
                  label="Gross income"
                  result={fmt(retireTax1.yr.grossIncome)}
                />
                <Divider />
                <FormulaRow
                  label="− Standard deduction"
                  result={`(${fmt(retireTax1.stdDeduction)})`}
                  note={`${profile.filingStatus === 'married_filing_jointly' ? 'MFJ' : 'Single'} · inflation-indexed in projections`}
                />
                <FormulaRow
                  label="≈ Taxable ordinary income"
                  result={fmt(retireTax1.taxableOrdinary)}
                />
                <Divider />
                <FormulaRow label="Federal tax" result={fmt(retireTax1.fedTax)} />
                <FormulaRow
                  label="State tax"
                  result={fmt(retireTax1.stateTax)}
                  note={profile.stateTaxRate ? `${pct(profile.stateTaxRate)} flat rate` : undefined}
                />
                <FormulaRow label="Total tax" result={fmt(retireTax1.yr.totalTax)} />
                <Divider />
                <FormulaRow
                  label="Effective tax rate"
                  result={pct(retireTax1.effectiveRate)}
                  note="Total tax ÷ gross income"
                />
                <FormulaRow label="After-tax income" result={fmt(retireTax1.yr.afterTaxIncome)} />
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Note: Exact bracket amounts vary by account mix withdrawn. Numbers shown are an approximation of the blended ordinary income; actual per-bracket detail is in the Retirement Phase tab.
              </p>
            </Section>
          )}

          {/* ── Assumptions reference ── */}
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
