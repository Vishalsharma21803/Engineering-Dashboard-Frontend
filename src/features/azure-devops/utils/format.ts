export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["day", 24 * 60 * 60 * 1000],
  ["hour", 60 * 60 * 1000],
  ["minute", 60 * 1000],
];

export function formatRelative(value: string | null | undefined, now = Date.now()): string {
  if (!value) {
    return "—";
  }

  const time = new Date(value).getTime();

  if (Number.isNaN(time)) {
    return "—";
  }

  const diff = time - now;
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

  for (const [unit, ms] of RELATIVE_UNITS) {
    if (Math.abs(diff) >= ms) {
      return formatter.format(Math.round(diff / ms), unit);
    }
  }

  return "just now";
}

export function formatValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  return String(value);
}

export function stripRef(ref: string | null | undefined): string {
  return ref ? ref.replace(/^refs\/heads\//, "") : "—";
}

/** Turns "2 day(s) ago" into "2 days ago" and "1 thread(s)" into "1 thread", using the nearest number before each word. */
export function pluralizeText(text: string): string {
  return text.replace(/([A-Za-z]+)\(s\)/g, (_match, word: string, offset: number) => {
    const count = text.slice(0, offset).match(/(\d+(?:\.\d+)?)\D*$/)?.[1];
    return count !== undefined && Number(count) === 1 ? word : `${word}s`;
  });
}
