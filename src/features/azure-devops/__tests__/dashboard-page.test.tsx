import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { mockBackend, renderWithProviders, type MockRoute } from "@/test/render";
import { DashboardPage } from "../pages/dashboard-page";
import { CREDENTIAL_ID, attentionFor, dashboard, dashboardListBody, pageOf, pendingAction } from "./fixtures";

const base = `/api/azure/${CREDENTIAL_ID}`;

/** `myWorkPatch` changes the My work page; `routes` replace the canned ones (matched first). */
function setup(served = dashboard, { myWorkPatch = {}, routes = [] }: { myWorkPatch?: Record<string, unknown>; routes?: MockRoute[] } = {}) {
  const calls = mockBackend([
    ...routes,
    { path: `${base}/dashboard`, body: { dashboard: served } },
    {
      path: `${base}/my-work`,
      body: {
        myWork: {
          items: (dashboard.sections.workItems.data ?? []).map((workItem) => ({
            heading: null,
            section: null, progress: null, latest: null, headingRow: null,
            rows: [{ workItem, compliance: dashboard.sections.compliance.data?.find((result) => result.workItemId === workItem.id) ?? null, attention: attentionFor(workItem.id) }],
          })),
          page: 1,
          pageSize: 10,
          total: dashboard.sections.workItems.data?.length ?? 0,
          totalPages: 1,
          groupBy: "status",
          sections: [],
          overview: { sprint: null, counts: { inProgress: 1, todo: 0, resolved: 1, done: 0 }, remainingHours: 0 },
          ticketCount: dashboard.sections.workItems.data?.length ?? 0,
          poolTotal: dashboard.sections.workItems.data?.length ?? 0,
          hiddenCount: 0,
          showingHidden: false,
          sprint: { mode: "all", inSprint: 0, names: [] },
          closed: { included: false, count: 0 },
          attention: { only: false, count: 1 },
          facets: { types: [], states: [], priorities: [], sop: [] },
          ...myWorkPatch,
        },
      },
    },
    { path: "/api/actions", body: { actions: pageOf([]) } },
    { path: `${base}/dashboard/recommendations`, body: dashboardListBody(`${base}/dashboard/recommendations`, []) },
    { path: `${base}/dashboard/pull-requests`, body: dashboardListBody(`${base}/dashboard/pull-requests`, []) },
    { path: `${base}/dashboard/pipeline-runs`, body: dashboardListBody(`${base}/dashboard/pipeline-runs`, []) },
    { path: "/api/triage", body: { marks: [] } },
    {
      path: "/api/notifications",
      body: {
        notifications: [
          { id: "n1", key: "time:day:2026-11-02", kind: "timeDay", projectName: null, title: "Only 7.9 h tracked on Mon, Nov 2", reasons: [], target: { type: "time", projectName: null, id: 0 }, status: "UNREAD", firstSeenAt: "2026-11-03T08:00:00Z", updatedAt: "2026-11-03T08:00:00Z" },
          { id: "n2", key: "approvals", kind: "approvals", projectName: null, title: "1 change awaits your approval", reasons: [], target: { type: "actions", projectName: null, id: 0 }, status: "READ", firstSeenAt: "2026-11-03T08:00:00Z", updatedAt: "2026-11-03T08:00:00Z" },
        ],
      },
    },
    {
      path: `${base}/capabilities`,
      body: {
        capabilities: {
          identity: dashboard.identity,
          scopes: { project: "granted", work: "granted", code: "granted", build: "missing", release: "unknown", environment: "unknown" },
          writeScopes: { work: "unknown", build: "unknown" },
        },
      },
    },
    { method: "POST", path: "/api/actions", status: 201, body: { message: "Action proposed", action: pendingAction } },
  ]);

  renderWithProviders(<DashboardPage />, { path: "/azure/:credentialId", route: `/azure/${CREDENTIAL_ID}` });
  return calls;
}

describe("DashboardPage", () => {
  it("renders prioritized work, compliance and degraded sections from the backend only", async () => {
    const calls = setup();

    expect(await screen.findByRole("link", { name: "103 Crash on save" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "102 Fix flaky test" })).toBeInTheDocument();
    const myWork = screen.getByRole("list", { name: "My work items" });
    // A row: type, title, and its most serious problem in plain words (all of them in its hint).
    expect(within(myWork).getAllByText("Task").length).toBeGreaterThan(0);
    expect(within(myWork).getByText("No original estimate (hours)")).toBeInTheDocument();
    expect(screen.getByText(/does not grant access to pipelines/)).toBeInTheDocument();
    // One sprint header instead of tiles; token permissions live on the Credentials page now.
    expect(screen.getByRole("region", { name: "Sprint overview" })).toHaveTextContent("2 tickets assigned to you");
    expect(screen.queryByText("PAT permissions")).not.toBeInTheDocument();

    for (const call of calls) {
      expect(call.url.startsWith("/api/")).toBe(true);
    }
  });

  it("is one list: no separate actions block, and a ticket's problem and fix are on its row", async () => {
    setup();
    const myWork = await screen.findByRole("list", { name: "My work items" });
    expect(screen.queryByText("Needs you now")).not.toBeInTheDocument();
    const row = within(myWork).getByRole("link", { name: "103 Crash on save" }).closest("li")!;
    expect(within(row).getByRole("button", { name: "Close after merge… #103" })).toHaveTextContent("Fix…");
  });

  it("puts everything that needs me outside the list behind one Notifications button with the unread count", async () => {
    setup();
    const header = await screen.findByRole("region", { name: "Sprint overview" });
    expect(await within(header).findByRole("button", { name: "Notifications, 1 unread" })).toBeInTheDocument();
  });

  it("says which sections could not be read, so the counts are not taken as complete", async () => {
    setup({ ...dashboard, sections: { ...dashboard.sections, compliance: { status: "error", data: null, reason: "AZURE_UPSTREAM_ERROR" } } });

    expect(await screen.findByText(/Could not read SOP checks from Azure DevOps/)).toBeInTheDocument();
    // A missing PAT scope is explained in its own section, not as a failure to retry.
    expect(screen.getByText(/Could not read SOP checks from Azure DevOps/)).not.toHaveTextContent("pipelines");
  });

  it("proposes a recommended action and opens review without executing it", async () => {
    const calls = setup();

    await userEvent.click(await screen.findByRole("button", { name: "Close after merge… #103" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(pendingAction.summary)).toBeInTheDocument();

    const writes = calls.filter((call) => call.method === "POST");
    expect(writes).toEqual([
      {
        method: "POST",
        url: "/api/actions",
        body: {
          credentialId: CREDENTIAL_ID,
          kind: "WORK_ITEM_CLOSE_AFTER_MERGE",
          source: "RECOMMENDATION",
          target: { projectId: "Alpha", workItemId: 103 },
          params: {},
        },
      },
    ]);
    expect(calls.some((call) => call.url.includes("/approve"))).toBe(false);
  });

  it("says once, in My work, that the ticket list was cut and states were guessed", async () => {
    const partial = { workItemsTruncated: { cap: 200 }, stateLookupFailed: ["Bug in Alpha"] };
    setup({ ...dashboard, ...partial }, { myWorkPatch: partial });

    const myWork = await screen.findByRole("list", { name: "My work items" });
    expect(myWork).toBeInTheDocument();
    expect(screen.getAllByText("Showing the 200 most recently changed tickets; older ones are not listed or checked.")).toHaveLength(1);
    expect(screen.getAllByText("Ticket states for Bug in Alpha could not be read from Azure DevOps; open/closed is guessed from the state name.")).toHaveLength(1);
  });

  it("shows the dashboard's notices when My work itself could not be loaded", async () => {
    setup(
      { ...dashboard, workItemsTruncated: { cap: 200 }, stateLookupFailed: ["Bug in Alpha"] },
      { routes: [{ path: `${base}/my-work`, status: 400, body: { message: "Bad request" } }] }
    );

    expect(await screen.findByText("Showing the 200 most recently changed tickets; older ones are not listed or checked.")).toBeInTheDocument();
    expect(screen.getByText("Ticket states for Bug in Alpha could not be read from Azure DevOps; open/closed is guessed from the state name.")).toBeInTheDocument();
  });

  it("shows what the pull request and pipeline lists left out", async () => {
    const completeness = (note: string) => ({ truncated: false, cap: 100, failedProjects: ["Beta"], note });
    // The fixture's PAT cannot read pipelines; here it can.
    setup({ ...dashboard, sections: { ...dashboard.sections, pipelines: { status: "ok", reason: null, data: [] } } }, {
      routes: [
        {
          path: `${base}/dashboard/pull-requests`,
          body: { pullRequests: { ...pageOf([]), poolTotal: 0, hiddenCount: 0, showingHidden: false, facets: { person: [], review: [], repositories: [] }, completeness: completeness("Pull requests of Beta could not be read.") } },
        },
        {
          path: `${base}/dashboard/pipeline-runs`,
          body: { runs: { ...pageOf([]), poolTotal: 0, hiddenCount: 0, showingHidden: false, facets: { results: [] }, completeness: completeness("Pipeline runs of Beta could not be read.") } },
        },
      ],
    });

    expect(await screen.findByText("Pull requests of Beta could not be read.")).toBeInTheDocument();
    expect(await screen.findByText("Pipeline runs of Beta could not be read.")).toBeInTheDocument();
  });
});
