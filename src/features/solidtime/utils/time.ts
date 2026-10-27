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

function offsetMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(at);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asUtc = Date.UTC(value("year"), value("month") - 1, value("day"), value("hour"), value("minute"), value("second"));
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
}

/** "HH:MM" of an instant in the time zone. */
export function zonedClock(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
}

/** The instant (ISO, UTC) of `day` at "HH:MM" in the time zone; null for a bad clock. Same method as the backend's startOfZonedDay. */
export function zonedInstant(day: string, clock: string, timeZone: string): string | null {
  const match = /^(\d{2}):(\d{2})$/.exec(clock);
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];

  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59 || !year || !month || !date) {
    return null;
  }

  const guess = Date.UTC(year, month - 1, date, Number(match[1]), Number(match[2]));
  // Two passes settle the offset across daylight-saving changes.
  let instant = guess - offsetMinutes(new Date(guess), timeZone) * 60_000;
  instant = guess - offsetMinutes(new Date(instant), timeZone) * 60_000;
  return new Date(instant).toISOString();
}

/** A YYYY-MM-DD day for people ("Tue, 27 Oct"), in the browser's language; the day itself is not shifted by any time zone. */
export function formatDayLabel(day: string, options: Intl.DateTimeFormatOptions): string {
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(undefined, { ...options, timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, date)));
}

/** <input type="datetime-local"> value for an instant in the time zone ("2026-10-27T09:30"), and back. */
export function toZonedInput(iso: string, timeZone: string): string {
  return `${localDay(new Date(iso), timeZone)}T${zonedClock(iso, timeZone)}`;
}

export function fromZonedInput(value: string, timeZone: string): string | null {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) ? zonedInstant(value.slice(0, 10), value.slice(11, 16), timeZone) : null;
}
