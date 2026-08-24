import { useMemo, useState } from "react";
import { buildWeeks, countsToLevels, formatDayLabel, monthLabel } from "@/lib/github";
import { cn } from "@/lib/utils";

const LEVEL_CLASS = ["bg-graph-0", "bg-graph-1", "bg-graph-2", "bg-graph-3", "bg-graph-4"] as const;

const DAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];

type GraphProps = {
  from: string;
  to: string;
  counts: Record<string, number>;
  compact?: boolean;
  className?: string;
};

export function ContributionGraph({ from, to, counts, compact = false, className }: GraphProps) {
  const weeks = useMemo(() => buildWeeks(from, to), [from, to]);
  const levels = useMemo(() => {
    const filled: Record<string, number> = { ...counts };
    for (const week of weeks) {
      for (const day of week) {
        if (day && filled[day] === undefined) filled[day] = 0;
      }
    }
    return countsToLevels(filled);
  }, [counts, weeks]);
  const [hover, setHover] = useState<{
    date: string;
    count: number;
    x: number;
    y: number;
  } | null>(null);

  const monthMarks = useMemo(() => {
    const marks: { index: number; label: string }[] = [];
    let last = "";
    let lastIndex = -4;
    weeks.forEach((week, i) => {
      const first = week.find(Boolean);
      if (!first) return;
      const label = monthLabel(first);
      if (label !== last && i - lastIndex >= 4) {
        marks.push({ index: i, label });
        last = label;
        lastIndex = i;
      } else if (label !== last) {
        last = label;
      }
    });
    return marks;
  }, [weeks]);

  const cell = compact ? "size-1.5 rounded-sm" : "size-2.5 sm:size-3 lg:size-3.5 rounded-sm";
  const gap = compact ? "gap-px" : "gap-1";

  return (
    <div className={cn("relative", className)}>
      <div className="graph-scroll overflow-x-auto overscroll-x-contain pb-1">
        <div className={cn("inline-flex", compact ? "gap-1.5" : "gap-2")}>
          {!compact && (
            <div className="flex flex-col justify-end gap-1 pt-5">
              {DAY_LABELS.map((label, i) => (
                <span
                  key={i}
                  className="h-2.5 text-tiny leading-3 text-muted-foreground sm:h-3 lg:h-3.5"
                >
                  {label}
                </span>
              ))}
            </div>
          )}
          <div>
            {!compact && (
              <div className={cn("relative mb-1 flex", gap)} aria-hidden>
                {weeks.map((_, i) => {
                  const mark = monthMarks.find((m) => m.index === i);
                  return (
                    <span key={i} className="relative h-3 w-2.5 shrink-0 sm:w-3 lg:w-3.5">
                      {mark ? (
                        <span className="absolute top-0 left-0 whitespace-nowrap text-tiny leading-3 text-muted-foreground">
                          {mark.label}
                        </span>
                      ) : null}
                    </span>
                  );
                })}
              </div>
            )}
            <div
              className={cn("flex", gap)}
              role="grid"
              aria-label="Contribution graph"
              onMouseLeave={() => setHover(null)}
            >
              {weeks.map((week, wi) => (
                <div key={wi} className={cn("flex flex-col", gap)} role="row">
                  {week.map((date, di) => {
                    if (!date) {
                      return <span key={`${wi}-${di}`} className={cn(cell, "opacity-0")} />;
                    }
                    const level = levels[date] ?? 0;
                    const count = counts[date] ?? 0;
                    return (
                      <button
                        key={date}
                        type="button"
                        role="gridcell"
                        aria-label={`${count} contributions on ${formatDayLabel(date)}`}
                        className={cn(
                          cell,
                          LEVEL_CLASS[level],
                          "origin-center transition-transform duration-150 ease-out hover:scale-110 focus-visible:scale-110 focus-visible:ring-1 focus-visible:ring-ring outline-none",
                        )}
                        onMouseEnter={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setHover({
                            date,
                            count,
                            x: rect.left + rect.width / 2,
                            y: rect.top,
                          });
                        }}
                        onFocus={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setHover({
                            date,
                            count,
                            x: rect.left + rect.width / 2,
                            y: rect.top,
                          });
                        }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      {hover && !compact && (
        <div
          className="pointer-events-none fixed z-40 -translate-x-1/2 -translate-y-full rounded-md border border-border bg-popover px-2 py-1.5 text-xs text-popover-foreground"
          style={{ left: hover.x, top: hover.y - 8 }}
        >
          <span className="font-medium tabular-nums">
            {hover.count} {hover.count === 1 ? "contribution" : "contributions"}
          </span>
          <span className="text-muted-foreground"> on {formatDayLabel(hover.date)}</span>
        </div>
      )}
    </div>
  );
}

export function GraphLegend() {
  return (
    <div className="flex items-center gap-1.5 text-tiny text-muted-foreground">
      <span>Fewer</span>
      {LEVEL_CLASS.map((cls) => (
        <span key={cls} className={cn("size-2.5 rounded-sm", cls)} />
      ))}
      <span>More</span>
    </div>
  );
}
