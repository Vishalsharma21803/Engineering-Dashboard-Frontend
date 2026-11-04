import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { mockBackend, renderWithProviders } from "@/test/render";
import { SopReportCard } from "../components/sop-report-card";
import type { SopReport, SopReportRunSummary } from "../types/sop.types";

const RUN_ID = "4f1d2c3b-1111-4111-8111-111111111111";
const BASE = "/api/sop/reports/c/Alpha";
const emptyPage = { items: [], page: 1, pageSize: 10, total: 0, totalPages: 1 };

const run: SopReportRunSummary = {
  id: RUN_ID,
  projectName: "Alpha",
  defaultVersion: 3,
  itemsChecked: 200,
  itemsWithGaps: 12,
  createdAt: "2026-11-03T09:00:00Z",
  timeScope: "mine",
  truncated: false,
};

function renderReport(summary: SopReportRunSummary, trackedHours: number | null) {
  const report: SopReport = {
    run: summary,
    trackedHours,
    itemsChecked: 200,
    itemsWithGaps: 12,
    compliantShare: 0.94,
    byRule: emptyPage,
    byPerson: {
      ...emptyPage,
      items: [{ personKey: "ravi", assignee: { id: "ravi", displayName: "Ravi", uniqueName: null }, roles: ["developer"], items: 4, itemsWithGaps: 1, gaps: 2, trackedHours: null }],
      total: 1,
    },
    items: emptyPage,
    facets: { people: [], roles: [], rules: [], types: [], states: [] },
  };
  mockBackend([
    { path: BASE, body: { runs: { ...emptyPage, items: [summary], total: 1, latestId: RUN_ID } } },
    { path: `${BASE}/${RUN_ID}`, body: { report } },
  ]);
  renderWithProviders(<SopReportCard credentialId="c" projectId="Alpha" />);
}

describe("SopReportCard", () => {
  it("says when only the 200 most recently changed tickets were checked", async () => {
    renderReport({ ...run, truncated: true }, 5);
    expect(await screen.findByText("Only the 200 most recently changed tickets were checked.")).toBeInTheDocument();
  });

  it("shows tracked time as unknown, never 0 h, when Solidtime could not be read", async () => {
    renderReport({ ...run, timeScope: "unavailable" }, null);

    expect(await screen.findByText("Solidtime could not be read when this run was made")).toBeInTheDocument();
    expect(screen.getByText("Unknown")).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Tracked" })).not.toBeInTheDocument();
    expect(screen.queryByText("0 h")).not.toBeInTheDocument();
    expect(screen.queryByText("Only the 200 most recently changed tickets were checked.")).not.toBeInTheDocument();
  });

  it("keeps the tracked column for a run with Solidtime hours", async () => {
    renderReport(run, 5);

    expect(await screen.findByText("5 h")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Tracked" })).toBeInTheDocument();
  });
});
