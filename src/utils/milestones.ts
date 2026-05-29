import {
  Account,
  Profile,
  AccumulationResult,
  RetirementResult,
  IncomeStream,
  Milestone,
  getTaxTreatment,
} from '../types';
import { FireResult, EarlyAccessAnalysis } from '../types';
import { RMD_START_AGE } from './constants';
import type { CountryConfig } from '../countries';

/**
 * Derive all plan milestones from existing result objects.
 * No new calculations — purely reads data already computed.
 */
export function deriveMilestones(
  profile: Profile,
  accounts: Account[],
  _accumulation: AccumulationResult | null,
  retirement: RetirementResult | null,
  fireResult: FireResult | null,
  earlyAccess: EarlyAccessAnalysis | null,
  incomeStreams: IncomeStream[],
  countryConfig: CountryConfig,
): Milestone[] {
  const milestones: Milestone[] = [];

  // --- Working / retirement boundary ---
  milestones.push({
    age: profile.retirementAge,
    label: 'Retirement',
    category: 'retirement',
    detail: 'Last working year; drawdown begins',
  });

  // --- FIRE achievement ---
  if (fireResult) {
    const fullTarget = fireResult.targets.find(t => t.id === 'full');
    if (fullTarget?.achieveAge && fullTarget.achieveAge < profile.retirementAge) {
      milestones.push({
        age: fullTarget.achieveAge,
        label: 'FIRE number hit',
        category: 'portfolio',
        detail: 'Portfolio reaches full financial independence target',
      });
    }
    if (fireResult.coastAchieveAge && fireResult.coastAchieveAge < profile.retirementAge) {
      milestones.push({
        age: fireResult.coastAchieveAge,
        label: 'Coast FIRE',
        category: 'portfolio',
        detail: 'Portfolio can grow to retirement target with no further contributions',
      });
    }
  }

  // --- Early access penalty-free age ---
  if (earlyAccess?.relevant && earlyAccess.penaltyFreeAge > profile.retirementAge) {
    milestones.push({
      age: earlyAccess.penaltyFreeAge,
      label: 'Penalty-free access',
      category: 'retirement',
      detail: `Traditional accounts accessible without 10% penalty (age ${earlyAccess.penaltyFreeAge})`,
    });
  }

  // --- Income streams (Social Security, pensions, etc.) ---
  for (const stream of incomeStreams) {
    if (stream.taxTreatment === 'social_security') {
      milestones.push({
        age: stream.startAge,
        label: stream.name || 'Social Security',
        category: 'benefits',
        detail: `$${stream.monthlyAmount.toLocaleString()}/mo (today's dollars)`,
      });
    } else if (stream.startAge >= profile.retirementAge) {
      // Other retirement income streams worth noting
      milestones.push({
        age: stream.startAge,
        label: stream.name,
        category: 'benefits',
        detail: `$${stream.monthlyAmount.toLocaleString()}/mo (today's dollars)`,
      });
    }
    // Mark stream end if within lifespan
    if (stream.endAge && stream.endAge <= profile.lifeExpectancy && stream.endAge > profile.retirementAge) {
      milestones.push({
        age: stream.endAge,
        label: `${stream.name} ends`,
        category: 'benefits',
      });
    }
  }

  // --- Canadian government benefits (CPP / OAS) ---
  if (profile.country === 'CA') {
    if (profile.socialSecurityStartAge && profile.socialSecurityBenefit) {
      milestones.push({
        age: profile.socialSecurityStartAge,
        label: 'CPP begins',
        category: 'benefits',
        detail: `$${Math.round((profile.socialSecurityBenefit ?? 0) / 12).toLocaleString()}/mo`,
      });
    }
    if (profile.secondaryBenefitStartAge && profile.secondaryBenefitAmount) {
      milestones.push({
        age: profile.secondaryBenefitStartAge,
        label: 'OAS begins',
        category: 'benefits',
        detail: `$${Math.round((profile.secondaryBenefitAmount ?? 0) / 12).toLocaleString()}/mo`,
      });
    }
  }

  // --- RMDs ---
  const rmdAge = countryConfig.code === 'CA' ? 71 : RMD_START_AGE;
  const hasTraditional = accounts.some(a => getTaxTreatment(a.type) === 'pretax');
  if (hasTraditional && rmdAge <= profile.lifeExpectancy) {
    milestones.push({
      age: rmdAge,
      label: countryConfig.code === 'CA' ? 'RRIF minimums begin' : 'RMDs begin',
      category: 'tax',
      detail: countryConfig.code === 'CA'
        ? 'Minimum RRIF withdrawals required'
        : 'Required Minimum Distributions from traditional accounts (age 73)',
    });
  }

  // --- Medicare eligibility (US only) ---
  if (profile.country === 'US' && profile.retirementAge < 65) {
    milestones.push({
      age: 65,
      label: 'Medicare eligible',
      category: 'benefits',
      detail: 'Health coverage no longer dependent on ACA marketplace',
    });
  }

  // --- Account unlock ages (accounts with non-standard start ages) ---
  for (const account of accounts) {
    const unlockAge = account.withdrawalRules?.startAge;
    if (
      unlockAge &&
      unlockAge > profile.retirementAge &&
      unlockAge !== rmdAge &&
      unlockAge <= profile.lifeExpectancy
    ) {
      milestones.push({
        age: unlockAge,
        label: `${account.name} unlocks`,
        category: 'portfolio',
        detail: `Withdrawals from ${account.name} become available`,
      });
    }
  }

  // --- Account depletions ---
  if (retirement) {
    for (const [accountId, depletionAge] of Object.entries(retirement.accountDepletionAges)) {
      if (depletionAge === null) continue;
      const account = accounts.find(a => a.id === accountId);
      if (!account) continue;
      if (depletionAge <= profile.retirementAge) continue;
      milestones.push({
        age: depletionAge,
        label: `${account.name} depleted`,
        category: 'portfolio',
        detail: 'Account balance reaches zero',
      });
    }

    // Portfolio depletion (the big one)
    if (retirement.portfolioDepletionAge !== null) {
      milestones.push({
        age: retirement.portfolioDepletionAge,
        label: 'Portfolio depleted',
        category: 'portfolio',
        isWarning: true,
        detail: 'Total portfolio balance reaches zero — spending exceeds remaining assets',
      });
    }
  }

  // Life expectancy end marker
  milestones.push({
    age: profile.lifeExpectancy,
    label: 'Life expectancy',
    category: 'retirement',
    detail: 'End of projection period',
  });

  // Deduplicate exact same label+age combos
  const seen = new Set<string>();
  return milestones.filter(m => {
    const key = `${m.age}:${m.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
