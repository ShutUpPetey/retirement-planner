import {
  Account,
  Profile,
  AccumulationResult,
  YearlyAccountBalance,
  LifeEvent,
  is401k,
} from '../types';
import type { CountryConfig } from '../countries';

/**
 * Minimum annual contribution needed to capture the full employer match.
 * Used as the floor when life events reduce discretionary contributions — the
 * model never lets a life event cost you free employer money unintentionally.
 *
 * Returns 0 for accounts with no match, or when the account's current
 * contribution is already below the threshold (we don't push them up).
 */
function matchRetentionFloor(account: Account, currentContribution: number, salaryGrowthFactor: number): number {
  if (!account.employerMatchPercent || account.employerMatchPercent === 0) return 0;

  let threshold: number;
  if (account.employerMatchLimitType === 'salary_percent') {
    if (!account.annualSalary || !account.employerMatchLimitPercent) return 0;
    // Need to contribute at least this much to capture the full salary-based match cap
    threshold = account.annualSalary * salaryGrowthFactor * account.employerMatchLimitPercent;
  } else {
    if (!account.employerMatchLimit) return 0;
    // Need contribution × matchRate >= dollarCap, so min contrib = dollarCap / matchRate
    threshold = account.employerMatchLimit / account.employerMatchPercent;
  }

  // Only protect up to what they're already contributing — don't push them above their own number
  return Math.min(currentContribution, threshold);
}

/**
 * Return the inflation-adjusted IRS / CRA contribution limit for an account type.
 * Limits are rounded to the nearest $500 to mimic real IRS adjustment behaviour.
 */
/** Extract a simple numeric limit from the ContributionLimits union value. */
function numericLimit(raw: number | { percentage?: number; max?: number; annual?: number; lifetime?: number } | undefined): number {
  if (!raw) return 0;
  if (typeof raw === 'number') return raw;
  return raw.annual ?? raw.max ?? 0;
}

function getIrsMaxContribution(
  account: Account,
  countryConfig: CountryConfig,
  yearIndex: number,
  inflationRate: number,
): number {
  const limits = countryConfig.getContributionLimits();
  const baseLimit = numericLimit(limits[account.type]);
  if (baseLimit === 0) return 0;
  const grown = baseLimit * Math.pow(1 + inflationRate, yearIndex);
  return Math.round(grown / 500) * 500;
}

/**
 * Calculate employer match for accounts that support it.
 *
 * Two cap modes:
 *  - 'salary_percent': cap = (annualSalary × salaryGrowthFactor) × employerMatchLimitPercent
 *    salaryGrowthFactor = (1 + contributionGrowthRate)^yearIndex so the salary cap grows
 *    at the same rate as the employee's contributions year-over-year.
 *  - 'dollar' (default / legacy): fixed nominal dollar cap — does not grow.
 *
 * Formula (both modes): min(contribution, matchCap) × matchRate
 */
function calculateEmployerMatch(
  account: Account,
  effectiveContribution: number,
  salaryGrowthFactor = 1,
): number {
  const supportsMatch = is401k(account.type) || account.type === 'employer_rrsp';
  if (!supportsMatch || !account.employerMatchPercent) return 0;

  if (account.employerMatchLimitType === 'salary_percent') {
    if (!account.annualSalary || !account.employerMatchLimitPercent) return 0;
    const effectiveSalary = account.annualSalary * salaryGrowthFactor;
    const salaryMatchCap = effectiveSalary * account.employerMatchLimitPercent;
    return Math.min(effectiveContribution, salaryMatchCap) * account.employerMatchPercent;
  }

  // Legacy dollar cap: fixed nominal amount, does not grow.
  if (!account.employerMatchLimit) return 0;
  return Math.min(effectiveContribution * account.employerMatchPercent, account.employerMatchLimit);
}

/**
 * Project account growth during accumulation phase
 */
export function calculateAccumulation(
  accounts: Account[],
  profile: Profile,
  countryConfig: CountryConfig,
  lifeEvents: LifeEvent[] = [],
  inflationRate = 0.03
): AccumulationResult {
  const yearsToRetirement = profile.retirementAge - profile.currentAge;
  const currentYear = new Date().getFullYear();

  // Initialize balances
  const balances: Record<string, number> = {};
  const contributions: Record<string, number> = {};

  accounts.forEach(account => {
    balances[account.id] = account.balance;
    // IRS-max accounts: seed with the current-year limit; the loop overwrites each year.
    contributions[account.id] = account.useIrsMaxContribution
      ? getIrsMaxContribution(account, countryConfig, 0, inflationRate)
      : account.annualContribution;
  });

  const yearlyBalances: YearlyAccountBalance[] = [];

  // Record initial state (year 0) — no contributions have been made yet
  const emptyContribs: Record<string, number> = {};
  accounts.forEach(a => { emptyContribs[a.id] = 0; });

  yearlyBalances.push({
    age: profile.currentAge,
    year: currentYear,
    balances: { ...balances },
    totalBalance: Object.values(balances).reduce((sum, b) => sum + b, 0),
    contributions: { ...emptyContribs },
    employerContributions: { ...emptyContribs },
    // Year 0 is the starting-balance snapshot — no contributions flow, so no reduction.
    netLifeEventCost: 0,
    contributionReductionFromEvents: 0,
  });

  // Project each year
  for (let i = 1; i <= yearsToRetirement; i++) {
    const age = profile.currentAge + i;
    const year = currentYear + i;

    // Process life events: track gross expense/income for OOP calculation,
    // and split into deltaAll / deltaDiscretionary for contribution adjustment.
    let grossEventExpense = 0;
    let grossEventIncome = 0;
    let deltaAll = 0;
    let deltaDiscretionary = 0;
    for (const event of lifeEvents) {
      if (event.type === 'lump_sum') continue;
      const active = age >= event.startAge && (event.endAge === undefined || age <= event.endAge);
      if (!active) continue;
      const amount = event.inflationAdjust
        ? event.amount * Math.pow(1 + inflationRate, age - profile.currentAge)
        : event.amount;
      if (event.type === 'expense') {
        grossEventExpense += amount;
        if (event.affectsIrsMaxAccounts) deltaAll -= amount; else deltaDiscretionary -= amount;
      } else {
        grossEventIncome += amount;
        if (event.affectsIrsMaxAccounts) deltaAll += amount; else deltaDiscretionary += amount;
      }
    }

    // Pre-compute effective base contributions for deltaAll distribution
    // (IRS-max accounts use the current year's limit, not the stored stale value)
    const totalAllBase = accounts.reduce((sum, a) => {
      const base = a.useIrsMaxContribution
        ? getIrsMaxContribution(a, countryConfig, i, inflationRate)
        : contributions[a.id];
      return sum + base;
    }, 0);

    const discretionaryAccounts = accounts.filter(a => !a.useIrsMaxContribution);
    const discretionaryBase = discretionaryAccounts.reduce((sum, a) => sum + contributions[a.id], 0);

    // Track what was actually used this year (for accurate table display)
    const yearActualContribs: Record<string, number> = {};
    const yearEmployerContribs: Record<string, number> = {};
    let totalContribReduction = 0; // sum of contribution reductions caused by life events this year

    accounts.forEach(account => {
      const currentBalance = balances[account.id];
      const currentContribution = contributions[account.id];

      // 1. Apply investment return to existing balance
      const balanceAfterReturn = currentBalance * (1 + account.returnRate);

      // 2. Effective contribution for this year
      const irsMax = account.useIrsMaxContribution
        ? getIrsMaxContribution(account, countryConfig, i, inflationRate)
        : null;

      // Salary grows with contributions — needed for match floor and match calculation
      const salaryGrowthFactor = Math.pow(1 + account.contributionGrowthRate, i);

      let adjustedContribution: number;
      if (irsMax !== null) {
        // IRS-max accounts:
        //  - deltaDiscretionary never applies (payroll deduction, not discretionary)
        //  - deltaAll (sabbatical-style events) reduces from the IRS limit but can't go
        //    below the match retention floor
        if (deltaAll !== 0) {
          const allShare = totalAllBase > 0 ? irsMax / totalAllBase : 1 / accounts.length;
          const floor = matchRetentionFloor(account, irsMax, salaryGrowthFactor);
          adjustedContribution = Math.max(floor, irsMax + deltaAll * allShare);
        } else {
          adjustedContribution = irsMax;
        }
      } else {
        // Discretionary accounts: apply both deltas, floor at match retention threshold
        const allShare  = totalAllBase > 0 ? currentContribution / totalAllBase : 1 / accounts.length;
        const discShare = discretionaryBase > 0
          ? currentContribution / discretionaryBase
          : discretionaryAccounts.length > 0 ? 1 / discretionaryAccounts.length : 0;
        const raw = currentContribution + deltaAll * allShare + deltaDiscretionary * discShare;
        const floor = matchRetentionFloor(account, currentContribution, salaryGrowthFactor);
        adjustedContribution = Math.max(floor, raw);
      }

      // How much did life events reduce this account's contribution?
      const baseContrib = irsMax ?? currentContribution;
      totalContribReduction += Math.max(0, baseContrib - adjustedContribution);

      const employerMatch = calculateEmployerMatch(account, adjustedContribution, salaryGrowthFactor);
      const totalContribution = adjustedContribution + employerMatch;

      // Record the actual amounts used this year before growing the stored value
      yearActualContribs[account.id]   = adjustedContribution;
      yearEmployerContribs[account.id] = employerMatch;

      // Update balance
      balances[account.id] = balanceAfterReturn + totalContribution;

      // 3. Grow stored contribution for next year.
      // IRS-max accounts: no-op — the limit is recomputed fresh each loop iteration.
      if (irsMax === null) {
        contributions[account.id] = currentContribution * (1 + account.contributionGrowthRate);
      }
    });

    // Apply lump_sum life events: subtract from portfolio balance proportionally
    for (const event of lifeEvents) {
      if (event.type !== 'lump_sum' || age !== event.startAge) continue;
      const effectiveAmount = event.inflationAdjust
        ? event.amount * Math.pow(1 + inflationRate, age - profile.currentAge)
        : event.amount;
      const totalBal = Object.values(balances).reduce((s, b) => s + b, 0);
      for (const account of accounts) {
        const share = totalBal > 0 ? balances[account.id] / totalBal : 1 / accounts.length;
        balances[account.id] = Math.max(0, balances[account.id] - effectiveAmount * share);
      }
    }

    const totalBalance = Object.values(balances).reduce((sum, b) => sum + b, 0);

    // True out-of-pocket = what expenses couldn't be covered by redirecting retirement savings
    const netLifeEventCost = (grossEventExpense - grossEventIncome) - totalContribReduction;

    yearlyBalances.push({
      age,
      year,
      balances: { ...balances },
      totalBalance,
      contributions: { ...yearActualContribs },
      employerContributions: { ...yearEmployerContribs },
      netLifeEventCost,
      contributionReductionFromEvents: totalContribReduction,
    });
  }

  // Calculate breakdown by country-specific groupings
  const breakdownByGroup: Record<string, number> = {};
  const accountGroupings = countryConfig.getAccountGroupings();

  // Initialize all groups to 0
  accountGroupings.forEach(group => {
    breakdownByGroup[group.id] = 0;
  });

  // Sum up balances for each group
  accounts.forEach(account => {
    const accountType = account.type;
    // Find which group this account belongs to
    const group = accountGroupings.find(g => g.accountTypes.includes(accountType));
    if (group) {
      breakdownByGroup[group.id] += balances[account.id];
    }
  });

  return {
    yearlyBalances,
    finalBalances: { ...balances },
    totalAtRetirement: Object.values(balances).reduce((sum, b) => sum + b, 0),
    breakdownByGroup,
  };
}

/**
 * Get the balance of an account at a specific age
 */
export function getBalanceAtAge(
  result: AccumulationResult,
  accountId: string,
  age: number
): number {
  const yearData = result.yearlyBalances.find(y => y.age === age);
  if (!yearData) return 0;
  return yearData.balances[accountId] || 0;
}

/**
 * Calculate total contributions made over accumulation phase
 */
export function calculateTotalContributions(
  accounts: Account[],
  profile: Profile,
  countryConfig?: CountryConfig,
  inflationRate = 0.03,
): Record<string, number> {
  const yearsToRetirement = profile.retirementAge - profile.currentAge;
  const totals: Record<string, number> = {};

  accounts.forEach(account => {
    let totalContribution = 0;
    let yearlyContribution = account.annualContribution;

    for (let i = 0; i < yearsToRetirement; i++) {
      const effectiveContrib = account.useIrsMaxContribution && countryConfig
        ? getIrsMaxContribution(account, countryConfig, i, inflationRate)
        : yearlyContribution;
      const salaryGrowthFactor = Math.pow(1 + account.contributionGrowthRate, i);
      const employerMatch = calculateEmployerMatch(account, effectiveContrib, salaryGrowthFactor);
      totalContribution += effectiveContrib + employerMatch;
      if (!account.useIrsMaxContribution) {
        yearlyContribution *= (1 + account.contributionGrowthRate);
      }
    }

    totals[account.id] = totalContribution;
  });

  return totals;
}
