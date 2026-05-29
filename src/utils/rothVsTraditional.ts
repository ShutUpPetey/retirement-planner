import { Profile, Assumptions, RetirementResult, RothAdvice } from '../types';
import type { CountryConfig } from '../countries';

/**
 * Roth vs Traditional contribution guidance.
 *
 * The core idea: a dollar put into a TRADITIONAL account is deducted at your
 * CURRENT marginal tax rate and taxed at your marginal rate when WITHDRAWN in
 * retirement. A dollar put into a ROTH account is taxed now and never again.
 *
 *   current rate  >  retirement rate  ->  favor TRADITIONAL (deduct high, withdraw low)
 *   current rate  <  retirement rate  ->  favor ROTH        (pay low now, withdraw tax-free)
 *   roughly equal                     ->  MIXED / Roth lean (flexibility, no RMDs, rate hedge)
 */

// If the two marginal rates are within this band, treat them as "about the same".
const TIE_THRESHOLD = 0.02;

/**
 * Combined marginal tax rate at a given gross income, computed numerically so it
 * works across country tax engines (US federal brackets, Canadian federal +
 * provincial brackets). US flat state rate is added on top when present.
 */
function combinedMarginalRate(
  grossIncome: number,
  profile: Profile,
  countryConfig: CountryConfig
): number {
  const eps = 100;
  const income = Math.max(0, grossIncome);

  const fedMarginal =
    (countryConfig.calculateFederalTax(income + eps, profile.filingStatus) -
      countryConfig.calculateFederalTax(income, profile.filingStatus)) /
    eps;

  const regMarginal =
    (countryConfig.calculateRegionalTax(income + eps, profile.region) -
      countryConfig.calculateRegionalTax(income, profile.region)) /
    eps;

  // US handles state tax as a flat rate on the Profile; CA bakes it into regional brackets.
  const usStateFlat = countryConfig.code === 'US' ? profile.stateTaxRate ?? 0 : 0;

  return fedMarginal + regMarginal + usStateFlat;
}

/** Estimate ordinary gross income in early retirement from the model output. */
function estimateRetirementIncome(
  retirement: RetirementResult,
  assumptions: Assumptions
): number {
  const years = retirement.yearlyWithdrawals;
  if (years && years.length > 0) {
    // Use the first retirement year that actually has income/withdrawals.
    const firstActive = years.find(y => y.grossIncome > 0) ?? years[0];
    if (firstActive && firstActive.grossIncome > 0) {
      return firstActive.grossIncome;
    }
  }
  return assumptions.annualSpendingGoal ?? 60000;
}

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

export function getRothVsTraditionalAdvice(
  profile: Profile,
  assumptions: Assumptions,
  countryConfig: CountryConfig,
  retirement: RetirementResult
): RothAdvice {
  const currentIncome = profile.annualIncome ?? 0;

  if (!currentIncome || currentIncome <= 0) {
    return {
      available: false,
      recommendation: 'mixed',
      currentMarginalRate: 0,
      retirementMarginalRate: 0,
      currentTaxableIncome: 0,
      retirementTaxableIncome: 0,
      headline: 'Enter your current annual income to get a recommendation.',
      reasoning: [
        'The Roth vs Traditional decision depends on your tax rate now compared to in retirement.',
        'Add your current annual income in the Personal Profile section to enable this analysis.',
      ],
      caveats: [],
    };
  }

  const retirementIncome = estimateRetirementIncome(retirement, assumptions);

  const currentMarginalRate = combinedMarginalRate(currentIncome, profile, countryConfig);
  const retirementMarginalRate = combinedMarginalRate(retirementIncome, profile, countryConfig);

  const diff = currentMarginalRate - retirementMarginalRate;

  let recommendation: RothAdvice['recommendation'];
  let headline: string;
  const reasoning: string[] = [];

  if (diff > TIE_THRESHOLD) {
    recommendation = 'traditional';
    headline = 'Lean Traditional (pre-tax) for most contributions.';
    reasoning.push(
      `Your current marginal tax rate (~${pct(currentMarginalRate)}) is higher than your estimated rate in retirement (~${pct(
        retirementMarginalRate
      )}).`,
      'Traditional contributions deduct taxes now at your higher rate and are taxed later at your lower rate — a net win.',
      'Tip: still hold some Roth for tax diversification and flexibility (see caveats).'
    );
  } else if (diff < -TIE_THRESHOLD) {
    recommendation = 'roth';
    headline = 'Lean Roth (after-tax) for most contributions.';
    reasoning.push(
      `Your current marginal tax rate (~${pct(currentMarginalRate)}) is lower than your estimated rate in retirement (~${pct(
        retirementMarginalRate
      )}).`,
      'Paying tax now at your lower rate means tax-free withdrawals later when your rate would be higher.',
      'Roth also grows tax-free and (in the US) has no Required Minimum Distributions.'
    );
  } else {
    recommendation = 'mixed';
    headline = 'A mix of both — with a slight Roth lean.';
    reasoning.push(
      `Your current (~${pct(currentMarginalRate)}) and estimated retirement (~${pct(
        retirementMarginalRate
      )}) marginal rates are close.`,
      'When rates are similar, splitting contributions hedges your bets and gives you flexibility to manage taxable income in retirement.',
      'A slight Roth lean is reasonable given tax-rate uncertainty and (in the US) no RMDs on Roth.'
    );
  }

  const caveats: string[] = [
    'Always capture your full employer match first — that match goes into a pre-tax (Traditional) account regardless.',
    'This compares marginal rates only; it does not model Roth conversions, IRMAA, ACA subsidies, or state-of-residence changes in retirement.',
    'Your estimated retirement income is derived from this plan’s projected first-year retirement income; adjust your inputs to refine it.',
    'Tax brackets used are 2024 values and are not inflation-adjusted in this tool.',
  ];

  return {
    available: true,
    recommendation,
    currentMarginalRate,
    retirementMarginalRate,
    currentTaxableIncome: currentIncome,
    retirementTaxableIncome: retirementIncome,
    headline,
    reasoning,
    caveats,
  };
}
