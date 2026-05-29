import { useMemo } from 'react';
import { SavedScenario } from '../types';
import { calculateAccumulation } from '../utils/projections';
import { calculateWithdrawals } from '../utils/withdrawals';
import { getCountryConfig } from '../countries';
import type { CountryCode } from '../countries';

interface ScenarioComparisonProps {
  scenarios: SavedScenario[];
  onDelete: (id: string) => void;
  onRestore: (state: SavedScenario['state']) => void;
}

interface Metrics {
  totalAtRetirementReal: number;   // today's dollars
  monthlyWithdrawalReal: number;   // today's dollars
  portfolioDepletionAge: number | null;
  lifetimeTaxesReal: number;       // today's dollars (rough)
  retirementAge: number;
}

function computeMetrics(scenario: SavedScenario): Metrics {
  const { accounts, profile, assumptions, incomeStreams, lifeEvents } = scenario.state;
  const countryConfig = getCountryConfig(profile.country as CountryCode);

  const yearsToRetirement = Math.max(0, profile.retirementAge - profile.currentAge);
  const deflator = Math.pow(1 + assumptions.inflationRate, yearsToRetirement);
  const empty: Metrics = {
    totalAtRetirementReal: 0, monthlyWithdrawalReal: 0,
    portfolioDepletionAge: null, lifetimeTaxesReal: 0,
    retirementAge: profile.retirementAge,
  };

  if (accounts.length === 0) return empty;

  const accumulation = calculateAccumulation(accounts, profile, countryConfig, lifeEvents, assumptions.inflationRate);
  if (accumulation.totalAtRetirement === 0) return empty;

  const retirement = calculateWithdrawals(
    accounts, profile, assumptions, accumulation, countryConfig, incomeStreams, lifeEvents
  );

  return {
    retirementAge: profile.retirementAge,
    totalAtRetirementReal: accumulation.totalAtRetirement / deflator,
    monthlyWithdrawalReal: retirement.sustainableMonthlyWithdrawal / deflator,
    portfolioDepletionAge: retirement.portfolioDepletionAge,
    lifetimeTaxesReal: retirement.lifetimeTaxesPaid / deflator,
  };
}

function fmt(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function ScenarioComparison({ scenarios, onDelete, onRestore }: ScenarioComparisonProps) {
  const rows = useMemo(() => scenarios.map(s => ({ scenario: s, metrics: computeMetrics(s) })), [scenarios]);

  if (scenarios.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-10 text-center">
        <div className="text-4xl mb-3">📊</div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No saved scenarios yet</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
          Use the <strong>Save Scenario</strong> button above the tabs to snapshot your current plan.
          You can save up to 6 scenarios and compare them side-by-side here.
        </p>
      </div>
    );
  }

  // Find best values in each column for highlighting
  const bestPortfolio = Math.max(...rows.map(r => r.metrics.totalAtRetirementReal));
  const bestMonthly   = Math.max(...rows.map(r => r.metrics.monthlyWithdrawalReal));
  const lowestTaxes   = Math.min(...rows.filter(r => r.metrics.lifetimeTaxesReal > 0).map(r => r.metrics.lifetimeTaxesReal));

  const HEADERS = ['Scenario', 'Retire', 'Portfolio at Retirement', 'Monthly Withdrawal', 'Portfolio Lasts', 'Lifetime Taxes', ''];

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        All monetary values in <strong>today's dollars</strong>. Restoring a scenario replaces all current inputs.
      </p>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
              {HEADERS.map(h => (
                <th key={h} className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {rows.map(({ scenario, metrics }) => {
              const isBestPortfolio = metrics.totalAtRetirementReal === bestPortfolio && bestPortfolio > 0;
              const isBestMonthly   = metrics.monthlyWithdrawalReal === bestMonthly && bestMonthly > 0;
              const isLowestTax     = metrics.lifetimeTaxesReal === lowestTaxes && lowestTaxes < Infinity;
              const depletes        = metrics.portfolioDepletionAge !== null;
              const isBestDepletion = !depletes;
              const depletionLabel  = depletes
                ? `Age ${metrics.portfolioDepletionAge}`
                : 'Never ✓';

              return (
                <tr key={scenario.id} className="bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-750">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-gray-900 dark:text-white">{scenario.name}</div>
                    <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{fmtDate(scenario.savedAt)}</div>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300">
                    {metrics.retirementAge}
                  </td>
                  <td className={`px-4 py-3 font-semibold ${isBestPortfolio ? 'text-green-600 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'}`}>
                    {fmt(metrics.totalAtRetirementReal)}
                    {isBestPortfolio && <span className="ml-1 text-xs">★</span>}
                  </td>
                  <td className={`px-4 py-3 font-semibold ${isBestMonthly ? 'text-green-600 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'}`}>
                    {fmt(metrics.monthlyWithdrawalReal)}/mo
                    {isBestMonthly && <span className="ml-1 text-xs">★</span>}
                  </td>
                  <td className={`px-4 py-3 font-semibold ${isBestDepletion ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {depletionLabel}
                  </td>
                  <td className={`px-4 py-3 font-semibold ${isLowestTax ? 'text-green-600 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'}`}>
                    {fmt(metrics.lifetimeTaxesReal)}
                    {isLowestTax && <span className="ml-1 text-xs">★</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onRestore(scenario.state)}
                        className="px-2.5 py-1 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                      >
                        Restore
                      </button>
                      <button
                        onClick={() => onDelete(scenario.id)}
                        className="px-2.5 py-1 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {rows.map(({ scenario, metrics }) => {
          const depletes       = metrics.portfolioDepletionAge !== null;
          const depletionLabel = depletes ? `Depletes age ${metrics.portfolioDepletionAge}` : 'Never depletes ✓';
          return (
            <div key={scenario.id} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-semibold text-gray-900 dark:text-white">{scenario.name}</div>
                  <div className="text-xs text-gray-400 dark:text-gray-500">{fmtDate(scenario.savedAt)}</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => onRestore(scenario.state)} className="text-xs px-2.5 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700 rounded">Restore</button>
                  <button onClick={() => onDelete(scenario.id)} className="text-xs px-2.5 py-1 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-700 rounded">Delete</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-gray-500 dark:text-gray-400">Retire age:</span> <strong className="text-gray-900 dark:text-white">{metrics.retirementAge}</strong></div>
                <div><span className="text-gray-500 dark:text-gray-400">Portfolio:</span> <strong className="text-gray-900 dark:text-white">{fmt(metrics.totalAtRetirementReal)}</strong></div>
                <div><span className="text-gray-500 dark:text-gray-400">Monthly:</span> <strong className="text-gray-900 dark:text-white">{fmt(metrics.monthlyWithdrawalReal)}</strong></div>
                <div><span className={`font-semibold ${depletes ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>{depletionLabel}</span></div>
                <div className="col-span-2"><span className="text-gray-500 dark:text-gray-400">Lifetime taxes:</span> <strong className="text-gray-900 dark:text-white">{fmt(metrics.lifetimeTaxesReal)}</strong></div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-gray-400 dark:text-gray-500">
        ★ = best value in that column across saved scenarios
      </p>
    </div>
  );
}
