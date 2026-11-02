import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { mockBackend, renderWithProviders } from "@/test/render";
import { VerifyTab } from "../components/verify-tab";
import type { SolidtimeConnection, TimeVerification, VerificationItem } from "../types/solidtime.types";

const connection: SolidtimeConnection = {
  credentialId: "11111111-1111-4111-8111-111111111111",
  baseUrl: "https://time.example.com",
  label: null,
  lastValidatedAt: new Date().toISOString(),
  lastValidationStatus: "VALID",
  organizationId: "22222222-2222-4222-8222-222222222222",
  organizationName: "Sifars",
  memberId: "33333333-3333-4333-8333-333333333333",
  role: "employee",
  canViewTeam: false,
  azureCredentialId: "44444444-4444-4444-8444-444444444444",
  projectMap: {},
  dailyTargetHours: 8,
  timerAlertHours: 10,
};
const base = `/api/solidtime/${connection.credentialId}`;
const today = "2026-10-29";

function item(ticketId: number, status: VerificationItem["status"], overrides: Partial<VerificationItem> = {}): VerificationItem {
  return {
    ticketId,
    title: `Ticket ${ticketId}`,
    type: "Task",
    state: "Active",
    projectName: "Alpha",
    periodHours: 1,
    trackedHours: 3,
    azure: { completedWork: 1, remainingWork: null, originalEstimate: null },
    suggested: { completedWork: 3, remainingWork: null },
    status,
    finished: false,
    ...overrides,
  };
}

const verification: TimeVerification = {
  from: "2026-10-23",
  to: today,
  basis: "mine",
  items: [
    item(103, "missing", { azure: { completedWork: null, remainingWork: 1, originalEstimate: null }, suggested: { completedWork: 1, remainingWork: 1 }, trackedHours: 1 }),
    item(102, "mismatch"),
    item(106, "azure-higher", { azure: { completedWork: 5, remainingWork: null, originalEstimate: null }, suggested: { completedWork: 2, remainingWork: null }, trackedHours: 2 }),
    item(107, "remaining", { azure: { completedWork: 4, remainingWork: 5, originalEstimate: 8 }, trackedHours: 4, suggested: { completedWork: 4, remainingWork: 4 } }),
    item(104, "cannot-update", { type: "User Story", projectName: "Beta", state: "Closed", finished: true }),
    item(101, "matched", { azure: { completedWork: 4, remainingWork: 4, originalEstimate: 8 }, trackedHours: 4, suggested: { completedWork: 4, remainingWork: 4 } }),
  ],
  notFound: [{ ticketId: 404, periodHours: 1 }],
  unlinkedHours: 0.5,
  counts: { missing: 1, mismatch: 1, "azure-higher": 1, remaining: 1, running: 0, "cannot-update": 1, matched: 1 },
};

describe("VerifyTab", () => {
  it("leads with a summary, lists only the problems, and offers updates only where Azure is lower", async () => {
    const calls = mockBackend([{ path: `${base}/verification`, body: { verification } }]);
    const onPropose = vi.fn();
    renderWithProviders(<VerifyTab connection={connection} onPropose={onPropose} isProposing={false} today={today} />);

    expect(await screen.findByText(/1 missing in Azure · 1 differ · 1 Azure higher · 1 remaining outdated · 1 can't update · 1 matched/)).toBeInTheDocument();
    // Today by default, Azure read fresh.
    expect(calls[0]?.url).toContain(`from=${today}&to=${today}&refresh=true`);
    expect(screen.getByLabelText("Day")).toHaveTextContent("Today");

    // Every ticket is listed, matched ones included, the ones needing attention first.
    const list = screen.getByRole("list", { name: "Tickets" });
    expect(within(list).getAllByRole("listitem").map((row) => row.querySelector("a")?.textContent)).toEqual(["#103 Ticket 103", "#102 Ticket 102", "#106 Ticket 106", "#107 Ticket 107", "#104 Ticket 104", "#101 Ticket 101"]);
    const rows = within(list).getAllByRole("listitem");
    expect(within(list).getAllByRole("button", { name: "Update Azure…" })).toHaveLength(2);
    // "Differs" is only about Completed Work: the row shows the gap, not Remaining Work.
    expect(rows[1]).toHaveTextContent("Differs");
    expect(rows[1]).toHaveTextContent("Gap+2 h");
    expect(rows[1]).not.toHaveTextContent("Remaining");
    expect(within(list).getByText("Azure has more; never lowered.")).toBeInTheDocument();
    // Completed Work already matches: shown as Remaining outdated, with its own update.
    expect(rows[3]).toHaveTextContent("Remaining outdated");
    expect(rows[3]).toHaveTextContent("Remaining5 h → 4 h");
    expect(rows[3]).not.toHaveTextContent("Differs");
    expect(within(rows[3]!).getByRole("button", { name: "Update remaining…" })).toBeInTheDocument();
    expect(within(list).getByText("No Completed Work on User Story.")).toBeInTheDocument();
    // A closed ticket says so.
    expect(rows[4]).toHaveTextContent("Closed");
    expect(rows[0]).not.toHaveTextContent("Closed");
    expect(rows[5]).toHaveTextContent("Matched");
    expect(rows[5]).toHaveTextContent("In sync");
    expect(screen.getByRole("note")).toHaveTextContent("your own time");
    expect(screen.getByText(/#404 \(1 h\)/)).toBeInTheDocument();
    // The ticket ID search lives here now.
    expect(screen.getByRole("form", { name: "Ticket time lookup" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Update 3 in Azure…" }));
    expect(onPropose).toHaveBeenLastCalledWith({
      credentialId: connection.azureCredentialId,
      kind: "WORK_ITEMS_UPDATE_TIME",
      source: "USER",
      target: {},
      params: {
        items: [
          { projectId: "Alpha", workItemId: 103, completedWork: 1, remainingWork: 1 },
          { projectId: "Alpha", workItemId: 102, completedWork: 3 },
          { projectId: "Alpha", workItemId: 107, completedWork: 4, remainingWork: 4 },
        ],
      },
    });

    await userEvent.click(within(within(list).getAllByRole("listitem")[1]!).getByRole("button", { name: "Update Azure…" }));
    expect(onPropose).toHaveBeenLastCalledWith({
      credentialId: connection.azureCredentialId,
      kind: "WORK_ITEM_UPDATE_FIELDS",
      source: "USER",
      target: { projectId: "Alpha", workItemId: 102 },
      params: { completedWork: 3 },
    });
  });

  it("checks one day picked from the Day calendar, a quick range, or any range from the calendar", async () => {
    const calls = mockBackend([
      { path: `${base}/verification`, body: { verification: { ...verification, from: today, items: [verification.items[5]!], notFound: [], unlinkedHours: 0, counts: { missing: 0, mismatch: 0, "azure-higher": 0, remaining: 0, running: 0, "cannot-update": 0, matched: 1 } } } },
    ]);
    const requested = (from: string, to: string) => calls.some((call) => call.url.includes(`from=${from}&to=${to}`));
    const day = (value: string) => document.querySelector<HTMLButtonElement>(`[data-day="${new Date(`${value}T00:00`).toLocaleDateString()}"]`)!;
    renderWithProviders(<VerifyTab connection={connection} onPropose={vi.fn()} isProposing={false} today={today} />);

    // Quick range: last week, Monday to Sunday (today is Thursday 29 October).
    await userEvent.click(await screen.findByLabelText("Range"));
    await userEvent.click(screen.getByRole("button", { name: "Last week" }));
    await waitFor(() => expect(requested("2026-10-19", "2026-10-25")).toBe(true));
    expect(screen.getByLabelText("Range")).toHaveTextContent("Last week");

    // Any single day, not only today.
    await userEvent.click(screen.getByLabelText("Day"));
    await userEvent.click(day("2026-10-27"));
    await waitFor(() => expect(requested("2026-10-27", "2026-10-27")).toBe(true));
    expect(screen.getByLabelText("Day")).toHaveAttribute("data-value", "2026-10-27");
    expect(screen.getByLabelText("Range")).toHaveTextContent("Range");

    // Any range: first day, then last day.
    await userEvent.click(screen.getByLabelText("Range"));
    await userEvent.click(day("2026-10-20"));
    await userEvent.click(day("2026-10-22"));
    await waitFor(() => expect(requested("2026-10-20", "2026-10-22")).toBe(true));

    expect(await screen.findByText("In sync")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /in Azure…/ })).not.toBeInTheDocument();
  });
});
