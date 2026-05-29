import { useState } from 'react';
import { Account, AccumulationResult, getTaxTreatment } from '../types';
import { is401k } from '../types';

interface DataTableAccumulationProps {
  accounts: Account[];
  result: AccumulationResult;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

type ViewMode = 'summary' | 'balances' | 'contributions';

export function DataTableAccumulation({ accounts, result }: DataTableAccumulationProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('summary');

  if (!result.yearlyBalances.length) return null;

  const hasLifeEvents = result.yearlyBalances.some(y => y.netLifeEventCost !== 0);

  const getColorClass = (accountType: Account['type']): string => {
    const treatment = getTaxTreatment(accountType);
    switch (treatment) {
      case 'pretax':  return 'text-blue-600 dark:text-blue-400';
      case 'roth':    return 'text-green-600 dark:text-green-400';
      case 'taxable': return 'text-amber-600 dark:text-amber-400';
      case 'hsa':     return 'text-purple-600 dark:text-purple-400';
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex justify-between items-center hover:bg-gray-50 dark:hover:bg-gray-700 rounded-t-lg"
      >
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <span className="font-medium text-gray-900 dark:text-white">Year-by-Year Data</span>
        </div>
        <svg
          className={`w-5 h-5 text-gray-500 dark:text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4">
          {/* View Mode Tabs */}
          <div className="flex gap-2 mb-4 border-b border-gray-200 dark:border-gray-700">
            {(['summary', 'balances', 'contributions'] as ViewMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px capitalize ${
                  viewMode === mode
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                {mode === 'contributions' ? 'Contributions' : mode === 'balances' ? 'Balances by Account' : 'Summary'}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto">

            {/* ── Summary ── */}
            {viewMode === 'summary' && (
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-2 px-2 font-medium text-gray-700 dark:text-gray-300 sticky left-0 bg-white dark:bg-gray-800">Age</th>
                    <th className="text-left py-2 px-2 font-medium text-gray-700 dark:text-gray-300">Year</th>
                    <th className="text-right py-2 px-2 font-medium text-gray-700 dark:text-gray-300">Total Balance</th>
                    <th className="text-right py-2 px-2 font-medium text-gray-700 dark:text-gray-300">Year Growth</th>
                    <th className="text-right py-2 px-2 font-medium text-gray-700 dark:text-gray-300">You</th>
                    <th className="text-right py-2 px-2 font-medium text-green-600 dark:text-green-400">Match</th>
                    <th className="text-right py-2 px-2 font-medium text-gray-700 dark:text-gray-300">Total Contrib</th>
                    {hasLifeEvents && (
                      <th className="text-right py-2 px-2 font-medium text-orange-600 dark:text-orange-400">
                        Out of Pocket
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {result.yearlyBalances.map((yearData, index) => {
                    const prevBalance   = index > 0 ? result.yearlyBalances[index - 1].totalBalance : yearData.totalBalance;
                    const growth        = yearData.totalBalance - prevBalance;
                    const totalEmployee = Object.values(yearData.contributions).reduce((s, c) => s + c, 0);
                    const totalMatch    = Object.values(yearData.employerContributions).reduce((s, c) => s + c, 0);
                    const oop           = yearData.netLifeEventCost;

                    return (
                      <tr key={yearData.age} className={`border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 ${oop > 0 ? 'bg-orange-50/40 dark:bg-orange-900/10' : ''}`}>
                        <td className="py-2 px-2 font-medium text-gray-900 dark:text-white sticky left-0 bg-white dark:bg-gray-800">{yearData.age}</td>
                        <td className="py-2 px-2 text-gray-600 dark:text-gray-400">{yearData.year}</td>
                        <td className="py-2 px-2 text-right font-mono text-gray-900 dark:text-white">{formatCurrency(yearData.totalBalance)}</td>
                        <td className={`py-2 px-2 text-right font-mono ${growth >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                          {index === 0 ? '—' : (growth >= 0 ? '+' : '') + formatCurrency(growth)}
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-gray-600 dark:text-gray-400">
                          {totalEmployee > 0 ? formatCurrency(totalEmployee) : '—'}
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-green-600 dark:text-green-400">
                          {totalMatch > 0 ? `+${formatCurrency(totalMatch)}` : '—'}
                        </td>
                        <td className="py-2 px-2 text-right font-mono font-medium text-gray-900 dark:text-white">
                          {(totalEmployee + totalMatch) > 0 ? formatCurrency(totalEmployee + totalMatch) : '—'}
                        </td>
                        {hasLifeEvents && (
                          <td className={`py-2 px-2 text-right font-mono font-medium ${
                            oop > 0 ? 'text-orange-600 dark:text-orange-400'
                            : oop < 0 ? 'text-green-600 dark:text-green-400'
                            : 'text-gray-400 dark:text-gray-600'
                          }`}>
                            {oop > 0 ? formatCurrency(oop)
                            : oop < 0 ? `+${formatCurrency(-oop)}`
                            : '—'}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
                {hasLifeEvents && (
                  <tfoot>
                    <tr className="border-t-2 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900">
                      <td colSpan={7} className="py-2 px-2 font-medium text-gray-700 dark:text-gray-300 sticky left-0 bg-gray-50 dark:bg-gray-900 text-right">
                        Lifetime out-of-pocket from life events:
                      </td>
                      <td className="py-2 px-2 text-right font-mono font-bold text-orange-600 dark:text-orange-400">
                        {(() => {
                          const total = result.yearlyBalances.reduce((s, y) => s + y.netLifeEventCost, 0);
                          return total > 0 ? formatCurrency(total) : total < 0 ? `+${formatCurrency(-total)}` : '—';
                        })()}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            )}

            {/* ── Balances by Account ── */}
            {viewMode === 'balances' && (
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-2 px-2 font-medium text-gray-700 dark:text-gray-300 sticky left-0 bg-white dark:bg-gray-800">Age</th>
                    {accounts.map(acc => (
                      <th key={acc.id} className={`text-right py-2 px-2 font-medium ${getColorClass(acc.type)}`}>
                        {acc.name}
                      </th>
                    ))}
                    <th className="text-right py-2 px-2 font-medium text-gray-700 dark:text-gray-300">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {result.yearlyBalances.map((yearData) => (
                    <tr key={yearData.age} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="py-2 px-2 font-medium text-gray-900 dark:text-white sticky left-0 bg-white dark:bg-gray-800">{yearData.age}</td>
                      {accounts.map(acc => (
                        <td key={acc.id} className="py-2 px-2 text-right font-mono text-gray-600 dark:text-gray-400">
                          {formatCurrency(yearData.balances[acc.id] || 0)}
                        </td>
                      ))}
                      <td className="py-2 px-2 text-right font-mono font-medium text-gray-900 dark:text-white">
                        {formatCurrency(yearData.totalBalance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* ── Contributions ── */}
            {viewMode === 'contributions' && (
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-2 px-2 font-medium text-gray-700 dark:text-gray-300 sticky left-0 bg-white dark:bg-gray-800">Age</th>
                    {accounts.map(acc => (
                      <th key={acc.id} className={`text-right py-2 px-2 font-medium ${getColorClass(acc.type)}`} colSpan={
                        (is401k(acc.type) || acc.type === 'employer_rrsp') && acc.employerMatchPercent ? 2 : 1
                      }>
                        {acc.name}
                      </th>
                    ))}
                    <th className="text-right py-2 px-2 font-medium text-gray-700 dark:text-gray-300">Total</th>
                  </tr>
                  <tr className="border-b border-gray-200 dark:border-gray-700 text-xs">
                    <th className="sticky left-0 bg-white dark:bg-gray-800" />
                    {accounts.map(acc => {
                      const hasMatch = (is401k(acc.type) || acc.type === 'employer_rrsp') && !!acc.employerMatchPercent;
                      return hasMatch ? (
                        <>
                          <th key={`${acc.id}-you`} className="text-right py-1 px-2 font-normal text-gray-500 dark:text-gray-400">You</th>
                          <th key={`${acc.id}-match`} className="text-right py-1 px-2 font-normal text-green-600 dark:text-green-400">Match</th>
                        </>
                      ) : (
                        <th key={acc.id} />
                      );
                    })}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {result.yearlyBalances.map((yearData) => {
                    const rowTotal = accounts.reduce((s, acc) =>
                      s + (yearData.contributions[acc.id] || 0) + (yearData.employerContributions[acc.id] || 0), 0);
                    return (
                      <tr key={yearData.age} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td className="py-2 px-2 font-medium text-gray-900 dark:text-white sticky left-0 bg-white dark:bg-gray-800">{yearData.age}</td>
                        {accounts.map(acc => {
                          const contrib = yearData.contributions[acc.id] || 0;
                          const match   = yearData.employerContributions[acc.id] || 0;
                          const hasMatch = (is401k(acc.type) || acc.type === 'employer_rrsp') && !!acc.employerMatchPercent;
                          return hasMatch ? (
                            <>
                              <td key={`${acc.id}-you`} className="py-2 px-2 text-right font-mono text-gray-600 dark:text-gray-400">
                                {contrib > 0 ? formatCurrency(contrib) : '—'}
                              </td>
                              <td key={`${acc.id}-match`} className="py-2 px-2 text-right font-mono text-green-600 dark:text-green-400">
                                {match > 0 ? formatCurrency(match) : '—'}
                              </td>
                            </>
                          ) : (
                            <td key={acc.id} className="py-2 px-2 text-right font-mono text-gray-600 dark:text-gray-400">
                              {contrib > 0 ? formatCurrency(contrib) : '—'}
                            </td>
                          );
                        })}
                        <td className="py-2 px-2 text-right font-mono font-medium text-gray-900 dark:text-white">
                          {rowTotal > 0 ? formatCurrency(rowTotal) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900">
                    <td className="py-2 px-2 font-medium text-gray-700 dark:text-gray-300 sticky left-0 bg-gray-50 dark:bg-gray-900">Lifetime Total</td>
                    {accounts.map(acc => {
                      const hasMatch = (is401k(acc.type) || acc.type === 'employer_rrsp') && !!acc.employerMatchPercent;
                      const lifetimeContrib = result.yearlyBalances.reduce((s, yr) => s + (yr.contributions[acc.id] || 0), 0);
                      const lifetimeMatch   = result.yearlyBalances.reduce((s, yr) => s + (yr.employerContributions[acc.id] || 0), 0);
                      return hasMatch ? (
                        <>
                          <td key={`${acc.id}-you`} className="py-2 px-2 text-right font-mono font-medium text-gray-700 dark:text-gray-300">
                            {formatCurrency(lifetimeContrib)}
                          </td>
                          <td key={`${acc.id}-match`} className="py-2 px-2 text-right font-mono font-medium text-green-600 dark:text-green-400">
                            {formatCurrency(lifetimeMatch)}
                          </td>
                        </>
                      ) : (
                        <td key={acc.id} className="py-2 px-2 text-right font-mono font-medium text-gray-700 dark:text-gray-300">
                          {formatCurrency(lifetimeContrib)}
                        </td>
                      );
                    })}
                    <td className="py-2 px-2 text-right font-mono font-bold text-gray-900 dark:text-white">
                      {formatCurrency(result.yearlyBalances.reduce((s, yr) =>
                        s + accounts.reduce((a, acc) =>
                          a + (yr.contributions[acc.id] || 0) + (yr.employerContributions[acc.id] || 0), 0), 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>

          {/* Legend */}
          <div className="mt-4 flex flex-wrap gap-4 text-xs">
            {[
              { color: 'bg-blue-500',   label: 'Pre-tax' },
              { color: 'bg-green-500',  label: 'Roth' },
              { color: 'bg-amber-500',  label: 'Taxable' },
              { color: 'bg-purple-500', label: 'HSA' },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-1">
                <span className={`w-3 h-3 rounded ${color}`} />
                <span className="text-gray-600 dark:text-gray-400">{label}</span>
              </div>
            ))}
            <div className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-green-400 opacity-60" />
              <span className="text-gray-600 dark:text-gray-400">Employer match (green columns)</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
