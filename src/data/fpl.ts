/**
 * Federal Poverty Level (FPL) thresholds — 2024, 48 contiguous states + DC.
 *
 * ACA premium tax credits for a coverage year use the PRIOR year's FPL, so these
 * 2024 figures drive 2025 coverage-year subsidy math. Alaska and Hawaii have higher
 * FPLs (not modeled here — flagged in the UI). Source: HHS poverty guidelines (public domain).
 */
export const FPL_2024_BASE = 15060; // household of 1
export const FPL_2024_PER_ADDITIONAL = 5380;

/** Annual FPL for a given household size (48 states + DC, 2024). */
export function federalPovertyLevel(householdSize: number): number {
  const size = Math.max(1, Math.floor(householdSize));
  return FPL_2024_BASE + (size - 1) * FPL_2024_PER_ADDITIONAL;
}
