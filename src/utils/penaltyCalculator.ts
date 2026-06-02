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
  /**
   * HSA only: when true, this withdrawal is non-medical and incurs a 20% penalty before
   * age 65 (US). Undefined/false => medical use, penalty-free (the default assumption).
   */
  hsaNonMedical?: boolean;
}

// HSA non-medical early-withdrawal rules (US). Distinct from the 10%/59.5 rule for
// traditional accounts: 20% penalty on non-medical withdrawals before age 65.
const HSA_PENALTY_AGE = 65;
const HSA_PENALTY_RATE = 0.20;

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
      continue;
    }

    // Case 3: HSA non-medical withdrawal before 65 — a distinct 20% penalty (US).
    // Medical HSA use (the default) is penalty-free, so this only fires when the
    // account is flagged non-medical.
    if (
      withdrawal.accountType === 'hsa' &&
      withdrawal.hsaNonMedical &&
      currentAge < HSA_PENALTY_AGE
    ) {
      const penaltyAmount = withdrawal.amount * HSA_PENALTY_RATE;
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
