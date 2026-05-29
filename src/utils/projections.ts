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
 * Calculate employer match for accounts that support it (401k, employer RRSP)
 */
function calculateEmployerMatch(account: Account): number {
  const supportsMatch = is401k(account.type) || account.type === 'employer_rrsp';

  if (!supportsMatch || !account.employerMatchPercent || !account.employerMatchLimit) {
    return 0;
  }

  // Match is the lesser of:
  // 1. The match percent times the contribution
  // 2. The match limit
  const matchAmount = account.annualContribution * account.employerMatchPercent;
  return Math.min(matchAmount, account.employerMatchLimit);
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
    contributions[account.id] = account.annualContribution;
  });

  const yearlyBalances: YearlyAccountBalance[] = [];

  // Record initial state (year 0)
  yearlyBalances.push({
    age: profile.currentAge,
    year: currentYear,
    balances: { ...balances },
    totalBalance: Object.values(balances).reduce((sum, b) => sum + b, 0),
    contributions: { ...contributions },
  });

  // Project each year
  for (let i = 1; i <= yearsToRetirement; i++) {
    const age = profile.currentAge + i;
    const year = currentYear + i;

    // Compute net contribution delta from recurring life events active this year
    let contributionDelta = 0;
    for (const event of lifeEvents) {
      if (event.type === 'lump_sum') continue;
      const active = age >= event.startAge && (event.endAge === undefined || age <= event.endAge);
      if (!active) continue;
      const effectiveAmount = event.inflationAdjust
        ? event.amount * Math.pow(1 + inflationRate, age - profile.currentAge)
        : event.amount;
      if (event.type === 'expense') contributionDelta -= effectiveAmount;
      else contributionDelta += effectiveAmount;
    }

    // Scale contribution delta proportionally per account
    const totalBaseContribution = accounts.reduce((sum, a) => sum + contributions[a.id], 0);

    accounts.forEach(account => {
      const currentBalance = balances[account.id];
      const currentContribution = contributions[account.id];

      // 1. Apply investment return to existing balance
      const balanceAfterReturn = currentBalance * (1 + account.returnRate);

      // 2. Add contribution adjusted for life events (proportional to account's share)
      const accountShare = totalBaseContribution > 0 ? currentContribution / totalBaseContribution : 1 / accounts.length;
      const adjustedContribution = Math.max(0, currentContribution + contributionDelta * accountShare);

      const employerMatch = calculateEmployerMatch({
        ...account,
        annualContribution: adjustedContribution,
      });
      const totalContribution = adjustedContribution + employerMatch;

      // Update balance
      balances[account.id] = balanceAfterReturn + totalContribution;

      // 3. Grow contribution for next year (use original, not adjusted — adjustment is transient)
      contributions[account.id] = currentContribution * (1 + account.contributionGrowthRate);
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

    yearlyBalances.push({
      age,
      year,
      balances: { ...balances },
      totalBalance,
      contributions: { ...contributions },
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
  profile: Profile
): Record<string, number> {
  const yearsToRetirement = profile.retirementAge - profile.currentAge;
  const totals: Record<string, number> = {};

  accounts.forEach(account => {
    let totalContribution = 0;
    let yearlyContribution = account.annualContribution;

    for (let i = 0; i < yearsToRetirement; i++) {
      const employerMatch = calculateEmployerMatch({
        ...account,
        annualContribution: yearlyContribution,
      });
      totalContribution += yearlyContribution + employerMatch;
      yearlyContribution *= (1 + account.contributionGrowthRate);
    }

    totals[account.id] = totalContribution;
  });

  return totals;
}
