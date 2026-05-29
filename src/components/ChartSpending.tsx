import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { RetirementResult } from '../types';

interface ChartSpendingProps {
  result: RetirementResult;
  isDarkMode?: boolean;
}

function fmt(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

interface TooltipPayload { name: string; value: number; color: string; fill?: string }
interface CustomTooltipProps { active?: boolean; payload?: TooltipPayload[]; label?: number }

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const currency = (v: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
  return (
    <div className="bg-white dark:bg-gray-800 p-3 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg text-sm min-w-[180px]">
      <p className="font-medium text-gray-900 dark:text-white mb-2">Age {label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex justify-between gap-4">
          <span style={{ color: p.color || p.fill }} className="truncate">{p.name}</span>
          <span className="font-medium text-gray-900 dark:text-white">{currency(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function ChartSpending({ result, isDarkMode }: ChartSpendingProps) {
  const axisColor = isDarkMode ? '#9ca3af' : '#6b7280';

  const data = result.yearlyWithdrawals.map(yr => ({
    age: yr.age,
    'Portfolio withdrawals': yr.totalWithdrawal,
    'Govt / income streams': yr.governmentBenefitIncome + yr.incomeStreamIncome,
    'Spending target': yr.targetSpending,
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
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
        <Legend
          wrapperStyle={{ fontSize: '12px', color: axisColor }}
          iconType="square"
        />
        <Bar dataKey="Portfolio withdrawals" stackId="spend" fill="#60a5fa" radius={[0, 0, 0, 0]} />
        <Bar dataKey="Govt / income streams" stackId="spend" fill="#a78bfa" radius={[2, 2, 0, 0]} />
        <Line
          type="monotone"
          dataKey="Spending target"
          stroke="#f97316"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
