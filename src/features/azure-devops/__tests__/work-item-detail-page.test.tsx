import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { mockBackend, renderWithProviders } from "@/test/render";
import { WorkItemDetailPage } from "../pages/work-item-detail-page";
import type { WorkItemDetail } from "../types/azure.types";
import { CREDENTIAL_ID, dashboard } from "./fixtures";

const PATH = "/azure/:credentialId/projects/:projectId/work-items/:workItemId";
const ROUTE = `/azure/${CREDENTIAL_ID}/projects/Alpha/work-items/999`;

describe("WorkItemDetailPage", () => {
  it("says a ticket Azure DevOps cannot find doesn't exist, with a way back and no retry", async () => {
    mockBackend([
      {
        path: `/api/azure/${CREDENTIAL_ID}/projects/Alpha/work-items/999`,
        status: 404,
        body: { message: "The Azure DevOps resource was not found", reason: "AZURE_NOT_FOUND" },
      },
    ]);
    renderWithProviders(<WorkItemDetailPage />, { path: PATH, route: ROUTE });

    expect(await screen.findByText("Ticket #999 doesn't exist or you can't see it")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to My work" })).toHaveAttribute("href", `/azure/${CREDENTIAL_ID}`);
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("keeps the general error, with Try again, for any other 404", async () => {
    mockBackend([
      {
        path: `/api/azure/${CREDENTIAL_ID}/projects/Alpha/work-items/999`,
        status: 404,
        body: { message: "No such API route", reason: "ROUTE_NOT_FOUND" },
      },
    ]);
    renderWithProviders(<WorkItemDetailPage />, { path: PATH, route: ROUTE });

    expect(await screen.findByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.queryByText(/doesn't exist or you can't see it/)).not.toBeInTheDocument();
  });

  it("says when part of the middle of a long history is not shown", async () => {
    const summary = dashboard.sections.workItems.data![0]!;
    const workItem: WorkItemDetail = {
      ...summary,
      id: 999,
      projectName: "Alpha",
      description: "",
      acceptanceCriteria: "",
      reproSteps: "",
      comments: { status: "ok", data: [], reason: null },
      history: { status: "ok", data: [], reason: null },
      historyTruncated: true,
      linkedPullRequests: { status: "ok", data: [], reason: null },
      allowedStates: [],
      supportedFields: { originalEstimate: false, remainingWork: false, completedWork: false, storyPoints: false, effort: false, priority: false },
      compliance: { ...dashboard.sections.compliance.data![0]!, workItemId: 999, configured: false, sopProject: "not-set-up" },
      closeAfterMergeAllowed: true,
      family: { status: "ok", data: { parent: null, parentIsMine: false, myChildren: [], otherChildren: 0 }, reason: null },
    };
    mockBackend([{ path: `/api/azure/${CREDENTIAL_ID}/projects/Alpha/work-items/999`, body: { workItem } }]);
    renderWithProviders(<WorkItemDetailPage />, { path: PATH, route: ROUTE });

    await userEvent.click(await screen.findByRole("tab", { name: "Work log" }));
    expect(await screen.findByText("This ticket has a very long history; part of the middle of it is not shown.")).toBeInTheDocument();
  });
});
