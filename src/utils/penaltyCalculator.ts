import type { CountryConfig } from '../countries';
import type { EarlyWithdrawalPenalty } from '../types';

/**
 * Represents a withdrawal from an account for penalty calculation
 */
export interface AccountWithdrawal {
  accountId: string;
  accountName: string;
  accountType: string;
  amount: number;
  /**
   * Optional override for the portion of `amount` subject to early-withdrawal penalty.
   * Used for Roth accounts with tracked basis: only the earnings portion is penalizable.
   * When undefined, the full `amount` is treated as penalizable (legacy behavior).
   */
  penalizableAmount?: number;
}

/**
 * Calculate early withdrawal penalties for a list of withdrawals
 *
 * @param withdrawals - Array of withdrawals to check for penalties
 * @param currentAge - Age at time of withdrawal
 * @param countryConfig - Country configuration with penalty rules
 * @returns Array of penalties that apply
 */
export function calculatePenalties(
  withdrawals: AccountWithdrawal[],
  currentAge: number,
  countryConfig: CountryConfig
): EarlyWithdrawalPenalty[] {
  const penalties: EarlyWithdrawalPenalty[] = [];

  for (const withdrawal of withdrawals) {
    const penaltyInfo = countryConfig.getPenaltyInfo(withdrawal.accountType);

    // Case 1: account types the country flags as penalty-bearing (e.g. US traditional).
    if (penaltyInfo.appliesToAccountType && currentAge < penaltyInfo.penaltyAge) {
      const penaltyAmount = countryConfig.calculateEarlyWithdrawalPenalty(
        withdrawal.amount,
        withdrawal.accountType,
        currentAge
      );
      if (penaltyAmount > 0) {
        penalties.push({
          amount: penaltyAmount,
          accountId: withdrawal.accountId,
          accountName: withdrawal.accountName,
        });
      }
      continue;
    }

    // Case 2: Roth (or similar) with a tracked earnings portion. The type itself isn't
    // flagged as penalty-bearing, but the earnings withdrawn before the penalty age are.
    // Apply the country's standard penalty rate to just that portion.
    if (
      withdrawal.penalizableAmount !== undefined &&
      withdrawal.penalizableAmount > 0 &&
      currentAge < penaltyInfo.penaltyAge
    ) {
      const penaltyAmount = withdrawal.penalizableAmount * penaltyInfo.penaltyRate;
      if (penaltyAmount > 0) {
        penalties.push({
          amount: penaltyAmount,
          accountId: withdrawal.accountId,
          accountName: withdrawal.accountName,
        });
      }
    }
  }

  return penalties;
}
