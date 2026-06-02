import { Profile, IncomeStream, SSClaimingAnalysis, SSClaimingOption } from '../types';

/**
 * Social Security claiming optimizer (US only).
 *
 * Compares claiming at 62, Full Retirement Age (FRA), and 70 using the SSA
 * actuarial adjustment rules, then finds the breakeven (crossover) ages and the
 * claim age that maximizes total household benefits collected through life expectancy.
 *
 * All figures are in TODAY'S DOLLARS (real). Because every option inflates at the
 * same COLA, comparing them in real terms is valid and keeps the breakeven math clean.
 *
 * SSA adjustment rules (born 1960+, FRA 67):
 *  - Early: benefit reduced 5/9 of 1% per month for the first 36 months before FRA,
 *    then 5/12 of 1% per month beyond that. At 62 (60 months early) => 30% cut => 70%.
 *  - Delayed: +2/3 of 1% per month after FRA (8%/year). At 70 => +24% => 124%.
 *
 * Spousal benefit (MFJ): the lower earner can receive up to 50% of the higher earner's
 * FRA benefit (PIA). Modeled simply as +50% of the FRA monthly benefit when filing
 * jointly — a reasonable approximation that ignores the spouse's own earned benefit and
 * the spouse's separate claiming age. Flagged as such in the UI.
 */

const FRA = 67; // Full Retirement Age for anyone born 1960 or later.

/** Benefit as a fraction of the FRA (PIA) benefit for a given claim age. */
export function ssBenefitFactor(claimAge: number, fra: number = FRA): number {
  if (claimAge === fra) return 1;

  if (claimAge < fra) {
    const monthsEarly = (fra - claimAge) * 12;
    const first36 = Math.min(monthsEarly, 36);
    const beyond36 = Math.max(0, monthsEarly - 36);
    const reduction = first36 * (5 / 9 / 100) + beyond36 * (5 / 12 / 100);
    return 1 - reduction;
  }

  // Delayed retirement credits, capped at age 70 (no credits accrue after 70).
  const monthsDelayed = (Math.min(claimAge, 70) - fra) * 12;
  return 1 + monthsDelayed * (2 / 3 / 100);
}

export function calculateSSClaiming(
  profile: Profile,
  incomeStreams: IncomeStream[] = [],
): SSClaimingAnalysis {
  const lifeExpectancy = profile.lifeExpectancy;
  const includesSpousal = profile.filingStatus === 'married_filing_jointly';

  const empty: SSClaimingAnalysis = {
    relevant: false,
    fra: FRA,
    fraMonthlyBenefit: 0,
    lifeExpectancy,
    includesSpousal,
    options: [],
    breakeven62vsFra: null,
    breakevenFraVs70: null,
    breakeven62vs70: null,
    recommendedAge: FRA,
    curve: [],
  };

  if (profile.country !== 'US') return empty;

  // Derive the FRA (PIA) monthly benefit from a Social Security income stream.
  // Stream amounts are entered at a stated start age; convert back to the FRA basis
  // so all three claim ages are compared from a common PIA.
  const ssStreams = incomeStreams.filter((s) => s.taxTreatment === 'social_security');
  if (ssStreams.length === 0) return empty;

  // Use the largest SS stream as the primary earner's benefit.
  const primary = ssStreams.reduce((max, s) =>
    s.monthlyAmount > max.monthlyAmount ? s : max, ssStreams[0]);
  const enteredFactor = ssBenefitFactor(primary.startAge, FRA);
  const fraMonthlyBenefit = enteredFactor > 0 ? primary.monthlyAmount / enteredFactor : primary.monthlyAmount;

  if (fraMonthlyBenefit <= 0) return empty;

  const claimAges = [62, FRA, 70];

  const makeOption = (claimAge: number): SSClaimingOption => {
    const factor = ssBenefitFactor(claimAge, FRA);
    const monthlyBenefit = fraMonthlyBenefit * factor;
    // Spousal benefit: up to 50% of the primary's PIA. It earns NO delayed credits
    // (capped at the FRA amount), but IS reduced when claimed before FRA. Approximation:
    // flat 50% of PIA at/after FRA, scaled by the early-claim factor before FRA.
    const spousalMonthly = includesSpousal
      ? fraMonthlyBenefit * 0.5 * (claimAge < FRA ? factor : 1)
      : 0;
    const householdMonthly = monthlyBenefit + spousalMonthly;
    const yearsCollecting = Math.max(0, lifeExpectancy - claimAge);
    return {
      claimAge,
      label:
        claimAge === 62 ? 'Age 62 (early)' :
        claimAge === FRA ? `Age ${FRA} (FRA)` :
        'Age 70 (delayed)',
      monthlyBenefit,
      annualBenefit: monthlyBenefit * 12,
      pctOfFra: factor,
      spousalMonthly,
      cumulativeByLifeExpectancy: householdMonthly * 12 * yearsCollecting,
    };
  };

  const options = claimAges.map(makeOption);

  // Per-age cumulative household benefit, for charting and breakeven detection.
  const householdAnnual = (claimAge: number): number => {
    const o = options.find((x) => x.claimAge === claimAge)!;
    return (o.monthlyBenefit + o.spousalMonthly) * 12;
  };
  const a62 = householdAnnual(62);
  const aFra = householdAnnual(FRA);
  const a70 = householdAnnual(70);

  const curve: SSClaimingAnalysis['curve'] = [];
  for (let age = 62; age <= lifeExpectancy; age++) {
    curve.push({
      age,
      claim62: a62 * Math.max(0, age - 62 + 1),
      claimFra: aFra * Math.max(0, age - FRA + 1),
      claim70: a70 * Math.max(0, age - 70 + 1),
    });
  }

  // Breakeven: first age where the later-claim cumulative meets or exceeds the earlier.
  const crossover = (
    earlyAnnual: number, earlyStart: number,
    lateAnnual: number, lateStart: number,
  ): number | null => {
    for (let age = lateStart; age <= 110; age++) {
      const earlyCum = earlyAnnual * (age - earlyStart + 1);
      const lateCum = lateAnnual * (age - lateStart + 1);
      if (lateCum >= earlyCum) return age;
    }
    return null;
  };

  const breakeven62vsFra = crossover(a62, 62, aFra, FRA);
  const breakevenFraVs70 = crossover(aFra, FRA, a70, 70);
  const breakeven62vs70 = crossover(a62, 62, a70, 70);

  const recommendedAge = options.reduce((best, o) =>
    o.cumulativeByLifeExpectancy > best.cumulativeByLifeExpectancy ? o : best, options[0]).claimAge;

  return {
    relevant: true,
    fra: FRA,
    fraMonthlyBenefit,
    lifeExpectancy,
    includesSpousal,
    options,
    breakeven62vsFra,
    breakevenFraVs70,
    breakeven62vs70,
    recommendedAge,
    curve,
  };
}
