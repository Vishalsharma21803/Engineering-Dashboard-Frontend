/** "3h 05m" from seconds. */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds / 60));
  return `${Math.floor(total / 60)}h ${String(total % 60).padStart(2, "0")}m`;
}

/** Hours with up to two decimals ("1.5 h"). */
export function formatHours(hours: number): string {
  return `${Math.round(hours * 100) / 100} h`;
}

/** Today (or `at`) as YYYY-MM-DD, in the browser's time zone or the given one. */
export function localDay(at = new Date(), timeZone?: string | null): string {
  if (timeZone) {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
  }

  const pad = (value: number) => String(value).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

export function shiftDay(day: string, days: number): string {
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];
  return localDay(new Date(year, month - 1, date + days));
}

/** Monday of the week containing `day`. */
export function weekStart(day: string): string {
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];
  const weekday = new Date(year, month - 1, date).getDay();
  return shiftDay(day, -((weekday + 6) % 7));
}

/** <input type="datetime-local"> value (local time) from an ISO instant, and back. */
export function toLocalInput(iso: string): string {
  const at = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${localDay(at)}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

export function fromLocalInput(value: string): string | null {
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}
