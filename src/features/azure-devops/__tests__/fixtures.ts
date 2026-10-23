import type { ProposedAction } from "../types/action.types";
import type { Dashboard } from "../types/azure.types";

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
          skippedRules: [],
          violations: [
            { ruleId: "MISSING_ESTIMATE", severity: "high", message: "No estimate", suggestedAction: null },
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
