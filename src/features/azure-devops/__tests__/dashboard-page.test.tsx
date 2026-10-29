import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { mockBackend, renderWithProviders } from "@/test/render";
import { DashboardPage } from "../pages/dashboard-page";
import { CREDENTIAL_ID, dashboard, dashboardListBody, pageOf, pendingAction } from "./fixtures";

const base = `/api/azure/${CREDENTIAL_ID}`;

function setup() {
  const calls = mockBackend([
    { path: `${base}/dashboard`, body: { dashboard } },
    {
      path: `${base}/my-work`,
      body: {
        myWork: {
          items: (dashboard.sections.workItems.data ?? []).map((workItem) => ({
            workItem,
            compliance: dashboard.sections.compliance.data?.find((result) => result.workItemId === workItem.id) ?? null,
          })),
          page: 1,
          pageSize: 10,
          total: dashboard.sections.workItems.data?.length ?? 0,
          totalPages: 1,
          poolTotal: dashboard.sections.workItems.data?.length ?? 0,
          hiddenCount: 0,
          showingHidden: false,
          facets: { types: [], states: [], priorities: [], sop: [] },
        },
      },
    },
    { path: "/api/actions", body: { actions: pageOf([]) } },
    { path: `${base}/dashboard/recommendations`, body: dashboardListBody(`${base}/dashboard/recommendations`, []) },
    { path: `${base}/dashboard/pull-requests`, body: dashboardListBody(`${base}/dashboard/pull-requests`, []) },
    { path: `${base}/dashboard/pipeline-runs`, body: dashboardListBody(`${base}/dashboard/pipeline-runs`, []) },
    { path: "/api/triage", body: { marks: [] } },
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

    expect(await screen.findByText("#103 Crash on save")).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "#102 Fix flaky test" })).toBeInTheDocument();
    expect(within(screen.getByRole("table")).getByTitle("Task")).toHaveTextContent("Task");
    expect(screen.getByTitle("Estimate exists: No original estimate (hours). (missed in an earlier stage)")).toHaveTextContent("STR-05");
    expect(screen.getByText(/does not grant access to pipelines/)).toBeInTheDocument();
    expect(await screen.findByText("Build (Read): missing")).toBeInTheDocument();

    for (const call of calls) {
      expect(call.url.startsWith("/api/")).toBe(true);
    }
  });

  it("proposes a recommended action and opens review without executing it", async () => {
    const calls = setup();

    await userEvent.click(await screen.findByRole("button", { name: "Close after merge…" }));

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
});
