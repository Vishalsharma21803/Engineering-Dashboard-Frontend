import type { DateRangePreset } from "@/components/ui/date-range-picker";
import { shiftDay, weekStart } from "./time";

/** Quick ranges for the Range pickers, weeks starting on Monday (as on the timesheet). */
export function rangePresets(today: string): DateRangePreset[] {
  const monday = weekStart(today);
  const monthStart = `${today.slice(0, 8)}01`;
  const lastMonthEnd = shiftDay(monthStart, -1);
  return [
    { label: "This week", from: monday, to: today },
    { label: "Last week", from: shiftDay(monday, -7), to: shiftDay(monday, -1) },
    { label: "Last 7 days", from: shiftDay(today, -6), to: today },
    { label: "Last 30 days", from: shiftDay(today, -29), to: today },
    { label: "This month", from: monthStart, to: today },
    { label: "Last month", from: `${lastMonthEnd.slice(0, 8)}01`, to: lastMonthEnd },
  ];
}
