import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { mockBackend, renderWithProviders } from "@/test/render";
import { ProjectOverviewPage } from "../pages/project-overview-page";
import type { ProjectOverview } from "../types/azure.types";
import { CREDENTIAL_ID } from "./fixtures";

const PATH = "/azure/:credentialId/projects/:projectId";
const ROUTE = `/azure/${CREDENTIAL_ID}/projects/Alpha`;

const ok = (data: number) => ({ status: "ok" as const, data, reason: null });

const project: ProjectOverview = {
  id: "Alpha",
  name: "Alpha",
  description: null,
  state: "wellFormed",
  visibility: "private",
  lastUpdateTime: null,
  url: "https://dev.azure.com/acme/_apis/projects/Alpha",
  processTemplate: "Agile",
  sourceControlType: "Git",
  defaultTeam: null,
  currentIteration: { status: "ok", data: null, reason: null },
  counts: { repositories: ok(3), myOpenWorkItems: ok(500), activePullRequests: ok(100), failingPipelines: ok(1) },
};

function render(served: ProjectOverview) {
  // Only the summary matters here; the lists below may fail.
  mockBackend([{ path: `/api/azure/${CREDENTIAL_ID}/projects/Alpha`, body: { project: served } }]);
  renderWithProviders(<ProjectOverviewPage />, { path: PATH, route: ROUTE });
}

const summary = () => screen.getByRole("group", { name: "Summary" });

describe("ProjectOverviewPage summary counts", () => {
  it("shows a count that hit its cap as n+", async () => {
    render({ ...project, myOpenWorkItemsTruncated: true, activePullRequestsTruncated: true, failingPipelinesTruncated: true });

    expect(await screen.findByText("500+")).toBeInTheDocument();
    expect(summary()).toHaveTextContent("500+ open items of yours");
    expect(summary()).toHaveTextContent("100+ active pull requests");
    expect(summary()).toHaveTextContent("1+ failing pipelines");
  });

  it("shows exact counts when nothing was cut", async () => {
    render(project);

    expect(await screen.findByText("500")).toBeInTheDocument();
    expect(summary()).toHaveTextContent("1 failing pipeline");
    expect(summary()).not.toHaveTextContent("+");
  });
});
