import { useMemo, useState } from 'react';
import { Milestone, MilestoneCategory } from '../types';

interface ChartTimelineProps {
  milestones: Milestone[];
  startAge: number;
  endAge: number;
  isDarkMode?: boolean;
}

const CAT_DOT: Record<MilestoneCategory, string> = {
  work:       'bg-blue-500',
  retirement: 'bg-green-500',
  benefits:   'bg-purple-500',
  portfolio:  'bg-orange-500',
  tax:        'bg-yellow-500',
};

const CAT_TEXT: Record<MilestoneCategory, string> = {
  work:       'text-blue-700 dark:text-blue-300',
  retirement: 'text-green-700 dark:text-green-300',
  benefits:   'text-purple-700 dark:text-purple-300',
  portfolio:  'text-orange-700 dark:text-orange-300',
  tax:        'text-yellow-700 dark:text-yellow-300',
};

const CAT_LABEL: Record<MilestoneCategory, string> = {
  work:       'Working years',
  retirement: 'Retirement',
  benefits:   'Benefits',
  portfolio:  'Portfolio',
  tax:        'Tax events',
};

export function ChartTimeline({ milestones, startAge, endAge }: ChartTimelineProps) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  const ageRange = endAge - startAge;

  // Sort by age
  const sorted = useMemo(
    () => [...milestones].sort((a, b) => a.age - b.age),
    [milestones],
  );

  // Retirement age for phase coloring
  const retireAge = milestones.find(
    m => m.category === 'retirement' && m.label.toLowerCase().includes('retire'),
  )?.age ?? endAge;
  const workPct = Math.min(100, ((retireAge - startAge) / ageRange) * 100);

  // Legend: only categories present
  const presentCats = useMemo(() => {
    const cats = new Set(milestones.filter(m => !m.isWarning).map(m => m.category));
    return (Object.keys(CAT_LABEL) as MilestoneCategory[]).filter(c => cats.has(c));
  }, [milestones]);

  const hasWarning = milestones.some(m => m.isWarning);

  return (
    <div className="w-full space-y-5">
      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {presentCats.map(cat => (
          <div key={cat} className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${CAT_DOT[cat]}`} />
            <span className="text-xs text-gray-500 dark:text-gray-400">{CAT_LABEL[cat]}</span>
          </div>
        ))}
        {hasWarning && (
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-red-500" />
            <span className="text-xs text-gray-500 dark:text-gray-400">Warning</span>
          </div>
        )}
      </div>

      {/* Track */}
      <div className="relative" style={{ height: '28px' }}>
        {/* Phase bars */}
        <div
          className="absolute top-1/2 -translate-y-1/2 bg-blue-200 dark:bg-blue-800/50 rounded-l-full"
          style={{ left: 0, width: `${workPct}%`, height: '8px' }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 bg-green-200 dark:bg-green-800/50 rounded-r-full"
          style={{ left: `${workPct}%`, right: 0, height: '8px' }}
        />

        {/* Dots */}
        {sorted.map((m, i) => {
          const pct = ((m.age - startAge) / ageRange) * 100;
          const dot = m.isWarning ? 'bg-red-500' : CAT_DOT[m.category];
          const isActive = activeIdx === i;
          return (
            <button
              key={i}
              className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full border-2 border-white dark:border-gray-800 transition-transform focus:outline-none ${dot} ${isActive ? 'scale-150 z-10' : 'hover:scale-125'}`}
              style={{ left: `${pct}%`, width: '14px', height: '14px' }}
              onClick={() => setActiveIdx(isActive ? null : i)}
              aria-label={`Age ${m.age}: ${m.label}`}
            />
          );
        })}

        {/* Age axis */}
        <span className="absolute -bottom-5 left-0 text-xs text-gray-400 dark:text-gray-500">{startAge}</span>
        <span className="absolute -bottom-5 right-0 text-xs text-gray-400 dark:text-gray-500">{endAge}</span>
      </div>

      {/* Active milestone detail */}
      {activeIdx !== null && sorted[activeIdx] && (() => {
        const m = sorted[activeIdx];
        const textColor = m.isWarning ? 'text-red-700 dark:text-red-300' : CAT_TEXT[m.category];
        const dot = m.isWarning ? 'bg-red-500' : CAT_DOT[m.category];
        return (
          <div className="mt-6 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dot}`} />
              <span className={`text-sm font-semibold ${textColor}`}>Age {m.age} · {m.label}</span>
            </div>
            {m.detail && <p className="mt-1 ml-4 text-xs text-gray-500 dark:text-gray-400">{m.detail}</p>}
          </div>
        );
      })()}

      {/* Full milestone list */}
      <div className="mt-6 divide-y divide-gray-100 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        {sorted.map((m, i) => {
          const dot = m.isWarning ? 'bg-red-500' : CAT_DOT[m.category];
          const textColor = m.isWarning ? 'text-red-700 dark:text-red-300' : CAT_TEXT[m.category];
          const isActive = activeIdx === i;
          return (
            <button
              key={i}
              onClick={() => setActiveIdx(isActive ? null : i)}
              className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors ${
                isActive
                  ? 'bg-gray-100 dark:bg-gray-700/60'
                  : 'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-750'
              }`}
            >
              <span className={`mt-1.5 w-2.5 h-2.5 rounded-full flex-shrink-0 ${dot}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className={`text-sm font-semibold ${textColor}`}>Age {m.age}</span>
                  <span className="text-sm text-gray-700 dark:text-gray-200">{m.label}</span>
                </div>
                {m.detail && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{m.detail}</p>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
