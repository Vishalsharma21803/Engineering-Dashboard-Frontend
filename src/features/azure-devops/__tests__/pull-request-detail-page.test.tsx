import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { mockBackend, renderWithProviders } from "@/test/render";
import { PullRequestDetailPage } from "../pages/pull-request-detail-page";
import type { PullRequestDetail } from "../types/azure.types";
import { CREDENTIAL_ID } from "./fixtures";

const PATH = "/azure/:credentialId/projects/:projectId/repos/:repositoryId/pull-requests/:pullRequestId";
const ROUTE = `/azure/${CREDENTIAL_ID}/projects/Alpha/repos/repo-1/pull-requests/42`;

const pullRequest: PullRequestDetail = {
  projectId: "p-alpha",
  projectName: "Alpha",
  repositoryId: "repo-1",
  repositoryName: "web",
  pullRequestId: 42,
  title: "Fix the save crash",
  status: "active",
  isDraft: false,
  mergeStatus: null,
  createdBy: { id: "me", displayName: "Me", uniqueName: null },
  creationDate: "2026-11-02T08:00:00Z",
  closedDate: null,
  sourceBranch: "fix/save",
  targetBranch: "main",
  reviewers: [],
  approvals: 0,
  rejections: 0,
  unresolvedThreads: 0,
  myRole: "author",
  myVote: null,
  webUrl: "https://dev.azure.com/acme/Alpha/_git/web/pullrequest/42",
  description: "",
  threads: { status: "ok", data: [], reason: null },
  policies: { status: "ok", data: [], reason: null },
  linkedWorkItemIds: { status: "ok", data: [103, 104], reason: null },
};

function render(served: PullRequestDetail) {
  mockBackend([{ path: `/api/azure/${CREDENTIAL_ID}/projects/Alpha/repos/repo-1/pull-requests/42`, body: { pullRequest: served } }]);
  renderWithProviders(<PullRequestDetailPage />, { path: PATH, route: ROUTE });
}

describe("PullRequestDetailPage linked work items", () => {
  it("shows each linked ticket's title, type and state, and the id alone for one without a title", async () => {
    render({ ...pullRequest, linkedWorkItems: [{ id: 103, title: "Crash on save", state: "Resolved", type: "Bug" }] });

    const titled = await screen.findByRole("link", { name: "#103 Crash on save" });
    expect(titled).toHaveAttribute("href", `/azure/${CREDENTIAL_ID}/projects/Alpha/work-items/103`);
    expect(screen.getByText("Bug · Resolved")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "#104" })).toHaveAttribute("href", `/azure/${CREDENTIAL_ID}/projects/Alpha/work-items/104`);
  });

  it("shows every id alone when the titles could not be read", async () => {
    render(pullRequest);

    expect(await screen.findByRole("link", { name: "#103" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "#104" })).toBeInTheDocument();
  });
});
