import { CalendarIcon } from "lucide-react";
import { useState } from "react";
import type { Matcher } from "react-day-picker";

import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/utils/cn";

/** "YYYY-MM-DD", as a native date input reads and writes it, to a local date. */
function parseDay(value: string | undefined): Date | undefined {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : undefined;
}

function formatDay(date: Date): string {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()].map((part, index) => String(part).padStart(index === 0 ? 4 : 2, "0")).join("-");
}

interface DatePickerProps {
  /** "YYYY-MM-DD", or "" for no date. */
  value: string;
  onChange: (value: string) => void;
  /** Earliest and latest pickable day, "YYYY-MM-DD". */
  min?: string;
  max?: string;
  id?: string;
  "aria-label"?: string;
  placeholder?: string;
  disabled?: boolean;
  size?: "sm" | "default";
  className?: string;
}

/**
 * A shadcn/ui date picker (Popover + Calendar) that takes and returns the same
 * "YYYY-MM-DD" strings as the native date input it replaces. The trigger
 * carries the value in data-value.
 */
export function DatePicker({
  value,
  onChange,
  min,
  max,
  id,
  "aria-label": ariaLabel,
  placeholder = "Pick a date",
  disabled,
  size = "default",
  className,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  // "Today" as of opening the calendar (read in the event, not during render).
  const [today, setToday] = useState<Date | null>(null);
  const selected = parseDay(value);
  const first = parseDay(min);
  const last = parseDay(max);
  const outOfRange: Matcher[] = [...(first ? [{ before: first }] : []), ...(last ? [{ after: last }] : [])];
  // Opens on the chosen day, else on this month (kept inside the allowed range).
  const opensOn = selected ?? (today && first && today < first ? first : today && last && today > last ? last : (today ?? undefined));

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setToday(new Date());
        }
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          aria-label={ariaLabel}
          data-value={value}
          disabled={disabled}
          className={cn(
            "inline-flex min-w-0 items-center gap-2 rounded-lg border border-slate-300 bg-surface px-3 text-left text-sm text-slate-950 shadow-xs outline-none transition hover:border-slate-400 focus-visible:border-indigo-500 focus-visible:ring-4 focus-visible:ring-indigo-500/15 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 data-[state=open]:border-indigo-500 data-[state=open]:ring-4 data-[state=open]:ring-indigo-500/15",
            size === "sm" ? "h-9" : "h-10",
            className
          )}
        >
          <CalendarIcon aria-hidden="true" className="size-4 shrink-0 text-slate-500" />
          <span className={cn("truncate", !selected && "text-slate-500")}>
            {selected ? selected.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : placeholder}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto rounded-xl p-0 shadow-lg">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={opensOn}
          startMonth={first}
          endMonth={last}
          disabled={outOfRange}
          onSelect={(date) => {
            if (date) {
              onChange(formatDay(date));
              setOpen(false);
            }
          }}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}
