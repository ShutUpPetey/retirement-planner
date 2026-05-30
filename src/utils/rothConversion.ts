import {
  Account,
  Profile,
  Assumptions,
  IncomeStream,
  AccumulationResult,
  RothConversionLadder,
  ConversionYear,
  getTaxTreatment,
} from '../types';
import { calculateFederalIncomeTax, getStandardDeduction } from './taxes';
import { RMD_START_AGE, getRMDDivisor } from './constants';

// Top of the 12% ordinary-income bracket (taxable income, 2024 figures), matching
// the values used by the withdrawal optimizer in withdrawals.ts.
const BRACKET_12_TOP_MFJ = 94300;
const BRACKET_12_TOP_SINGLE = 47150;

/**
 * Roth conversion ladder for early retirees (US only).
 *
 * During the low-income window between retiring and when RMDs/Social Security push
 * ordinary income up, converting traditional -> Roth "fills" the cheap tax brackets:
 * you pay tax now at a low rate to shrink future RMDs (taxed at potentially higher
 * rates) and build a tax-free Roth balance.
 *
 * Window: retirement age up to the earlier of Social Security start and RMD age. This
 * is the genuinely low-ordinary-income stretch where conversions are cheapest. (The
 * 5-year seasoning rule for converted principal is noted in the UI but not separately
 * modeled here.)
 *
 * Base ordinary income each year is estimated from taxable benefits and income streams
 * only — in true gap years the spending draw typically comes from Roth/taxable/cash, so
 * ordinary income is low and most of the bracket is open for conversions. This is a
 * deliberately conservative, self-contained estimate; it does not re-run the full
 * withdrawal waterfall.
 */
export function calculateRothConversionLadder(
  accounts: Account[],
  profile: Profile,
  assumptions: Assumptions,
  incomeStreams: IncomeStream[] = [],
  accumulationResult?: AccumulationResult,
): RothConversionLadder {
  const filingStatus = profile.filingStatus ?? 'single';
  const empty: RothConversionLadder = {
    relevant: false,
    startAge: profile.retirementAge,
    endAge: profile.retirementAge,
    fillBracketRate: 0.12,
    fillBracketLabel: '12%',
    years: [],
    totalConverted: 0,
    totalTaxCost: 0,
    blendedRate: 0,
    rmdReductionEstimate: 0,
  };

  // US-only: Canada's registered accounts don't have an equivalent conversion play here.
  if (profile.country !== 'US') return empty;

  // Traditional (pre-tax) balance available to convert, projected to retirement age.
  const retirementYearData = accumulationResult?.yearlyBalances.find(
    (y) => y.age === profile.retirementAge,
  );
  const balanceAt = (a: Account) =>
    retirementYearData ? retirementYearData.balances[a.id] ?? 0 : a.balance;

  let traditionalBalance = 0;
  for (const a of accounts) {
    if (getTaxTreatment(a.type) === 'pretax') traditionalBalance += balanceAt(a);
  }
  if (traditionalBalance <= 0) return empty;

  // Conversion window: retirement -> min(SS start, RMD age).
  const ssStart = incomeStreams
    .filter((s) => s.taxTreatment === 'social_security')
    .reduce<number | null>((min, s) => (min === null ? s.startAge : Math.min(min, s.startAge)), null);
  const windowEnd = Math.min(ssStart ?? RMD_START_AGE, RMD_START_AGE);
  const startAge = profile.retirementAge;
  const endAge = windowEnd - 1; // last full low-income year before income ramps up
  if (endAge < startAge) return empty;

  const inflation = assumptions.inflationRate ?? 0.03;
  const stdDeduction = getStandardDeduction(filingStatus);
  const bracket12Top = filingStatus === 'married_filing_jointly' ? BRACKET_12_TOP_MFJ : BRACKET_12_TOP_SINGLE;
  // Gross ordinary income ceiling that keeps taxable income within the 12% bracket.
  const fillCeiling = stdDeduction + bracket12Top;

  const currentYear = new Date().getFullYear();
  const yearsToRetirement = profile.retirementAge - profile.currentAge;

  const years: ConversionYear[] = [];
  let remainingTraditional = traditionalBalance;
  let cumulative = 0;

  for (let age = startAge; age <= endAge; age++) {
    if (remainingTraditional <= 0) break;

    // Base ordinary income that year (today's dollars): taxable benefits + streams.
    let baseOrdinary = 0;
    for (const s of incomeStreams) {
      const active = age >= s.startAge && (s.endAge == null || age <= s.endAge);
      if (!active) continue;
      const annual = s.monthlyAmount * 12;
      if (s.taxTreatment === 'social_security') baseOrdinary += annual * 0.85;
      else if (s.taxTreatment === 'fully_taxable' || s.taxTreatment === 'other_income') baseOrdinary += annual;
      // tax_free excluded
    }

    const room = Math.max(0, fillCeiling - baseOrdinary);
    const conversion = Math.min(room, remainingTraditional);
    if (conversion <= 0) continue;

    // Incremental federal tax: tax on (base + conversion) minus tax on base alone.
    const baseTaxable = Math.max(0, baseOrdinary - stdDeduction);
    const withConvTaxable = Math.max(0, baseOrdinary + conversion - stdDeduction);
    const taxCost =
      calculateFederalIncomeTax(withConvTaxable, filingStatus) -
      calculateFederalIncomeTax(baseTaxable, filingStatus);
    const marginalRate = conversion > 0 ? taxCost / conversion : 0;

    cumulative += conversion;
    remainingTraditional -= conversion;

    years.push({
      age,
      year: currentYear + (age - profile.currentAge),
      baseOrdinaryIncome: baseOrdinary,
      conversionAmount: conversion,
      taxCost,
      marginalRate,
      cumulativeConverted: cumulative,
    });
  }

  if (years.length === 0) return empty;

  const totalConverted = cumulative;
  const totalTaxCost = years.reduce((s, y) => s + y.taxCost, 0);

  // Rough RMD-reduction signal: the converted balance, grown to RMD age at the real
  // return, would otherwise have produced a first-year RMD of (balance / divisor).
  const realReturn =
    (1 + (assumptions.retirementReturnRate ?? 0.05)) / (1 + inflation) - 1;
  const yearsToRmd = Math.max(0, RMD_START_AGE - startAge);
  const grownConverted = totalConverted * Math.pow(1 + realReturn, yearsToRmd);
  const divisor = getRMDDivisor(RMD_START_AGE);
  const rmdReductionEstimate = divisor > 0 ? grownConverted / divisor : 0;
  void yearsToRetirement;

  return {
    relevant: true,
    startAge,
    endAge,
    fillBracketRate: 0.12,
    fillBracketLabel: '12%',
    years,
    totalConverted,
    totalTaxCost,
    blendedRate: totalConverted > 0 ? totalTaxCost / totalConverted : 0,
    rmdReductionEstimate,
  };
}
