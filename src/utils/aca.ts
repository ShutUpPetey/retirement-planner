import {
  Profile,
  Assumptions,
  IncomeStream,
  ACAAnalysis,
  ACAYear,
  RothConversionLadder,
} from '../types';
import { federalPovertyLevel } from '../data/fpl';

const MEDICARE_AGE = 65;

/**
 * ACA "applicable percentage" — the share of MAGI a household is expected to pay
 * toward the benchmark (second-lowest silver) plan, under the ARPA/IRA-enhanced
 * schedule currently in effect through the 2025 coverage year. Premium tax credits
 * cover the benchmark premium above this amount.
 *
 * Piecewise-linear in % of FPL: 0% at/below 150% FPL, rising to 8.5% at 400% FPL,
 * and capped at 8.5% above 400% (no "subsidy cliff" while ARPA caps are in force).
 */
export function acaApplicablePercentage(fplMultiple: number): number {
  const x = fplMultiple;
  if (x <= 1.5) return 0;
  if (x <= 2.0) return lerp(x, 1.5, 2.0, 0.0, 0.02);
  if (x <= 2.5) return lerp(x, 2.0, 2.5, 0.02, 0.04);
  if (x <= 3.0) return lerp(x, 2.5, 3.0, 0.04, 0.06);
  if (x <= 4.0) return lerp(x, 3.0, 4.0, 0.06, 0.085);
  return 0.085;
}

function lerp(x: number, x0: number, x1: number, y0: number, y1: number): number {
  return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
}

/**
 * Models ACA premium tax credits across the pre-Medicare retirement years (US only).
 *
 * MAGI each year is estimated from income streams and benefits, plus any Roth
 * conversion suggested for that year (conversions raise MAGI and can erode subsidies —
 * the key interaction with the Roth conversion ladder). Note: for ACA, Social Security
 * counts at 100% toward MAGI (unlike income tax, which taxes at most 85%); Roth
 * *distributions* do NOT count.
 *
 * Subsidy dollars require a benchmark premium, which varies widely by age/location.
 * We use an editable assumption (acaBenchmarkPremium) so the figure is meaningful but
 * clearly the user's to refine.
 */
export function calculateACA(
  profile: Profile,
  assumptions: Assumptions,
  incomeStreams: IncomeStream[] = [],
  rothLadder?: RothConversionLadder,
): ACAAnalysis {
  const householdSize = profile.householdSize ?? (profile.filingStatus === 'married_filing_jointly' ? 2 : 1);
  const fpl = federalPovertyLevel(householdSize);
  const benchmarkPremium = assumptions.acaBenchmarkPremium ?? householdSize * 9000;

  const empty: ACAAnalysis = {
    relevant: false,
    householdSize,
    fpl,
    benchmarkPremium,
    cliffMagi: fpl * 4,
    medicaidMagi: fpl * 1.38,
    years: [],
  };

  if (profile.country !== 'US') return empty;
  if (profile.retirementAge >= MEDICARE_AGE) return empty;

  const conversionByAge = new Map<number, number>();
  if (rothLadder?.relevant) {
    for (const y of rothLadder.years) conversionByAge.set(y.age, y.conversionAmount);
  }

  const years: ACAYear[] = [];
  for (let age = profile.retirementAge; age < MEDICARE_AGE; age++) {
    // Base MAGI: income streams + benefits. SS counts at 100% for ACA MAGI.
    let magi = 0;
    for (const s of incomeStreams) {
      const active = age >= s.startAge && (s.endAge == null || age <= s.endAge);
      if (!active) continue;
      const annual = s.monthlyAmount * 12;
      if (s.taxTreatment === 'tax_free') continue; // e.g. Roth-style / VA — excluded
      magi += annual; // social_security counts fully for ACA; pensions/other fully taxable
    }
    magi += conversionByAge.get(age) ?? 0;

    const fplPercent = fpl > 0 ? magi / fpl : 0;
    const expectedContributionPct = acaApplicablePercentage(fplPercent);
    const expectedContribution = expectedContributionPct * magi;
    const estimatedSubsidy = Math.max(0, benchmarkPremium - expectedContribution);

    years.push({
      age,
      year: new Date().getFullYear() + (age - profile.currentAge),
      magi,
      fplPercent,
      expectedContributionPct,
      expectedContribution,
      estimatedSubsidy,
      cliffRisk: fplPercent > 4.0,
    });
  }

  if (years.length === 0) return empty;

  return {
    relevant: true,
    householdSize,
    fpl,
    benchmarkPremium,
    cliffMagi: fpl * 4,
    medicaidMagi: fpl * 1.38,
    years,
  };
}
