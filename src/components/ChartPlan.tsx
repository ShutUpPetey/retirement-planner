import { useState, useMemo } from 'react';
import {
  ComposedChart,
  Area,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { AccumulationResult, RetirementResult, Profile, Milestone, MilestoneCategory } from '../types';

// ── Types ──────────────────────────────────────────────────────────────────────

type Metric = 'netWorth' | 'spending' | 'income' | 'taxes';

const METRICS: { id: Metric; label: string }[] = [
  { id: 'netWorth',  label: 'Net worth'  },
  { id: 'spending',  label: 'Spending'   },
  { id: 'income',    label: 'Income'     },
  { id: 'taxes',     label: 'Taxes'      },
];

const CAT_COLOR: Record<MilestoneCategory, string> = {
  work:       '#3b82f6',
  retirement: '#22c55e',
  benefits:   '#a855f7',
  portfolio:  '#f97316',
  tax:        '#eab308',
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function currency(v: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
}

// ── Milestone icon rendered inside the chart via ReferenceLine label ───────────

interface MarkerLabelProps {
  viewBox?: { x: number; y: number; width: number; height: number };
  milestone: Milestone;
  offset: number; // 0 or 1 — alternates vertical position
}

function MarkerLabel({ viewBox, milestone, offset }: MarkerLabelProps) {
  if (!viewBox) return null;
  const cx = viewBox.x;
  const cy = viewBox.y + 10 + offset * 14;
  const color = milestone.isWarning ? '#ef4444' : CAT_COLOR[milestone.category] ?? '#6b7280';
  return (
    <g style={{ pointerEvents: 'none' }}>
      <circle cx={cx} cy={cy} r={5} fill={color} stroke="white" strokeWidth={1.5} />
    </g>
  );
}

// ── Tooltip ────────────────────────────────────────────────────────────────────

interface TPayload { name: string; value: number; color?: string; fill?: string }
interface TProps {
  active?: boolean;
  payload?: TPayload[];
  label?: number;
  milestones: Milestone[];
  metric: Metric;
}

function ChartTooltip({ active, payload, label, milestones }: TProps) {
  if (!active || !payload?.length || label === undefined) return null;
  const atAge = milestones.filter(m => m.age === label);
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3 text-sm min-w-[180px]">
      <p className="font-semibold text-gray-900 dark:text-white mb-2">Age {label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex justify-between gap-3">
          <span style={{ color: p.color ?? p.fill }} className="truncate max-w-[110px]">{p.name}</span>
          <span className="font-medium text-gray-900 dark:text-white">{currency(p.value)}</span>
        </div>
      ))}
      {atAge.length > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700 space-y-1">
          {atAge.map((m, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: m.isWarning ? '#ef4444' : CAT_COLOR[m.category] }}
              />
              <span className="text-gray-600 dark:text-gray-300 text-xs">{m.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface ChartPlanProps {
  accumulation: AccumulationResult;
  retirement: RetirementResult;
  profile: Profile;
  milestones: Milestone[];
  isDarkMode?: boolean;
}

export function ChartPlan({ accumulation, retirement, profile, milestones, isDarkMode }: ChartPlanProps) {
  const [metric, setMetric] = useState<Metric>('netWorth');

  const axisColor = isDarkMode ? '#9ca3af' : '#6b7280';
  const gridColor = isDarkMode ? '#1f2937' : '#f3f4f6';

  // Stitch accumulation + retirement into one age-keyed row
  const data = useMemo(() => {
    const map = new Map<number, Record<string, number>>();

    for (const yr of accumulation.yearlyBalances) {
      map.set(yr.age, { netWorth: yr.totalBalance });
    }
    for (const yr of retirement.yearlyWithdrawals) {
      const existing = map.get(yr.age) ?? {};
      map.set(yr.age, {
        ...existing,
        netWorth:           Math.max(0, yr.totalRemainingBalance),
        portfolioWithdraw:  yr.totalWithdrawal,
        govtIncome:         yr.governmentBenefitIncome + yr.incomeStreamIncome,
        spendingTarget:     yr.targetSpending,
        federalTax:         yr.federalTax,
        stateTax:           yr.stateTax,
      });
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a - b)
      .map(([age, vals]) => ({ age, ...vals }));
  }, [accumulation, retirement]);

  // Unique milestone ages (deduplicated for reference lines)
  const milestoneAges = useMemo(() => {
    const seen = new Set<number>();
    return milestones.filter(m => {
      if (seen.has(m.age)) return false;
      seen.add(m.age);
      return true;
    });
  }, [milestones]);

  // Per-age first milestone (for the marker offset)
  const milestoneByAge = useMemo(() => {
    const map = new Map<number, { milestone: Milestone; offset: number }>();
    let i = 0;
    for (const m of milestoneAges) {
      map.set(m.age, { milestone: m, offset: i % 2 });
      i++;
    }
    return map;
  }, [milestoneAges]);

  const renderChart = () => {
    const commonProps = {
      data,
      margin: { top: 36, right: 12, left: 8, bottom: 0 },
    };

    const axes = (
      <>
        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
        <XAxis
          dataKey="age"
          tick={{ fill: axisColor, fontSize: 12 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tickFormatter={fmt}
          tick={{ fill: axisColor, fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          width={68}
        />
        <Tooltip content={<ChartTooltip milestones={milestones} metric={metric} />} />
      </>
    );

    const refLines = milestoneAges.map(({ age }) => {
      const entry = milestoneByAge.get(age);
      if (!entry) return null;
      const { milestone, offset } = entry;
      return (
        <ReferenceLine
          key={age}
          x={age}
          stroke={milestone.isWarning ? '#fca5a5' : isDarkMode ? '#374151' : '#e5e7eb'}
          strokeWidth={milestone.isWarning ? 1.5 : 1}
          strokeDasharray={milestone.isWarning ? '4 2' : '2 4'}
          label={<MarkerLabel milestone={milestone} offset={offset} />}
        />
      );
    });

    // Retirement divider
    const retireLine = (
      <ReferenceLine
        x={profile.retirementAge}
        stroke={isDarkMode ? '#4b5563' : '#d1d5db'}
        strokeWidth={1.5}
      />
    );

    if (metric === 'netWorth') {
      return (
        <ComposedChart {...commonProps}>
          <defs>
            <linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.2} />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          {axes}{retireLine}{refLines}
          <Area dataKey="netWorth" name="Net worth" stroke="#3b82f6" strokeWidth={2} fill="url(#nwGrad)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
        </ComposedChart>
      );
    }

    if (metric === 'spending') {
      return (
        <ComposedChart {...commonProps}>
          {axes}{retireLine}{refLines}
          <Bar dataKey="portfolioWithdraw" name="Portfolio" stackId="s" fill="#60a5fa" radius={[0,0,0,0]} />
          <Bar dataKey="govtIncome"        name="Benefits / income" stackId="s" fill="#a78bfa" radius={[2,2,0,0]} />
          <Line dataKey="spendingTarget"   name="Target spending"   stroke="#f97316" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
        </ComposedChart>
      );
    }

    if (metric === 'income') {
      return (
        <ComposedChart {...commonProps}>
          {axes}{retireLine}{refLines}
          <Bar dataKey="govtIncome"       name="Benefits / income streams" stackId="i" fill="#a78bfa" radius={[0,0,0,0]} />
          <Bar dataKey="portfolioWithdraw" name="Portfolio withdrawals"    stackId="i" fill="#60a5fa" radius={[2,2,0,0]} />
          <Line dataKey="spendingTarget"  name="Spending target"           stroke="#f97316" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
        </ComposedChart>
      );
    }

    // taxes
    return (
      <ComposedChart {...commonProps}>
        {axes}{retireLine}{refLines}
        <Bar dataKey="federalTax" name="Federal tax" stackId="t" fill="#f87171" radius={[0,0,0,0]} />
        <Bar dataKey="stateTax"   name="State tax"   stackId="t" fill="#fca5a5" radius={[2,2,0,0]} />
      </ComposedChart>
    );
  };

  return (
    <div className="w-full space-y-3">
      {/* Metric switcher */}
      <div className="flex items-center gap-1 flex-wrap">
        {METRICS.map(m => (
          <button
            key={m.id}
            onClick={() => setMetric(m.id)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              metric === m.id
                ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            {m.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-gray-400 dark:text-gray-500 hidden sm:block">
          Dots = milestones · Hover for details
        </span>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={320}>
        {renderChart()}
      </ResponsiveContainer>

      {/* Compact milestone legend below chart */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
        {milestoneAges.map(({ age, label, category, isWarning }) => (
          <div key={`${age}-${label}`} className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: isWarning ? '#ef4444' : CAT_COLOR[category] }}
            />
            <span className="font-medium">{age}</span>
            <span className="opacity-75">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
