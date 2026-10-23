import type { BuildSummary, Recommendation } from "../types/azure.types";
import type { ResolvedTriage, TriageMark, TriageState } from "../types/triage.types";

// Keys must match the backend's triageItemKeySchema.
export const workItemKey = (id: number) => `wi:${id}`;
export const pullRequestKey = (repositoryId: string, pullRequestId: number) =>
  `pr:${repositoryId}:${pullRequestId}`;
export const projectKey = (projectName: string) => `project:${projectName.toLowerCase()}`;

/** Pipeline + branch, so abandoning a dead pipeline outlives its individual runs. */
export function pipelineKey(build: Pick<BuildSummary, "projectName" | "definitionId" | "sourceBranch">) {
  return build.projectName
    ? `pipeline:${build.projectName}:${build.definitionId}:${build.sourceBranch ?? ""}`
    : null;
}

export function recommendationKey(
  recommendation: Recommendation,
  buildsById: Map<number, BuildSummary>
): string | null {
  const { target } = recommendation;

  switch (target.type) {
    case "workItem":
      return workItemKey(target.id);
    case "pullRequest":
      return target.repositoryId ? pullRequestKey(target.repositoryId, target.id) : null;
    case "build": {
      const build = buildsById.get(target.id);
      return build ? pipelineKey(build) : null;
    }
  }
}

export interface SignalEntry {
  projectName: string;
  signals: string[];
}

/** Current signal codes per item key, taken from the dashboard's recommendations. */
export function buildSignalIndex(
  recommendations: Recommendation[],
  builds: BuildSummary[]
): Map<string, SignalEntry> {
  const buildsById = new Map(builds.map((build) => [build.id, build]));
  const index = new Map<string, SignalEntry>();

  for (const recommendation of recommendations) {
    const key = recommendationKey(recommendation, buildsById);

    if (key) {
      const existing = index.get(key);
      index.set(key, {
        projectName: recommendation.target.projectName,
        signals: [...(existing?.signals ?? []), ...recommendation.signals],
      });
    }
  }

  return index;
}

/** Signals scoped by item, so a project-wide mark can resurface just the item that changed. */
export const scopedSignals = (itemKey: string, signals: string[]) =>
  signals.map((signal) => `${itemKey}/${signal}`);

export function projectSignals(index: Map<string, SignalEntry>, projectName: string): string[] {
  const name = projectName.toLowerCase();

  return [...index.entries()].flatMap(([key, entry]) =>
    entry.projectName.toLowerCase() === name ? scopedSignals(key, entry.signals) : []
  );
}

function isActiveMark(mark: TriageMark, now: number): boolean {
  return mark.status !== "SNOOZED" || (mark.snoozedUntil !== null && Date.parse(mark.snoozedUntil) > now);
}

function evaluate(
  mark: TriageMark | undefined,
  current: string[],
  now: number
): { state: TriageState; resurfaced: boolean } | null {
  if (!mark || !isActiveMark(mark, now)) {
    return null;
  }

  if (mark.status === "ABANDONED") {
    return { state: "abandoned", resurfaced: false };
  }

  const known = new Set(mark.signals);

  if (current.some((signal) => !known.has(signal))) {
    return { state: "active", resurfaced: true };
  }

  return { state: mark.status === "SNOOZED" ? "snoozed" : "acknowledged", resurfaced: false };
}

export const UNTRIAGED: ResolvedTriage ={ state: "active", mark: null, resurfaced: false, viaProject: false };

/**
 * An abandoned project hides everything in it; otherwise the item's own mark
 * wins over its project's. Snoozed and acknowledged items come back when a
 * signal appears that was not present when they were marked.
 */
export function resolveTriage(
  marks: Map<string, TriageMark>,
  itemKey: string | null,
  projectName: string | null,
  signals: string[],
  now = Date.now()
): ResolvedTriage {
  const projectMark = projectName ? marks.get(projectKey(projectName)) : undefined;

  if (projectMark?.status === "ABANDONED") {
    return { state: "abandoned", mark: projectMark, resurfaced: false, viaProject: true };
  }

  if (!itemKey) {
    return UNTRIAGED;
  }

  const itemMark = marks.get(itemKey);
  const own = evaluate(itemMark, signals, now);

  if (own && itemMark) {
    return { ...own, mark: itemMark, viaProject: false };
  }

  const inherited = evaluate(projectMark, scopedSignals(itemKey, signals), now);

  if (inherited && projectMark) {
    return { ...inherited, mark: projectMark, viaProject: true };
  }

  return UNTRIAGED;
}

export const isHidden = (state: TriageState) => state === "snoozed" || state === "abandoned";

function atNine(date: Date): Date {
  const result = new Date(date);
  result.setHours(9, 0, 0, 0);
  return result;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/** Snooze presets end at 09:00 local time. */
export function snoozePresets(now = new Date()): Array<{ label: string; until: Date }> {
  const daysToMonday = ((8 - now.getDay()) % 7) || 7;

  return [
    { label: "Tomorrow", until: atNine(addDays(now, 1)) },
    { label: "Next week", until: atNine(addDays(now, daysToMonday)) },
    { label: "In 2 weeks", until: atNine(addDays(now, 14)) },
  ];
}

/** yyyy-mm-dd from an <input type="date">, as 09:00 local time. */
export function snoozeDateFromInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 9);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toDateInputValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
