import type { MonteCarloConfig, MonteCarloResult, MonteCarloBand } from '../types';

/**
 * Monte Carlo retirement simulation.
 *
 * Approach: overlay randomized return sequences on the deterministic base run.
 * The deterministic withdrawal schedule (nominal portfolio draw per year) is held
 * fixed — only investment returns are randomized. This keeps the simulation
 * consistent with the tax-accurate deterministic projection: the *average* of all
 * runs tracks the deterministic line, while the spread shows sequence-of-returns risk.
 *
 * Returns are drawn from a log-normal distribution parameterised to preserve the
 * arithmetic mean (E[1+r] = 1 + retirementReturnRate) and the given stddev. Because
 * of volatility drag the median run sits slightly below the deterministic line — this
 * is correct and expected, not a bug.
 */

/** Standard normal sample via Box-Muller. */
function randNormal(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Derive log-normal parameters (mu, sigma) for a gross return G = 1 + r such that
 * E[G] = mean and SD[G] = stddev.
 */
function logNormalParams(mean: number, stddev: number): { mu: number; sigma: number } {
  const M = 1 + mean;            // target mean of gross return
  const V = stddev * stddev;     // target variance of gross return
  const sigma2 = Math.log(1 + V / (M * M));
  const sigma = Math.sqrt(sigma2);
  const mu = Math.log(M) - sigma2 / 2;
  return { mu, sigma };
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const idx = (sortedAsc.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  const frac = idx - lo;
  return sortedAsc[lo] * (1 - frac) + sortedAsc[hi] * frac;
}

export function runMonteCarlo(config: MonteCarloConfig): MonteCarloResult {
  const {
    startingPortfolio,
    withdrawalSchedule,
    retirementReturnRate,
    volatility,
    numRuns,
    startAge,
  } = config;

  const years = withdrawalSchedule.length;
  const { mu, sigma } = logNormalParams(retirementReturnRate, volatility);

  // balancesByYear[yearIndex] = array of end-of-year balances across all runs
  const balancesByYear: number[][] = Array.from({ length: years }, () => new Array(numRuns));
  let successes = 0;

  for (let run = 0; run < numRuns; run++) {
    let portfolio = startingPortfolio;
    let failed = false;

    for (let y = 0; y < years; y++) {
      const draw = withdrawalSchedule[y];

      if (!failed) {
        if (portfolio < draw) {
          // Can't fund this year's withdrawal — run has failed
          failed = true;
          portfolio = 0;
        } else {
          // Withdraw first, then apply that year's random return (matches deterministic order)
          portfolio -= draw;
          const gross = Math.exp(mu + sigma * randNormal());
          portfolio *= gross;
        }
      }

      balancesByYear[y][run] = portfolio;
    }

    if (!failed) successes++;
  }

  const bands: MonteCarloBand[] = balancesByYear.map((vals, y) => {
    const sorted = vals.slice().sort((a, b) => a - b);
    return {
      age: startAge + y,
      p10: percentile(sorted, 0.10),
      p25: percentile(sorted, 0.25),
      p50: percentile(sorted, 0.50),
      p75: percentile(sorted, 0.75),
      p90: percentile(sorted, 0.90),
    };
  });

  return {
    successRate: numRuns > 0 ? successes / numRuns : 0,
    bands,
    numRuns,
    medianEndingBalance: bands.length > 0 ? bands[bands.length - 1].p50 : 0,
    config,
  };
}
