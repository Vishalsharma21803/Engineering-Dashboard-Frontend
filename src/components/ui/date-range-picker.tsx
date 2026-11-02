import { CalendarRange } from "lucide-react";
import { useState } from "react";
import type { Matcher } from "react-day-picker";

import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/utils/cn";
import { formatDay, parseDay } from "@/utils/day";

export interface DateRangePreset {
  label: string;
  from: string;
  to: string;
}

interface DateRangePickerProps {
  /** "YYYY-MM-DD". */
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  /** Quick choices listed beside the calendar ("This week", "Last 7 days"…). */
  presets: DateRangePreset[];
  /** Latest pickable day. */
  max?: string;
  /** Longest range, in days (the end day counted). */
  maxDays?: number;
  "aria-label"?: string;
  /** The range is the one in use (styled as selected). */
  active?: boolean;
  /** Shown when the range is not active, instead of its dates. */
  placeholder?: string;
  className?: string;
}

const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
const dayLabel = (date: Date, withYear: boolean) =>
  date.toLocaleDateString(undefined, { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) });

/**
 * A shadcn/ui range picker: presets on the left, a two-month calendar on the
 * right (click the first day, then the last). Takes and returns "YYYY-MM-DD".
 */
export function DateRangePicker({
  from,
  to,
  onChange,
  presets,
  max,
  maxDays,
  "aria-label": ariaLabel,
  active = true,
  placeholder = "Pick a range",
  className,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState<Date | null>(null);
  const [twoMonths, setTwoMonths] = useState(true);
  const first = parseDay(from);
  const last = parseDay(to);
  const latest = parseDay(max);
  const preset = presets.find((candidate) => candidate.from === from && candidate.to === to);
  const sameYear = first !== undefined && last !== undefined && first.getFullYear() === last.getFullYear();
  const label = !active
    ? placeholder
    : preset
      ? preset.label
      : first && last
        ? `${dayLabel(first, !sameYear)} – ${dayLabel(last, true)}`
        : placeholder;

  const disabled: Matcher[] = [
    ...(latest ? [{ after: latest }] : []),
    // While choosing the end, keep the range within maxDays of the first day.
    ...(start && maxDays ? [{ before: addDays(start, -(maxDays - 1)) }, { after: addDays(start, maxDays - 1) }] : []),
  ];

  function choose(nextFrom: string, nextTo: string) {
    onChange(nextFrom, nextTo);
    setStart(null);
    setOpen(false);
  }

  function pickDay(day: Date) {
    if (!start) {
      setStart(day);
      return;
    }
    const [low, high] = day < start ? [day, start] : [start, day];
    choose(formatDay(low), formatDay(high));
  }

  // The chosen range's last month is on the right (the calendar's own default is this month).
  const shownEnd = last ?? latest;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setTwoMonths(window.matchMedia?.("(min-width: 768px)").matches ?? true);
        setStart(null);
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          data-from={from}
          data-to={to}
          className={cn(
            "inline-flex h-9 min-w-0 items-center gap-2 rounded-lg border border-slate-300 bg-surface px-3 text-left text-sm text-slate-950 shadow-xs outline-none transition hover:border-slate-400 focus-visible:border-indigo-500 focus-visible:ring-4 focus-visible:ring-indigo-500/15 data-[state=open]:border-indigo-500 data-[state=open]:ring-4 data-[state=open]:ring-indigo-500/15",
            active && "border-indigo-300 bg-indigo-50 font-medium text-indigo-800",
            className
          )}
        >
          <CalendarRange aria-hidden="true" className={cn("size-4 shrink-0", active ? "text-indigo-600" : "text-slate-500")} />
          <span className={cn("truncate", !active && "text-slate-600")}>{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto max-w-[calc(100vw-1rem)] rounded-xl p-0 shadow-lg">
        <div className="flex flex-col md:flex-row">
          <ul aria-label="Quick ranges" className="flex flex-wrap gap-1 border-b border-slate-200 p-2 md:w-40 md:flex-col md:flex-nowrap md:border-r md:border-b-0">
            {presets.map((candidate) => {
              const current = active && candidate.from === from && candidate.to === to;
              return (
                <li key={candidate.label}>
                  <button
                    type="button"
                    aria-pressed={current}
                    onClick={() => choose(candidate.from, candidate.to)}
                    className={cn(
                      "w-full rounded-md px-2.5 py-1.5 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500",
                      current ? "bg-indigo-50 font-medium text-indigo-800" : "text-slate-700 hover:bg-slate-100"
                    )}
                  >
                    {candidate.label}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-col">
            <Calendar
              mode="range"
              // Weeks start on Monday, like the timesheet and the "This week" / "Last week" ranges.
              weekStartsOn={1}
              numberOfMonths={twoMonths ? 2 : 1}
              defaultMonth={shownEnd && (twoMonths ? new Date(shownEnd.getFullYear(), shownEnd.getMonth() - 1, 1) : shownEnd)}
              selected={start ? { from: start, to: undefined } : active && first && last ? { from: first, to: last } : undefined}
              onDayClick={(day, modifiers) => {
                if (!modifiers.disabled) pickDay(day);
              }}
              disabled={disabled}
              endMonth={latest}
              autoFocus
            />
            <p className="px-3 pb-3 text-xs text-slate-500" aria-live="polite">
              {start ? `From ${dayLabel(start, true)}: now pick the last day.` : "Pick the first day, then the last."}
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
