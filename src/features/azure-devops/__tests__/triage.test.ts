import { describe, expect, it } from "vitest";

import type { BuildSummary, Recommendation } from "../types/azure.types";
import type { TriageMark } from "../types/triage.types";
import {
  buildSignalIndex,
  pipelineKey,
  projectKey,
  projectSignals,
  pullRequestKey,
  resolveTriage,
  snoozeDateFromInput,
  snoozePresets,
  workItemKey,
} from "../utils/triage";

const NOW = Date.parse("2026-10-23T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

function mark(itemKey: string, status: TriageMark["status"], extra: Partial<TriageMark> = {}): TriageMark {
  return {
    id: `id-${itemKey}`,
    credentialId: "c",
    itemKey,
    status,
    snoozedUntil: status === "SNOOZED" ? new Date(NOW + DAY).toISOString() : null,
    signals: [],
    createdAt: new Date(NOW).toISOString(),
    updatedAt: new Date(NOW).toISOString(),
    ...extra,
  };
}

const byKey = (...marks: TriageMark[]) => new Map(marks.map((item) => [item.itemKey, item]));
const resolve = (marks: Map<string, TriageMark>, key: string | null, project: string | null, signals: string[] = []) =>
  resolveTriage(marks, key, project, signals, NOW);

const build: BuildSummary = {
  id: 9,
  buildNumber: "9",
  definitionId: 3,
  definitionName: "ci",
  projectName: "Alpha",
  status: "completed",
  result: "failed",
  sourceBranch: "refs/heads/main",
  sourceVersion: null,
  reason: null,
  requestedFor: null,
  queueTime: null,
  startTime: null,
  finishTime: null,
  webUrl: null,
};

const recommendation = (target: Recommendation["target"], signals: string[]): Recommendation => ({
  id: `${target.type}:${target.id}`,
  score: 10,
  category: "SOP",
  title: "t",
  reasons: [],
  signals,
  target,
  suggestedAction: null,
});

describe("triage keys", () => {
  it("builds keys accepted by the backend", () => {
    expect(workItemKey(12)).toBe("wi:12");
    expect(pullRequestKey("repo-1", 7)).toBe("pr:repo-1:7");
    expect(pipelineKey(build)).toBe("pipeline:Alpha:3:refs/heads/main");
    expect(pipelineKey({ ...build, projectName: null })).toBeNull();
    expect(projectKey("Legacy App")).toBe("project:legacy app");
  });
});

describe("resolveTriage", () => {
  it("leaves untriaged items active", () => {
    expect(resolve(byKey(), "wi:1", "Alpha", ["STALE"])).toEqual({
      state: "active",
      mark: null,
      resurfaced: false,
      viaProject: false,
    });
  });

  it("hides snoozed items until the snooze ends", () => {
    const snoozed = mark("wi:1", "SNOOZED", { signals: ["STALE"] });
    expect(resolve(byKey(snoozed), "wi:1", "Alpha", ["STALE"]).state).toBe("snoozed");

    const ended = mark("wi:1", "SNOOZED", { snoozedUntil: new Date(NOW - 1).toISOString() });
    expect(resolve(byKey(ended), "wi:1", "Alpha", ["STALE"])).toMatchObject({ state: "active", mark: null });
  });

  it("resurfaces snoozed and acknowledged items when a new signal appears", () => {
    for (const status of ["SNOOZED", "ACKNOWLEDGED"] as const) {
      const marks = byKey(mark("wi:1", status, { signals: ["DUE_SOON"] }));

      expect(resolve(marks, "wi:1", "Alpha", ["DUE_SOON"]).state).toBe(status === "SNOOZED" ? "snoozed" : "acknowledged");
      expect(resolve(marks, "wi:1", "Alpha", ["OVERDUE"])).toMatchObject({ state: "active", resurfaced: true });
      // A problem going away is not a reason to resurface.
      expect(resolve(marks, "wi:1", "Alpha", []).resurfaced).toBe(false);
    }
  });

  it("never resurfaces abandoned items", () => {
    const marks = byKey(mark("wi:1", "ABANDONED"));
    expect(resolve(marks, "wi:1", "Alpha", ["OVERDUE", "BLOCKED"])).toMatchObject({ state: "abandoned", resurfaced: false });
  });

  it("lets an abandoned project hide everything in it", () => {
    const marks = byKey(mark("project:alpha", "ABANDONED"), mark("wi:1", "ACKNOWLEDGED"));
    expect(resolve(marks, "wi:1", "ALPHA", ["OVERDUE"])).toMatchObject({ state: "abandoned", viaProject: true });
    expect(resolve(marks, null, "Alpha").state).toBe("abandoned");
    expect(resolve(marks, "wi:1", "Beta").state).toBe("acknowledged");
  });

  it("prefers the item's own mark over a snoozed or acknowledged project", () => {
    const marks = byKey(mark("project:alpha", "SNOOZED"), mark("wi:1", "ACKNOWLEDGED"));
    expect(resolve(marks, "wi:1", "Alpha")).toMatchObject({ state: "acknowledged", viaProject: false });
    expect(resolve(marks, "wi:2", "Alpha")).toMatchObject({ state: "snoozed", viaProject: true });
  });

  it("resurfaces only the item that changed inside a snoozed project", () => {
    const marks = byKey(mark("project:alpha", "SNOOZED", { signals: ["wi:1/STALE", "wi:2/STALE"] }));

    expect(resolve(marks, "wi:1", "Alpha", ["STALE"]).state).toBe("snoozed");
    expect(resolve(marks, "wi:2", "Alpha", ["STALE", "OVERDUE"])).toMatchObject({
      state: "active",
      resurfaced: true,
      viaProject: true,
    });
  });
});

describe("signals", () => {
  it("indexes recommendation signals by item key, including pipelines", () => {
    const index = buildSignalIndex(
      [
        recommendation({ type: "workItem", projectName: "Alpha", id: 1, webUrl: null }, ["STALE"]),
        recommendation({ type: "pullRequest", projectName: "Alpha", id: 7, repositoryId: "repo", webUrl: null }, ["MERGE_CONFLICTS"]),
        recommendation({ type: "build", projectName: "Alpha", id: 9, webUrl: null }, ["FAILED:9"]),
        recommendation({ type: "workItem", projectName: "Beta", id: 2, webUrl: null }, ["OVERDUE"]),
      ],
      [build]
    );

    expect(index.get("pipeline:Alpha:3:refs/heads/main")?.signals).toEqual(["FAILED:9"]);
    expect(projectSignals(index, "alpha").sort()).toEqual([
      "pipeline:Alpha:3:refs/heads/main/FAILED:9",
      "pr:repo:7/MERGE_CONFLICTS",
      "wi:1/STALE",
    ]);
  });
});

describe("snooze dates", () => {
  it("offers presets at 09:00 local time, with next week on Monday", () => {
    const friday = new Date(2026, 9, 23, 15, 30);
    const [tomorrow, nextWeek, twoWeeks] = snoozePresets(friday);

    expect(tomorrow?.until).toEqual(new Date(2026, 9, 24, 9));
    expect(nextWeek?.until).toEqual(new Date(2026, 9, 26, 9));
    expect(twoWeeks?.until).toEqual(new Date(2026, 10, 6, 9));
    expect(snoozePresets(new Date(2026, 9, 26, 8))[1]?.until).toEqual(new Date(2026, 10, 2, 9));
  });

  it("parses date input values", () => {
    expect(snoozeDateFromInput("2026-11-05")).toEqual(new Date(2026, 10, 5, 9));
    expect(snoozeDateFromInput("")).toBeNull();
    expect(snoozeDateFromInput("05/11/2026")).toBeNull();
  });
});
