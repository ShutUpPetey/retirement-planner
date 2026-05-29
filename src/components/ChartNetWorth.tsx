import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { AccumulationResult, RetirementResult, Profile } from '../types';

interface ChartNetWorthProps {
  accumulation: AccumulationResult;
  retirement: RetirementResult;
  profile: Profile;
  isDarkMode?: boolean;
}

function fmt(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

interface TooltipPayload { name: string; value: number; color: string }
interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: number;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const val = payload[0]?.value ?? 0;
  return (
    <div className="bg-white dark:bg-gray-800 p-3 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg text-sm">
      <p className="font-medium text-gray-900 dark:text-white mb-1">Age {label}</p>
      <p className="text-blue-600 dark:text-blue-400">
        Net worth: {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val)}
      </p>
    </div>
  );
}

export function ChartNetWorth({ accumulation, retirement, profile, isDarkMode }: ChartNetWorthProps) {
  const axisColor = isDarkMode ? '#9ca3af' : '#6b7280';

  // Stitch accumulation + retirement into one continuous series
  const data: { age: number; netWorth: number; phase: 'accumulation' | 'retirement' }[] = [];

  for (const yr of accumulation.yearlyBalances) {
    data.push({ age: yr.age, netWorth: yr.totalBalance, phase: 'accumulation' });
  }

  for (const yr of retirement.yearlyWithdrawals) {
    // Skip overlap at retirement age (already in accumulation)
    if (yr.age <= profile.retirementAge) continue;
    data.push({ age: yr.age, netWorth: Math.max(0, yr.totalRemainingBalance), phase: 'retirement' });
  }

  const peak = Math.max(...data.map(d => d.netWorth));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
        <defs>
          <linearGradient id="netWorthGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? '#374151' : '#f0f0f0'} />
        <XAxis
          dataKey="age"
          tick={{ fill: axisColor, fontSize: 12 }}
          tickLine={false}
          label={{ value: 'Age', position: 'insideBottom', offset: -2, fill: axisColor, fontSize: 12 }}
        />
        <YAxis
          tickFormatter={fmt}
          tick={{ fill: axisColor, fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          width={70}
        />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine
          x={profile.retirementAge}
          stroke={isDarkMode ? '#6b7280' : '#9ca3af'}
          strokeDasharray="4 4"
          label={{ value: 'Retire', position: 'top', fill: axisColor, fontSize: 11 }}
        />
        {retirement.portfolioDepletionAge !== null && (
          <ReferenceLine
            x={retirement.portfolioDepletionAge}
            stroke="#ef4444"
            strokeDasharray="4 4"
            label={{ value: 'Depleted', position: 'top', fill: '#ef4444', fontSize: 11 }}
          />
        )}
        <Area
          type="monotone"
          dataKey="netWorth"
          name="Net worth"
          stroke="#3b82f6"
          strokeWidth={2}
          fill="url(#netWorthGrad)"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
        />
        {/* Invisible reference for peak annotation */}
        {peak > 0 && <ReferenceLine y={peak} stroke="transparent" />}
      </AreaChart>
    </ResponsiveContainer>
  );
}
