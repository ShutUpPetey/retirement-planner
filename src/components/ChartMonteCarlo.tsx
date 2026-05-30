import { useMemo } from 'react';
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import type { MonteCarloResult } from '../types';

interface ChartMonteCarloProps {
  result: MonteCarloResult;
  isRunning?: boolean;
  /** age -> deterministic remaining balance, for the overlay reference line */
  deterministicByAge?: Record<number, number>;
  lifeExpectancy?: number;
  isDarkMode?: boolean;
}

function fmt(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}
function currency(v: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
}

interface TooltipRow { p10: number; p25: number; p50: number; p75: number; p90: number; det?: number }
interface TProps {
  active?: boolean;
  payload?: { payload: TooltipRow & { age: number } }[];
  label?: number;
}
function FanTooltip({ active, payload, label }: TProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const rows: [string, number, string][] = [
    ['90th percentile', d.p90, 'text-green-600 dark:text-green-400'],
    ['75th', d.p75, 'text-green-600 dark:text-green-400'],
    ['Median', d.p50, 'text-gray-900 dark:text-white'],
    ['25th', d.p25, 'text-amber-600 dark:text-amber-400'],
    ['10th percentile', d.p10, 'text-red-600 dark:text-red-400'],
  ];
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3 text-sm min-w-[180px]">
      <p className="font-semibold text-gray-900 dark:text-white mb-1.5">Age {label}</p>
      {rows.map(([name, val, cls]) => (
        <div key={name} className="flex justify-between gap-4">
          <span className="text-gray-500 dark:text-gray-400">{name}</span>
          <span className={`font-medium ${cls}`}>{currency(val)}</span>
        </div>
      ))}
      {d.det !== undefined && (
        <div className="flex justify-between gap-4 mt-1.5 pt-1.5 border-t border-gray-100 dark:border-gray-700">
          <span className="text-blue-500">Deterministic</span>
          <span className="font-medium text-blue-500">{currency(d.det)}</span>
        </div>
      )}
    </div>
  );
}

function successColor(rate: number): { text: string; bg: string; label: string } {
  if (rate >= 0.85) return { text: 'text-green-700 dark:text-green-300', bg: 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800', label: 'Strong' };
  if (rate >= 0.70) return { text: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800', label: 'Moderate' };
  return { text: 'text-red-700 dark:text-red-300', bg: 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800', label: 'At risk' };
}

export function ChartMonteCarlo({ result, isRunning, deterministicByAge, isDarkMode }: ChartMonteCarloProps) {
  const axisColor = isDarkMode ? '#9ca3af' : '#6b7280';
  const gridColor = isDarkMode ? '#1f2937' : '#f3f4f6';

  const data = useMemo(() => result.bands.map(b => ({
    age: b.age,
    p10: b.p10,
    // stacked deltas for the fan bands (base = p10, transparent)
    b10_25: b.p25 - b.p10,
    b25_50: b.p50 - b.p25,
    b50_75: b.p75 - b.p50,
    b75_90: b.p90 - b.p75,
    p25: b.p25, p50: b.p50, p75: b.p75, p90: b.p90,
    det: deterministicByAge?.[b.age],
  })), [result, deterministicByAge]);

  const sc = successColor(result.successRate);
  const successPct = Math.round(result.successRate * 100);

  return (
    <div className="space-y-4">
      {/* Headline badges */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className={`rounded-lg border p-4 ${sc.bg} sm:col-span-1`}>
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Success probability</p>
          <p className={`text-3xl font-bold ${sc.text}`}>
            {successPct}%
            {isRunning && <span className="text-sm font-normal ml-2 animate-pulse">recalculating…</span>}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {sc.label} · {successPct}% of {result.numRuns.toLocaleString()} runs funded every year to life expectancy
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Median ending balance</p>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">{fmt(result.medianEndingBalance)}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Half of runs end above this (nominal $)</p>
        </div>
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Failure rate</p>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">{100 - successPct}%</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Runs that depleted before life expectancy</p>
        </div>
      </div>

      {/* Fan chart */}
      <ResponsiveContainer width="100%" height={340}>
        <ComposedChart data={data} margin={{ top: 10, right: 12, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
          <XAxis dataKey="age" tick={{ fill: axisColor, fontSize: 12 }} tickLine={false} axisLine={false} />
          <YAxis tickFormatter={fmt} tick={{ fill: axisColor, fontSize: 12 }} tickLine={false} axisLine={false} width={56} />
          <Tooltip content={<FanTooltip />} />

          {/* Transparent baseline up to p10 */}
          <Area dataKey="p10" stackId="fan" stroke="none" fill="transparent" isAnimationActive={false} />
          {/* Outer band p10–p25 (light) */}
          <Area dataKey="b10_25" stackId="fan" stroke="none" fill="#3b82f6" fillOpacity={0.12} isAnimationActive={false} />
          {/* Inner band p25–p50 (medium) */}
          <Area dataKey="b25_50" stackId="fan" stroke="none" fill="#3b82f6" fillOpacity={0.28} isAnimationActive={false} />
          {/* Inner band p50–p75 (medium) */}
          <Area dataKey="b50_75" stackId="fan" stroke="none" fill="#3b82f6" fillOpacity={0.28} isAnimationActive={false} />
          {/* Outer band p75–p90 (light) */}
          <Area dataKey="b75_90" stackId="fan" stroke="none" fill="#3b82f6" fillOpacity={0.12} isAnimationActive={false} />

          {/* Median line */}
          <Line dataKey="p50" stroke="#2563eb" strokeWidth={2.5} dot={false} isAnimationActive={false} />
          {/* Deterministic overlay */}
          {deterministicByAge && (
            <Line dataKey="det" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
          )}
          <ReferenceLine y={0} stroke={isDarkMode ? '#4b5563' : '#d1d5db'} />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
        <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-blue-500" style={{ opacity: 0.28 }} />25th–75th percentile</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-blue-500" style={{ opacity: 0.12 }} />10th–90th percentile</span>
        <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 bg-blue-600" />Median path</span>
        {deterministicByAge && (
          <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 bg-amber-500" style={{ borderTop: '1px dashed' }} />Deterministic projection</span>
        )}
      </div>

      <p className="text-xs text-gray-400 dark:text-gray-500">
        Randomizes annual returns (log-normal, preserving your {/* note */}mean return and volatility) while holding the
        deterministic withdrawal schedule fixed. The median sits slightly below the deterministic line due to volatility
        drag — this is expected. Balances are nominal (future) dollars.
      </p>
    </div>
  );
}
