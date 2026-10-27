import type { ProposedAction } from "../types/action.types";
import type { Dashboard } from "../types/azure.types";
import type { TriageMark } from "../types/triage.types";
import { buildSignalIndex, isHidden, pipelineKey, pullRequestKey, recommendationKey, resolveTriage } from "../utils/triage";

export const CREDENTIAL_ID = "9b2f6c1e-1111-4111-8111-111111111111";

export const pendingAction: ProposedAction = {
  id: "aaaaaaaa-1111-4111-8111-111111111111",
  credentialId: CREDENTIAL_ID,
  organizationUrl: "https://dev.azure.com/acme",
  projectId: "Alpha",
  kind: "WORK_ITEM_CLOSE_AFTER_MERGE",
  source: "RECOMMENDATION",
  target: { projectId: "Alpha", workItemId: 103 },
  params: { state: "Closed", remainingWork: 0 },
  preview: [
    { field: "State", before: "Resolved", after: "Closed" },
    { field: "Remaining work (h)", before: 1, after: 0 },
  ],
  summary: "Close #103 Crash on save (all linked PRs merged)",
  payloadHash: "a".repeat(64),
  baseRev: 3,
  status: "PENDING",
  expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
  decidedAt: null,
  executedAt: null,
  result: null,
  errorCode: null,
  errorMessage: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const dashboard: Dashboard = {
  identity: { id: "me", displayName: "Dev Example", email: "dev@example.com" },
  generatedAt: new Date().toISOString(),
  projectsScanned: 2,
  projectsTruncated: false,
  sections: {
    workItems: {
      status: "ok",
      reason: null,
      data: [
        {
          id: 102,
          rev: 3,
          projectName: "Alpha",
          type: "Task",
          title: "Fix flaky test",
          state: "Active",
          stateCategory: "InProgress",
          reason: null,
          priority: 2,
          assignedTo: null,
          iterationPath: null,
          areaPath: null,
          tags: [],
          originalEstimate: null,
          remainingWork: null,
          completedWork: 0,
          storyPoints: null,
          effort: null,
          dueDate: null,
          blocked: false,
          createdDate: null,
          changedDate: null,
          stateChangeDate: null,
          closedDate: null,
          commentCount: 0,
          links: { pullRequests: [], commits: [], branches: [], builds: [], parentId: null, childIds: [] },
          webUrl: "https://dev.azure.com/acme/Alpha/_workitems/edit/102",
        },
      ],
    },
    pullRequests: { status: "ok", reason: null, data: [] },
    pipelines: { status: "forbidden", reason: "AZURE_INSUFFICIENT_SCOPE", data: null },
    compliance: {
      status: "ok",
      reason: null,
      data: [
        {
          workItemId: 102,
          projectName: "Alpha",
          title: "Fix flaky test",
          type: "Task",
          state: "Active",
          stateCategory: "InProgress",
          configured: true,
          sopProject: "checked",
          rulebook: { defaultVersion: 0, personalVersion: 0 },
          passedRules: [],
          pendingRules: [],
          skippedRules: [],
          aiRules: [],
          notices: [],
          violations: [
            {
              ruleId: "STR-05",
              ruleTitle: "Estimate exists",
              checker: "code",
              severity: "high",
              message: "No original estimate (hours).",
              evidence: [],
              suggestedAction: null,
            },
          ],
        },
      ],
    },
  },
  recommendations: [
    {
      id: "wi:103",
      score: 60,
      category: "SOP",
      title: "#103 Crash on save",
      reasons: ["All linked pull requests merged more than 24h ago but the ticket is still open"],
      signals: ["SOP:NOT_CLOSED_AFTER_MERGE"],
      target: { type: "workItem", projectName: "Alpha", id: 103, webUrl: null },
      suggestedAction: {
        kind: "WORK_ITEM_CLOSE_AFTER_MERGE",
        target: { projectId: "Alpha", workItemId: 103 },
        params: {},
        requiresInput: false,
      },
    },
  ],
};

/** An empty first page, as the server sends for an empty list. */
export function pageOf<T>(items: T[]) {
  return { items, page: 1, pageSize: 10, total: items.length, totalPages: Math.max(1, Math.ceil(items.length / 10)) };
}

/**
 * What the server's dashboard list endpoints answer for these triage marks
 * (it applies the same rules as utils/triage before paging). Null for other paths.
 */
export function dashboardListBody(url: string, marks: TriageMark[]): unknown {
  const parsed = new URL(url, "http://test");
  const base = `/api/azure/${CREDENTIAL_ID}/dashboard/`;

  if (!parsed.pathname.startsWith(base)) {
    return null;
  }

  const wantHidden = parsed.searchParams.get("hidden") === "1";
  const byKey = new Map(marks.map((item) => [item.itemKey, item]));
  const builds = dashboard.sections.pipelines.data ?? [];
  const buildsById = new Map(builds.map((build) => [build.id, build]));
  const signals = buildSignalIndex(dashboard.recommendations, builds);
  const stateOf = (key: string | null, projectName: string | null) => resolveTriage(byKey, key, projectName, key ? (signals.get(key)?.signals ?? []) : []).state;
  const split = <T,>(items: T[], hidden: (item: T) => boolean) => {
    const hiddenCount = items.filter(hidden).length;
    const showingHidden = wantHidden && hiddenCount > 0;
    return { pool: items.filter((item) => hidden(item) === showingHidden), hiddenCount, showingHidden };
  };

  switch (parsed.pathname.slice(base.length)) {
    case "recommendations": {
      const entries = dashboard.recommendations.map((recommendation) => ({
        recommendation,
        state: stateOf(recommendationKey(recommendation, buildsById), recommendation.target.projectName),
      }));
      const { pool, hiddenCount, showingHidden } = split(entries, (entry) => isHidden(entry.state));
      const category = parsed.searchParams.get("category") ?? "";
      const matching = category ? pool.filter((entry) => entry.recommendation.category === category) : pool;
      const active = matching.filter((entry) => entry.state === "active");
      const acknowledged = matching.filter((entry) => entry.state === "acknowledged");
      const ordered = showingHidden
        ? matching.map((entry) => ({ ...entry, rank: null }))
        : [...active.map((entry, index) => ({ ...entry, rank: index + 1 })), ...acknowledged.map((entry) => ({ ...entry, rank: null }))];
      const categories = [...new Set(pool.map((entry) => entry.recommendation.category))].map((value) => ({
        value,
        label: value,
        count: pool.filter((entry) => entry.recommendation.category === value).length,
      }));

      return {
        recommendations: {
          ...pageOf(ordered),
          poolTotal: pool.length,
          hiddenCount,
          showingHidden,
          activeTotal: showingHidden ? 0 : active.length,
          acknowledgedTotal: showingHidden ? 0 : acknowledged.length,
          facets: { categories },
        },
      };
    }
    case "pull-requests": {
      const { pool, hiddenCount, showingHidden } = split(dashboard.sections.pullRequests.data ?? [], (pr) =>
        isHidden(stateOf(pullRequestKey(pr.repositoryId, pr.pullRequestId), pr.projectName))
      );
      return { pullRequests: { ...pageOf(pool), poolTotal: pool.length, hiddenCount, showingHidden, facets: { person: [], review: [], repositories: [] } } };
    }
    case "pipeline-runs": {
      const { pool, hiddenCount, showingHidden } = split(builds, (build) => isHidden(stateOf(pipelineKey(build), build.projectName)));
      return { runs: { ...pageOf(pool), poolTotal: pool.length, hiddenCount, showingHidden, facets: { results: [] } } };
    }
    default:
      return null;
  }
}
