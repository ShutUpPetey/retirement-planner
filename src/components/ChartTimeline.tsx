import { useMemo, useState } from 'react';
import { Milestone } from '../types';

interface ChartTimelineProps {
  milestones: Milestone[];
  startAge: number;
  endAge: number;
  isDarkMode?: boolean;
}

// Color per category
const CATEGORY_COLORS: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  work:       { bg: 'bg-blue-50 dark:bg-blue-900/30',   border: 'border-blue-200 dark:border-blue-700',   text: 'text-blue-700 dark:text-blue-300',   dot: 'bg-blue-500' },
  retirement: { bg: 'bg-green-50 dark:bg-green-900/30', border: 'border-green-200 dark:border-green-700', text: 'text-green-700 dark:text-green-300', dot: 'bg-green-500' },
  benefits:   { bg: 'bg-purple-50 dark:bg-purple-900/30', border: 'border-purple-200 dark:border-purple-700', text: 'text-purple-700 dark:text-purple-300', dot: 'bg-purple-500' },
  portfolio:  { bg: 'bg-orange-50 dark:bg-orange-900/30', border: 'border-orange-200 dark:border-orange-700', text: 'text-orange-700 dark:text-orange-300', dot: 'bg-orange-500' },
  tax:        { bg: 'bg-yellow-50 dark:bg-yellow-900/30', border: 'border-yellow-200 dark:border-yellow-700', text: 'text-yellow-700 dark:text-yellow-300', dot: 'bg-yellow-500' },
};

const WARNING_COLORS = { bg: 'bg-red-50 dark:bg-red-900/30', border: 'border-red-300 dark:border-red-600', text: 'text-red-700 dark:text-red-300', dot: 'bg-red-500' };

const CATEGORY_LABELS: Record<string, string> = {
  work: 'Working years',
  retirement: 'Retirement',
  benefits: 'Benefits',
  portfolio: 'Portfolio',
  tax: 'Tax events',
};

export function ChartTimeline({ milestones, startAge, endAge, isDarkMode: _isDarkMode }: ChartTimelineProps) {
  const [hoveredAge, setHoveredAge] = useState<number | null>(null);

  const ageRange = endAge - startAge;

  // Deduplicate same-age milestones by grouping them
  const grouped = useMemo(() => {
    const map = new Map<number, Milestone[]>();
    for (const m of milestones) {
      if (!map.has(m.age)) map.set(m.age, []);
      map.get(m.age)!.push(m);
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [milestones]);

  // Assign above/below alternating to reduce overlap
  const positioned = useMemo(() => {
    return grouped.map(([age, ms], i) => ({
      age,
      ms,
      above: i % 2 === 0,
      pct: ((age - startAge) / ageRange) * 100,
    }));
  }, [grouped, startAge, ageRange]);

  const activeGroup = hoveredAge !== null ? grouped.find(([age]) => age === hoveredAge) : null;

  return (
    <div className="w-full">
      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-6">
        {Object.entries(CATEGORY_LABELS).map(([cat, label]) => {
          const c = CATEGORY_COLORS[cat];
          const hasAny = milestones.some(m => m.category === cat && !m.isWarning);
          if (!hasAny) return null;
          return (
            <div key={cat} className="flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${c.dot}`} />
              <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
            </div>
          );
        })}
        {milestones.some(m => m.isWarning) && (
          <div className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${WARNING_COLORS.dot}`} />
            <span className="text-xs text-gray-500 dark:text-gray-400">Warning</span>
          </div>
        )}
      </div>

      {/* Timeline SVG area */}
      <div className="relative" style={{ height: '160px' }}>
        {/* Horizontal track */}
        <div
          className="absolute bg-gray-200 dark:bg-gray-600 rounded-full"
          style={{ top: '79px', left: '0', right: '0', height: '4px' }}
        />

        {/* Phase fills: working years bar */}
        {(() => {
          const retireMilestone = milestones.find(m => m.category === 'retirement' && m.label.toLowerCase().includes('retire'));
          const retireAge = retireMilestone?.age ?? endAge;
          const workPct = Math.min(100, ((retireAge - startAge) / ageRange) * 100);
          return (
            <>
              <div
                className="absolute bg-blue-200 dark:bg-blue-800/50 rounded-l-full"
                style={{ top: '77px', left: '0', width: `${workPct}%`, height: '8px' }}
              />
              <div
                className="absolute bg-green-200 dark:bg-green-800/50 rounded-r-full"
                style={{ top: '77px', left: `${workPct}%`, right: '0', height: '8px' }}
              />
            </>
          );
        })()}

        {/* Milestone markers */}
        {positioned.map(({ age, ms, above, pct }) => {
          const isHovered = hoveredAge === age;
          const hasWarning = ms.some(m => m.isWarning);
          const primary = ms[0];
          const colors = hasWarning ? WARNING_COLORS : CATEGORY_COLORS[primary.category] ?? CATEGORY_COLORS.portfolio;
          const isEdge = pct < 8 || pct > 92;

          return (
            <div
              key={age}
              className="absolute"
              style={{ left: `${pct}%`, top: 0, bottom: 0, transform: 'translateX(-50%)' }}
              onMouseEnter={() => setHoveredAge(age)}
              onMouseLeave={() => setHoveredAge(null)}
            >
              {/* Vertical stem */}
              <div
                className={`absolute w-px ${isHovered ? 'bg-gray-400 dark:bg-gray-400' : 'bg-gray-300 dark:bg-gray-600'}`}
                style={above
                  ? { top: '0', height: '72px', left: '50%', transform: 'translateX(-50%)' }
                  : { top: '87px', height: '72px', left: '50%', transform: 'translateX(-50%)' }
                }
              />

              {/* Dot on the track */}
              <div
                className={`absolute rounded-full border-2 border-white dark:border-gray-800 cursor-pointer transition-transform ${colors.dot} ${isHovered ? 'scale-150' : ''}`}
                style={{ width: '14px', height: '14px', top: '73px', left: '50%', transform: `translateX(-50%) ${isHovered ? 'scale(1.5)' : ''}` }}
              />

              {/* Label chip */}
              <div
                className={`absolute cursor-pointer select-none`}
                style={above
                  ? { top: '0', left: isEdge && pct < 8 ? '0' : isEdge ? 'auto' : '50%', right: isEdge && pct > 92 ? '0' : 'auto', transform: isEdge ? 'none' : 'translateX(-50%)' }
                  : { bottom: '0', left: isEdge && pct < 8 ? '0' : isEdge ? 'auto' : '50%', right: isEdge && pct > 92 ? '0' : 'auto', transform: isEdge ? 'none' : 'translateX(-50%)' }
                }
              >
                <div className={`rounded px-1.5 py-0.5 border text-xs font-medium whitespace-nowrap ${colors.bg} ${colors.border} ${colors.text} ${isHovered ? 'ring-1 ring-offset-1 ring-gray-300 dark:ring-gray-500' : ''}`}>
                  <span className="font-semibold">Age {age}</span>
                  {ms.length === 1 && <span className="ml-1 font-normal opacity-80">· {ms[0].label}</span>}
                  {ms.length > 1 && <span className="ml-1 font-normal opacity-80">· {ms.length} events</span>}
                </div>
              </div>
            </div>
          );
        })}

        {/* Age axis labels */}
        <div className="absolute text-xs text-gray-400 dark:text-gray-500" style={{ top: '91px', left: 0 }}>
          {startAge}
        </div>
        <div className="absolute text-xs text-gray-400 dark:text-gray-500" style={{ top: '91px', right: 0 }}>
          {endAge}
        </div>
      </div>

      {/* Hover tooltip: show all events at that age */}
      {activeGroup && (
        <div className="mt-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">Age {activeGroup[0]}</p>
          <div className="space-y-1">
            {activeGroup[1].map((m, i) => {
              const colors = m.isWarning ? WARNING_COLORS : CATEGORY_COLORS[m.category] ?? CATEGORY_COLORS.portfolio;
              return (
                <div key={i} className="flex items-start gap-2">
                  <span className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${colors.dot}`} />
                  <div>
                    <span className={`text-sm font-medium ${colors.text}`}>{m.label}</span>
                    {m.detail && <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">{m.detail}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* All milestones list (collapsed summary) */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
        {grouped.map(([age, ms]) =>
          ms.map((m, i) => {
            const colors = m.isWarning ? WARNING_COLORS : CATEGORY_COLORS[m.category] ?? CATEGORY_COLORS.portfolio;
            return (
              <div key={`${age}-${i}`} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${colors.bg} ${colors.border}`}>
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${colors.dot}`} />
                <span className={`font-medium ${colors.text}`}>Age {age}</span>
                <span className="text-gray-600 dark:text-gray-300 truncate">{m.label}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
