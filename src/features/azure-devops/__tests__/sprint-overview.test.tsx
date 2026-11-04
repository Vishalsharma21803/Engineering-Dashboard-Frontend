import { useQueryClient } from "@tanstack/react-query";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { mockBackend, renderWithProviders } from "@/test/render";
import { azureKeys } from "../api/azure.keys";
import { CommandPalette } from "../components/command-palette";
import { GettingStarted } from "../components/getting-started";
import { SprintOverview } from "../components/sprint-overview";
import type { MyWorkOverview } from "../types/azure.types";
import { CREDENTIAL_ID, dashboard } from "./fixtures";

// Wednesday 2026-11-04, noon: the sprint runs Mon 2026-11-02 to Fri 2026-11-13.
const now = new Date(2026, 10, 4, 12);
// Azure sends sprint days as midnight UTC: the 13th must stay the 13th in every time zone.
const sprint = { name: "Sprint 12", path: "Alpha\\Sprint 12", startDate: "2026-11-02T00:00:00Z", finishDate: "2026-11-13T00:00:00Z" };

function renderOverview(overview: MyWorkOverview, onSection = vi.fn()) {
  renderWithProviders(
    <SprintOverview
      overview={overview}
      sprintMode="current"
      hoursPerDay={8}
      hoursPerDayIsDefault
      notifications={null}
      generatedAt={now.toISOString()}
      onRefresh={() => undefined}
      isRefreshing={false}
      onSection={onSection}
      now={now}
    />
  );
  return onSection;
}

describe("SprintOverview", () => {
  it("says how many working days are left and compares hours left with the hours available", async () => {
    const onSection = renderOverview({ sprint, counts: { inProgress: 2, todo: 1, resolved: 1, done: 0 }, remainingHours: 20 });
    const header = screen.getByRole("region", { name: "Sprint overview" });

    expect(screen.getByRole("heading", { name: "Sprint 12" })).toBeInTheDocument();
    // Wed to Fri next week: 8 working days, 64 h at 8 h a day.
    expect(header).toHaveTextContent("8 working days left");
    expect(header).toHaveTextContent(/ends Fri, (13 Nov|Nov 13)/);
    expect(header).toHaveTextContent("20 h left");
    expect(header).toHaveTextContent("of 64 h you have left");
    expect(header).toHaveTextContent("1 of 4 tickets finished");

    await userEvent.click(screen.getByRole("button", { name: "2 in progress" }));
    expect(onSection).toHaveBeenCalledWith("inProgress");
  });

  it("counts the sprint in working days, so the last day is not already 100% gone", () => {
    renderWithProviders(
      <SprintOverview
        overview={{ sprint, counts: { inProgress: 0, todo: 0, resolved: 0, done: 4 }, remainingHours: 0 }}
        sprintMode="current"
        hoursPerDay={8}
        hoursPerDayIsDefault={false}
        notifications={null}
        generatedAt={now.toISOString()}
        onRefresh={() => undefined}
        isRefreshing={false}
        onSection={() => undefined}
        now={new Date(2026, 10, 13, 9)}
      />
    );
    expect(screen.getByRole("region", { name: "Sprint overview" })).toHaveTextContent("1 working day left");
    // 9 of 10 working days behind me: the "today" tick sits at 90%.
    expect(screen.getByText("Today").parentElement).toHaveStyle({ left: "90%" });
  });

  it("says so when My work could not be loaded, instead of loading forever", () => {
    renderWithProviders(
      <SprintOverview overview={null} unavailable sprintMode={null} hoursPerDay={8} hoursPerDayIsDefault notifications={null} generatedAt={now.toISOString()} onRefresh={() => undefined} isRefreshing={false} onSection={() => undefined} />
    );
    expect(screen.getByRole("region", { name: "Sprint overview" })).toHaveTextContent("Your tickets could not be loaded");
  });

  it("warns when there are more hours left than working hours", () => {
    renderOverview({ sprint, counts: { inProgress: 1, todo: 3, resolved: 0, done: 0 }, remainingHours: 80 });
    expect(screen.getByText("16 h more than the 64 h you have left")).toBeInTheDocument();
  });

  it("says when the finished share trails the time gone", () => {
    // 9 days into a 10-day sprint with nothing finished.
    renderWithProviders(
      <SprintOverview
        overview={{ sprint, counts: { inProgress: 1, todo: 3, resolved: 0, done: 0 }, remainingHours: 4 }}
        sprintMode="current"
        hoursPerDay={8}
        hoursPerDayIsDefault={false}
        notifications={null}
        generatedAt={now.toISOString()}
        onRefresh={() => undefined}
        isRefreshing={false}
        onSection={() => undefined}
        now={new Date(2026, 10, 12, 12)}
      />
    );
    expect(screen.getByRole("region", { name: "Sprint overview" })).toHaveTextContent(/behind: 0% finished/);
  });
});

function Seeded({ children }: { children: React.ReactNode }) {
  useQueryClient().setQueryData(azureKeys.dashboard(CREDENTIAL_ID, undefined), dashboard);
  return <>{children}</>;
}

function Location() {
  return <output aria-label="location">{useLocation().pathname}</output>;
}

describe("CommandPalette", () => {
  const pages = [{ label: "Project overview", to: "/azure/c/overview", key: "o" }];

  it("opens with Ctrl+K, finds a ticket from what the dashboard loaded, and opens it with Enter", async () => {
    renderWithProviders(
      <Seeded>
        <CommandPalette credentialId={CREDENTIAL_ID} pages={pages} />
        <Location />
      </Seeded>,
      { path: "*" }
    );

    await userEvent.keyboard("{Control>}k{/Control}");
    const input = await screen.findByRole("combobox", { name: "Search tickets, pull requests and pages" });
    await userEvent.type(input, "crash");
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.getByRole("option")).toHaveTextContent("#103 Crash on save");

    await userEvent.keyboard("{Enter}");
    expect(screen.getByLabelText("location")).toHaveTextContent(`/azure/${CREDENTIAL_ID}/projects/Alpha/work-items/103`);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("loads the tickets itself when no dashboard was loaded yet", async () => {
    mockBackend([{ path: `/api/azure/${CREDENTIAL_ID}/dashboard`, body: { dashboard } }]);
    renderWithProviders(<CommandPalette credentialId={CREDENTIAL_ID} pages={pages} />, { path: "*" });

    await userEvent.keyboard("{Control>}k{/Control}");
    const input = await screen.findByRole("combobox", { name: "Search tickets, pull requests and pages" });
    await userEvent.type(input, "crash");

    expect(await screen.findByRole("option", { name: /#103 Crash on save/ })).toBeInTheDocument();
    expect(screen.queryByText("Loading your tickets…")).not.toBeInTheDocument();
  });

  it("says when the tickets could not be loaded, and still finds pages", async () => {
    mockBackend([{ path: `/api/azure/${CREDENTIAL_ID}/dashboard`, status: 502, body: { message: "Azure DevOps could not be reached", reason: "AZURE_UNAVAILABLE" } }]);
    renderWithProviders(<CommandPalette credentialId={CREDENTIAL_ID} pages={pages} />, { path: "*" });

    await userEvent.keyboard("{Control>}k{/Control}");
    const input = await screen.findByRole("combobox", { name: "Search tickets, pull requests and pages" });
    // A 5xx is retried once (about 1 s later) before the failure shows.
    expect(await screen.findByText("Your tickets could not be loaded; only pages are searchable.", undefined, { timeout: 5_000 })).toBeInTheDocument();
    await userEvent.type(input, "overview");
    expect(screen.getByRole("option", { name: /Project overview/ })).toBeInTheDocument();
    await userEvent.clear(input);
    await userEvent.type(input, "nothing like this");
    expect(screen.getByText("No tickets or pull requests match.")).toBeInTheDocument();
  });

  it("jumps to a page with G then its key", async () => {
    renderWithProviders(
      <>
        <CommandPalette credentialId={CREDENTIAL_ID} pages={pages} />
        <Location />
      </>,
      { path: "*" }
    );
    await userEvent.keyboard("go");
    expect(screen.getByLabelText("location")).toHaveTextContent("/azure/c/overview");
  });
});

describe("GettingStarted", () => {
  beforeEach(() => window.localStorage.clear());

  it("shows three tips until dismissed, then stays dismissed", async () => {
    const { unmount } = renderWithProviders(<GettingStarted />);
    expect(screen.getByRole("region", { name: "Getting started" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(screen.queryByRole("region", { name: "Getting started" })).not.toBeInTheDocument();
    unmount();

    renderWithProviders(<GettingStarted />);
    expect(screen.queryByRole("region", { name: "Getting started" })).not.toBeInTheDocument();
  });
});
