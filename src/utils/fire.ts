import {
  Account,
  Profile,
  Assumptions,
  AccumulationResult,
  FireResult,
  FireTarget,
  FireProjectionPoint,
  IncomeStream,
  EarlyAccessAnalysis,
  SocialSecurityCoverage,
  SwrAssessment,
  SwrLevel,
  is401k,
  getTaxTreatment,
  getAccountTypeLabel,
} from "../types";
import type { CountryConfig } from "../countries";
import {
  LEAN_FIRE_MULTIPLIER,
  FAT_FIRE_MULTIPLIER,
  DEFAULT_ACCUMULATION_RETURN,
} from "./constants";

/**
 * FIRE (Financial Independence / Retire Early) calculations.
 *
 * All figures are expressed in TODAY'S DOLLARS. We use a REAL (inflation-adjusted)
 * rate of return so a portfolio "number" computed today is directly comparable to
 * spending expressed in today's dollars.
 *
 *   FIRE number   = annual spending / safe withdrawal rate   (the "25x" rule at 4%)
 *   Lean / Fat    = full number at a leaner / more generous spending level
 *   Coast FIRE    = amount needed invested TODAY so it grows to the full number by
 *                   retirement age with NO further contributions
 *   Barista FIRE  = portfolio so that safe withdrawals + part-time income cover spending
 */

const SPENDING_GOAL_FALLBACK = 60000;

function employerMatch(account: Account): number {
  const supportsMatch =
    is401k(account.type) || account.type === "employer_rrsp";
  if (
    !supportsMatch ||
    !account.employerMatchPercent ||
    !account.employerMatchLimit
  )
    return 0;
  return Math.min(
    account.annualContribution * account.employerMatchPercent,
    account.employerMatchLimit,
  );
}

function weightedNominalReturn(accounts: Account[]): number {
  const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0);
  if (totalBalance <= 0) {
    if (accounts.length === 0) return DEFAULT_ACCUMULATION_RETURN;
    return accounts.reduce((sum, a) => sum + a.returnRate, 0) / accounts.length;
  }
  return accounts.reduce(
    (sum, a) => sum + a.returnRate * (a.balance / totalBalance),
    0,
  );
}

/**
 * Portfolio needed (today's dollars) to start a Barista FIRE phase.
 *
 * Bridge model (bridgeYears > 0): you work part-time for `bridgeYears`, drawing
 * (spending − partTimeIncome) from the portfolio each year while it grows at the
 * real return, arriving at the Full FIRE number when part-time work ends. After
 * that the portfolio alone funds full spending indefinitely.
 *
 * Withdrawal timing matches the rest of the app: each year the draw is taken first,
 * then the remaining balance grows (annuity-due). Solving
 *   balance_N = start·(1+r)^N − d·(1+r)·((1+r)^N − 1)/r = fullNumber
 * for the starting balance gives the closed form below.
 *
 * Indefinite model (bridgeYears <= 0): part-time income continues forever, so the
 * portfolio only needs to cover (spending − partTimeIncome) at the safe withdrawal
 * rate — the classic Barista formula.
 */
export function baristaFireNumber(
  annualSpending: number,
  partTimeIncome: number,
  swr: number,
  realReturn: number,
  bridgeYears: number,
): number {
  if (bridgeYears <= 0) {
    return Math.max(0, (annualSpending - partTimeIncome) / swr);
  }
  const fullNumber = annualSpending / swr;
  const netDraw = annualSpending - partTimeIncome; // can be negative if income > spending
  const r = realReturn;
  if (Math.abs(r) < 1e-9) {
    return Math.max(0, fullNumber + netDraw * bridgeYears);
  }
  const growth = Math.pow(1 + r, bridgeYears);
  // Draw-first timing: the draw term carries a (1+r) factor (annuity-due).
  const number = fullNumber / growth + (netDraw * (1 + r) * (1 - 1 / growth)) / r;
  return Math.max(0, number);
}

/** First age the portfolio reaches `target`, projecting in REAL terms. null if not by 100. */
function ageWhenReached(
  startBalance: number,
  realAnnualContribution: number,
  realReturn: number,
  currentAge: number,
  retirementAge: number,
  target: number,
): number | null {
  if (startBalance >= target) return currentAge;
  let balance = startBalance;
  for (let age = currentAge + 1; age <= 100; age++) {
    const contrib = age <= retirementAge ? realAnnualContribution : 0;
    balance = balance * (1 + realReturn) + contrib;
    if (balance >= target) return age;
  }
  return null;
}

export function calculateFire(
  accounts: Account[],
  profile: Profile,
  assumptions: Assumptions,
): FireResult {
  const annualSpending =
    assumptions.annualSpendingGoal ?? SPENDING_GOAL_FALLBACK;
  const swr =
    assumptions.safeWithdrawalRate > 0 ? assumptions.safeWithdrawalRate : 0.04;
  const inflation = assumptions.inflationRate ?? 0.03;
  const leanMult = assumptions.leanMultiplier ?? LEAN_FIRE_MULTIPLIER;
  const fatMult = assumptions.fatMultiplier ?? FAT_FIRE_MULTIPLIER;

  const currentInvested = accounts.reduce((sum, a) => sum + a.balance, 0);
  const nominalReturnRate = weightedNominalReturn(accounts);
  const realReturnRate = (1 + nominalReturnRate) / (1 + inflation) - 1;
  const yearsToRetirement = Math.max(
    0,
    profile.retirementAge - profile.currentAge,
  );

  // Continuing contributions in today's dollars (this year's contribution + match),
  // held flat in real terms for the "on your current path" projection.
  const realAnnualContribution = accounts.reduce(
    (sum, a) => sum + a.annualContribution + employerMatch(a),
    0,
  );

  const fullNumber = annualSpending / swr;
  const leanNumber = (annualSpending * leanMult) / swr;
  const fatNumber = (annualSpending * fatMult) / swr;
  const coastNumber =
    realReturnRate > -1
      ? fullNumber / Math.pow(1 + realReturnRate, yearsToRetirement)
      : fullNumber;
  const baristaIncome = assumptions.baristaAnnualIncome ?? 0;
  const baristaBridgeYears = assumptions.baristaBridgeYears ?? 0;
  const baristaNumber = baristaFireNumber(
    annualSpending,
    baristaIncome,
    swr,
    realReturnRate,
    baristaBridgeYears,
  );

  const coastAchieveAge = ageWhenReached(
    currentInvested,
    0,
    realReturnRate,
    profile.currentAge,
    profile.retirementAge,
    fullNumber,
  );

  const makeTarget = (
    id: FireTarget["id"],
    label: string,
    description: string,
    targetNumber: number,
    contributionForProjection: number,
  ): FireTarget => ({
    id,
    label,
    description,
    targetNumber,
    achieved: currentInvested >= targetNumber,
    surplusOrShortfall: currentInvested - targetNumber,
    achieveAge: ageWhenReached(
      currentInvested,
      contributionForProjection,
      realReturnRate,
      profile.currentAge,
      profile.retirementAge,
      targetNumber,
    ),
  });

  const targets: FireTarget[] = [
    makeTarget(
      "full",
      "Full FIRE",
      `Your number: ${Math.round(1 / swr)}× annual spending. Fully fund your lifestyle from investments.`,
      fullNumber,
      realAnnualContribution,
    ),
    makeTarget(
      "lean",
      "Lean FIRE",
      `A leaner lifestyle at ${Math.round(leanMult * 100)}% of your target spending.`,
      leanNumber,
      realAnnualContribution,
    ),
    makeTarget(
      "fat",
      "Fat FIRE",
      `A more generous lifestyle at ${Math.round(fatMult * 100)}% of your target spending.`,
      fatNumber,
      realAnnualContribution,
    ),
    makeTarget(
      "coast",
      "Coast FIRE",
      "Enough invested today that, with no further contributions, you coast to Full FIRE by retirement age.",
      coastNumber,
      0,
    ),
    makeTarget(
      "barista",
      "Barista FIRE",
      baristaIncome > 0
        ? baristaBridgeYears > 0
          ? `Work part-time ~$${Math.round(baristaIncome).toLocaleString()}/yr for ${baristaBridgeYears} ${baristaBridgeYears === 1 ? "year" : "years"} (to ~age ${profile.retirementAge + baristaBridgeYears}), then your portfolio covers full spending.`
          : `Withdrawals plus ~$${Math.round(baristaIncome).toLocaleString()}/yr of indefinite part-time income cover your spending.`
        : "Part-time income covers part of your spending. Set a part-time income to personalize this.",
      baristaNumber,
      realAnnualContribution,
    ),
  ];

  // Today's-dollar projection path from current age to life expectancy.
  const projection: FireProjectionPoint[] = [];
  let bal = currentInvested;
  const endAge = Math.max(profile.lifeExpectancy, profile.retirementAge + 1);
  projection.push({
    age: profile.currentAge,
    balance: bal,
    contributing: true,
  });
  for (let age = profile.currentAge + 1; age <= endAge; age++) {
    const contributing = age <= profile.retirementAge;
    bal =
      bal * (1 + realReturnRate) + (contributing ? realAnnualContribution : 0);
    projection.push({ age, balance: Math.max(0, bal), contributing });
  }

  return {
    currentInvested,
    annualSpending,
    nominalReturnRate,
    realReturnRate,
    yearsToRetirement,
    coastAchieveAge,
    baristaBridgeYears,
    baristaIncome,
    targets,
    projection,
  };
}

/**
 * Required level annual savings (today's dollars) to reach `target` by retirement age,
 * given current balance and real return. Returns 0 if already on track from balance alone.
 */
function requiredAnnualSavings(
  currentBalance: number,
  target: number,
  realReturn: number,
  years: number,
): number {
  if (years <= 0) return Math.max(0, target - currentBalance);
  const fvCurrent = currentBalance * Math.pow(1 + realReturn, years);
  const remaining = target - fvCurrent;
  if (remaining <= 0) return 0;
  if (Math.abs(realReturn) < 1e-9) return remaining / years;
  const annuityFactor = (Math.pow(1 + realReturn, years) - 1) / realReturn;
  return remaining / annuityFactor;
}

/**
 * Generate plain-language, situation-aware guidance for the FIRE tab.
 */
export function generateFireAdvice(
  fire: FireResult,
  accounts: Account[],
  profile: Profile,
  _assumptions: Assumptions,
): string[] {
  const tips: string[] = [];
  const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`;

  const full = fire.targets.find((t) => t.id === "full");
  const coast = fire.targets.find((t) => t.id === "coast");
  const years = fire.yearsToRetirement;

  // 1. Coast status
  if (coast?.achieved) {
    tips.push(
      `You've hit Coast FIRE: your current savings alone should grow to your Full FIRE number by retirement${
        fire.coastAchieveAge ? ` (around age ${fire.coastAchieveAge})` : ""
      }. New contributions now mainly buy an earlier or richer retirement.`,
    );
  } else if (coast) {
    tips.push(
      `You're ${fmt(-coast.surplusOrShortfall)} away from Coast FIRE (${fmt(
        coast.targetNumber,
      )}). Once you cross it, you could stop contributing and still reach your number by retirement age.`,
    );
  }

  // 2. Required savings to hit Full FIRE by retirement age
  if (full && !full.achieved) {
    const needAnnual = requiredAnnualSavings(
      fire.currentInvested,
      full.targetNumber,
      fire.realReturnRate,
      years,
    );
    const currentAnnual = accounts.reduce(
      (s, a) =>
        s +
        a.annualContribution +
        (a.employerMatchPercent && a.employerMatchLimit
          ? Math.min(
              a.annualContribution * a.employerMatchPercent,
              a.employerMatchLimit,
            )
          : 0),
      0,
    );
    if (needAnnual <= 0) {
      tips.push(
        `To reach Full FIRE by age ${profile.retirementAge}, your current balance alone is enough to coast — no further saving strictly required.`,
      );
    } else {
      const gap = needAnnual - currentAnnual;
      tips.push(
        `To reach Full FIRE (${fmt(full.targetNumber)}) by age ${profile.retirementAge}, save about ${fmt(
          needAnnual,
        )}/yr (~${fmt(needAnnual / 12)}/mo) in today's dollars. ${
          gap > 0
            ? `That's ${fmt(gap)}/yr more than your current ${fmt(currentAnnual)}/yr.`
            : `You're already contributing ${fmt(currentAnnual)}/yr — on track or ahead.`
        }`,
      );
    }
  } else if (full?.achieved) {
    tips.push(
      `You've reached your Full FIRE number (${fmt(full.targetNumber)}). Congratulations — you are financially independent on these assumptions.`,
    );
  }

  // 3. Tax diversification (account-mix awareness)
  const total = accounts.reduce((s, a) => s + a.balance, 0);
  if (total > 0) {
    const byTreatment: Record<string, number> = {
      pretax: 0,
      roth: 0,
      taxable: 0,
      hsa: 0,
    };
    accounts.forEach((a) => {
      byTreatment[getTaxTreatment(a.type)] += a.balance;
    });
    const pct = (k: string) => Math.round((byTreatment[k] / total) * 100);
    const rothPct = pct("roth");
    const pretaxPct = pct("pretax");
    if (rothPct < 15) {
      tips.push(
        `Only ~${rothPct}% of your portfolio is in Roth/tax-free accounts. Building more Roth gives you tax-free, RMD-free flexibility and helps manage taxable income in retirement (also useful for early-retirement ACA subsidies).`,
      );
    } else if (pretaxPct > 80) {
      tips.push(
        `~${pretaxPct}% of your portfolio is pre-tax. Large traditional balances drive Required Minimum Distributions after 73 — consider Roth contributions or conversions to spread the future tax bill.`,
      );
    } else {
      tips.push(
        `Your tax mix looks reasonably diversified (~${pretaxPct}% pre-tax, ~${rothPct}% Roth). That flexibility helps you control taxable income year to year in retirement.`,
      );
    }
  }

  // 4. Sequence-of-returns risk near retirement
  if (years <= 10 && years > 0) {
    tips.push(
      `You're within ${years} years of retirement. This is when sequence-of-returns risk bites hardest — consider holding 1–3 years of expenses in cash/bonds so a downturn doesn't force selling at a low.`,
    );
  }

  // 5. Always-true fundamentals
  tips.push(
    `Capture your full employer match first — it's an immediate ~50–100% return and the match always lands in a pre-tax account regardless of your Roth/Traditional choice.`,
  );
  tips.push(
    `The 4% rule is a useful rule of thumb, not a guarantee. A lower withdrawal rate (3–3.5%) is safer for very long (early) retirements; you can raise it later if markets cooperate.`,
  );

  return tips;
}

/**
 * Early-access gap: when someone retires before the penalty-free age (59.5 -> 60 in
 * the US), tax-advantaged accounts may be locked behind a 10% penalty. This works out
 * which balances are reachable at retirement, which are locked, and whether the
 * reachable money plus any income streams can bridge spending until the lock lifts.
 *
 * Modeling notes (consistent with the rest of the app): Roth, taxable and HSA are
 * treated as reachable without penalty; only accounts the country flags as
 * penalty-bearing (US traditional 401k/IRA) are considered locked. Roth contributions
 * vs earnings aren't tracked, so Roth is treated as fully reachable.
 */
export function calculateEarlyAccess(
  accounts: Account[],
  profile: Profile,
  assumptions: Assumptions,
  countryConfig: CountryConfig,
  incomeStreams: IncomeStream[] = [],
  accumulationResult?: AccumulationResult,
): EarlyAccessAnalysis {
  const retirementAge = profile.retirementAge;

  // Highest penalty-free age across the penalty-bearing account types present.
  let penaltyFreeAge = 0;
  for (const a of accounts) {
    const info = countryConfig.getPenaltyInfo(a.type);
    if (info.appliesToAccountType) {
      penaltyFreeAge = Math.max(penaltyFreeAge, Math.ceil(info.penaltyAge));
    }
  }

  const accountReachableAge = (a: Account): number => {
    const info = countryConfig.getPenaltyInfo(a.type);
    return info.appliesToAccountType ? Math.ceil(info.penaltyAge) : 0;
  };

  // Use projected balances at retirement age when available, otherwise fall back
  // to current balances (e.g. when already at retirement age).
  const retirementYearData = accumulationResult?.yearlyBalances.find(
    (y) => y.age === retirementAge,
  );

  const getProjectedBalance = (a: Account): number => {
    if (retirementYearData) {
      return retirementYearData.balances[a.id] ?? 0;
    }
    return a.balance;
  };

  let accessibleBalance = 0;
  let lockedBalance = 0;
  const accessibleLabels = new Set<string>();
  const lockedLabels = new Set<string>();
  for (const a of accounts) {
    const balance = getProjectedBalance(a);
    if (accountReachableAge(a) <= retirementAge) {
      accessibleBalance += balance;
      if (balance > 0) accessibleLabels.add(getAccountTypeLabel(a.type));
    } else {
      lockedBalance += balance;
      if (balance > 0) lockedLabels.add(getAccountTypeLabel(a.type));
    }
  }

  const relevant = penaltyFreeAge > retirementAge && lockedBalance > 0;
  const yearsToBridge = Math.max(0, penaltyFreeAge - retirementAge);

  // Simulate the bridge period: accessible funds grow at the retirement return rate
  // while covering spending (net of income streams). bridgeNeed is the total
  // inflation-adjusted spending that can't be covered by account growth alone.
  const spending = assumptions.annualSpendingGoal ?? SPENDING_GOAL_FALLBACK;
  const retirementReturn =
    assumptions.retirementReturnRate ?? DEFAULT_ACCUMULATION_RETURN;
  const inflation = assumptions.inflationRate ?? 0.03;

  let bridgeNeed = 0;
  let runningBalance = accessibleBalance;
  for (let i = 0; i < yearsToBridge; i++) {
    const age = retirementAge + i;
    const inflationMultiplier = Math.pow(1 + inflation, i);
    const inflatedSpending = spending * inflationMultiplier;
    const income = incomeStreams.reduce((sum, str) => {
      const on =
        age >= str.startAge && (str.endAge == null || age <= str.endAge);
      return on ? sum + str.monthlyAmount * 12 : sum;
    }, 0);
    const netDraw = Math.max(0, inflatedSpending - income);
    bridgeNeed += netDraw;

    // Grow accessible balance and subtract the draw to track remaining capacity.
    runningBalance = runningBalance * (1 + retirementReturn) - netDraw;
  }

  // shortfall: negative runningBalance means you ran out; positive means surplus.
  // Negate so that positive = shortfall, negative = surplus (matches the UI expectation).
  const shortfall = -runningBalance;

  return {
    relevant,
    penaltyFreeAge,
    retirementAge,
    yearsToBridge,
    accessibleBalance,
    lockedBalance,
    bridgeNeed,
    shortfall,
    accessibleLabels: Array.from(accessibleLabels),
    lockedLabels: Array.from(lockedLabels),
  };
}

/**
 * Social Security / government-benefit coverage of spending, in today's dollars.
 * US benefits come from income streams tagged `social_security`; Canada uses the
 * profile's CPP/OAS fields. The "start age" is the latest start among contributing
 * benefits, i.e. when the full benefit is flowing.
 */
export function calculateSocialSecurityCoverage(
  profile: Profile,
  assumptions: Assumptions,
  incomeStreams: IncomeStream[] = [],
): SocialSecurityCoverage {
  const spending = assumptions.annualSpendingGoal ?? SPENDING_GOAL_FALLBACK;
  const swr =
    assumptions.safeWithdrawalRate > 0 ? assumptions.safeWithdrawalRate : 0.04;

  let annualBenefit = 0;
  let startAge: number | null = null;

  if (profile.country === "CA") {
    if (profile.socialSecurityBenefit && profile.socialSecurityBenefit > 0) {
      annualBenefit += profile.socialSecurityBenefit;
      startAge = profile.socialSecurityStartAge ?? 65;
    }
    if (profile.secondaryBenefitAmount && profile.secondaryBenefitAmount > 0) {
      annualBenefit += profile.secondaryBenefitAmount;
      startAge =
        Math.max(startAge ?? 0, profile.secondaryBenefitStartAge ?? 65) ||
        startAge;
    }
  } else {
    const ss = incomeStreams.filter(
      (s) => s.taxTreatment === "social_security",
    );
    for (const s of ss) {
      annualBenefit += s.monthlyAmount * 12;
      startAge = Math.max(startAge ?? 0, s.startAge);
    }
  }

  const available = annualBenefit > 0;
  const residualDraw = Math.max(0, spending - annualBenefit);

  return {
    available,
    annualBenefit,
    startAge: available ? startAge : null,
    spending,
    coveragePct: spending > 0 ? annualBenefit / spending : 0,
    residualDraw,
    residualPortfolio: residualDraw / swr,
  };
}

/**
 * Judge the chosen safe withdrawal rate against the planned retirement length.
 * Longer (early) retirements warrant a lower rate; 4% is a 30-year heuristic.
 */
export function assessSwr(
  profile: Profile,
  assumptions: Assumptions,
): SwrAssessment {
  const swr =
    assumptions.safeWithdrawalRate > 0 ? assumptions.safeWithdrawalRate : 0.04;
  const retirementLengthYears = Math.max(
    0,
    profile.lifeExpectancy - profile.retirementAge,
  );
  const longRetirement = retirementLengthYears >= 30;
  const recommendedMax = longRetirement ? 0.035 : 0.04;

  let level: SwrLevel;
  if (swr <= 0.035) level = "conservative";
  else if (swr <= 0.04) level = "moderate";
  else if (swr <= 0.045) level = "aggressive";
  else level = "very_aggressive";

  const flagged = swr > recommendedMax;
  const pct = (r: number) => `${(r * 100).toFixed(1)}%`;

  let message: string;
  if (level === "conservative") {
    message = `A ${pct(swr)} withdrawal rate is conservative and well-suited to a ${retirementLengthYears}-year retirement — it trades some spending today for a high chance of never running out.`;
  } else if (level === "moderate") {
    message = longRetirement
      ? `${pct(swr)} is the classic 4% heuristic, which was calibrated to ~30 years. Your plan spans ${retirementLengthYears} years, so leaning toward 3–3.5% adds a safety margin.`
      : `${pct(swr)} is in line with the classic 4% rule for a ${retirementLengthYears}-year retirement. Reasonable, with normal market risk.`;
  } else if (level === "aggressive") {
    message = `${pct(swr)} is above the 4% guideline. Over a ${retirementLengthYears}-year retirement this raises the odds of depleting the portfolio in a poor sequence of returns — consider 3.5–4% or plan to flex spending in down years.`;
  } else {
    message = `${pct(swr)} is an aggressive withdrawal rate. Historically, rates this high have a meaningful failure risk over long retirements — treat it as a stretch case and have a plan to cut spending if markets disappoint.`;
  }

  return {
    swr,
    level,
    retirementLengthYears,
    recommendedMax,
    flagged,
    message,
  };
}
