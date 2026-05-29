import type { Assumptions } from '../types';

export interface AssumptionPreset {
  id: 'conservative' | 'moderate' | 'optimistic';
  label: string;
  description: string;
  values: Pick<Assumptions, 'inflationRate' | 'retirementReturnRate' | 'safeWithdrawalRate'>;
}

export const ASSUMPTION_PRESETS: AssumptionPreset[] = [
  {
    id: 'conservative',
    label: 'Conservative',
    description: 'Higher inflation, lower returns, safer withdrawal',
    values: { inflationRate: 0.035, retirementReturnRate: 0.04, safeWithdrawalRate: 0.035 },
  },
  {
    id: 'moderate',
    label: 'Moderate',
    description: 'Historical averages',
    values: { inflationRate: 0.03, retirementReturnRate: 0.05, safeWithdrawalRate: 0.04 },
  },
  {
    id: 'optimistic',
    label: 'Optimistic',
    description: 'Lower inflation, stronger returns',
    values: { inflationRate: 0.025, retirementReturnRate: 0.07, safeWithdrawalRate: 0.045 },
  },
];

/** Returns which preset id the given assumptions match, or null if custom. */
export function getActivePreset(
  assumptions: Pick<Assumptions, 'inflationRate' | 'retirementReturnRate' | 'safeWithdrawalRate'>,
): AssumptionPreset['id'] | null {
  for (const preset of ASSUMPTION_PRESETS) {
    if (
      preset.values.inflationRate === assumptions.inflationRate &&
      preset.values.retirementReturnRate === assumptions.retirementReturnRate &&
      preset.values.safeWithdrawalRate === assumptions.safeWithdrawalRate
    ) {
      return preset.id;
    }
  }
  return null;
}
