/** "YYYY-MM-DD" (a calendar day, as a native date input reads and writes it) to a local date. */
export function parseDay(value: string | undefined): Date | undefined {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : undefined;
}

/** A local date to "YYYY-MM-DD". */
export function formatDay(date: Date): string {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()].map((part, index) => String(part).padStart(index === 0 ? 4 : 2, "0")).join("-");
}
