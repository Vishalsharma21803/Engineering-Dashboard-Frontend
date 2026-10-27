import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { mockBackend, renderWithProviders } from "@/test/render";
import { SolidtimeConnectionsSection } from "../components/solidtime-connections-section";
import { TicketTimerButton } from "../components/ticket-timer-button";
import { DraftTab } from "../components/draft-tab";
import { localDay } from "../utils/time";
import type { SolidtimeConnection } from "../types/solidtime.types";

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
const alpha = { id: "55555555-5555-4555-8555-555555555555", name: "Alpha", color: "#000000", client_id: null, is_archived: false, is_billable: false, estimated_time: null, spent_time: 0 };
const catalog = { projects: [alpha], tasks: [], tags: [] };

describe("TicketTimerButton", () => {
  it("proposes a timer for the ticket in its mapped project, then a stop once it runs", async () => {
    mockBackend([
      { path: `${base}/timer`, body: { timer: null } },
      { path: `${base}/catalog`, body: catalog },
    ]);
    const onPropose = vi.fn();
    renderWithProviders(<TicketTimerButton connection={connection} ticket={{ id: 101, title: "Implement login", projectName: "Alpha" }} onPropose={onPropose} />);

    await userEvent.click(await screen.findByRole("button", { name: "Start timer…" }));
    await waitFor(() => expect(onPropose).toHaveBeenCalled());
    expect(onPropose.mock.calls[0]?.[0]).toMatchObject({
      credentialId: connection.credentialId,
      kind: "SOLIDTIME_TIMER_START",
      params: { description: "#101 Implement login", projectId: alpha.id, taskId: null },
    });
  });

  it("offers Stop when the running timer is on this ticket, and blocks Start on another", async () => {
    const running = { id: "e1", start: new Date().toISOString(), end: null, duration: null, description: "Implement login (101)", task_id: null, project_id: null, organization_id: connection.organizationId, user_id: "u", tags: [], billable: false };
    mockBackend([
      { path: `${base}/timer`, body: { timer: { entry: running, inThisOrganization: true, tickets: [] } } },
      { path: `${base}/catalog`, body: catalog },
    ]);
    const onPropose = vi.fn();
    renderWithProviders(
      <>
        <TicketTimerButton connection={connection} ticket={{ id: 101, title: "Implement login", projectName: "Alpha" }} onPropose={onPropose} />
        <TicketTimerButton connection={connection} ticket={{ id: 102, title: "Other", projectName: "Alpha" }} onPropose={onPropose} />
      </>
    );

    await userEvent.click(await screen.findByRole("button", { name: "Stop timer…" }));
    expect(onPropose.mock.calls[0]?.[0]).toMatchObject({ kind: "SOLIDTIME_TIMER_STOP", target: { entryId: "e1", entryStart: running.start } });
    expect(screen.getByRole("button", { name: "Start timer…" })).toBeDisabled();
  });
});

describe("DraftTab", () => {
  it("proposes the chosen drafted rows as one batch", async () => {
    const today = new Date();
    const at = (hour: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate(), hour).toISOString();
    mockBackend([
      { path: `${base}/catalog`, body: catalog },
      {
        path: `${base}/draft`,
        body: {
          draft: {
            day: "x",
            timeZone: "UTC",
            truncated: false,
            rows: [
              { ticketId: 102, title: "Fix flaky test", projectName: "Alpha", activity: [{ at: at(10), what: "Completed Work 0 → 2" }], completedWorkAdded: 2, completedWorkRemoved: 0, alreadyTrackedHours: 0, hours: 2, start: at(8), end: at(10), description: "#102 Fix flaky test", solidtimeProjectId: alpha.id, note: null },
              { ticketId: 103, title: "Crash on save", projectName: "Alpha", activity: [{ at: at(11), what: "Commented" }], completedWorkAdded: 0, completedWorkRemoved: 0, alreadyTrackedHours: 0, hours: null, start: null, end: null, description: "#103 Crash on save", solidtimeProjectId: null, note: null },
            ],
          },
        },
      },
    ]);
    const onPropose = vi.fn();
    renderWithProviders(<DraftTab connection={connection} onPropose={onPropose} isProposing={false} today={localDay()} />);

    const list = await screen.findByRole("list", { name: "Drafted entries" });
    expect(within(list).getByRole("checkbox", { name: "Include #103" })).not.toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Propose 1 entry…" }));

    expect(onPropose.mock.calls[0]?.[0]).toMatchObject({
      kind: "SOLIDTIME_ENTRIES_CREATE",
      params: { entries: [expect.objectContaining({ description: "#102 Fix flaky test", projectId: alpha.id, start: at(8), end: at(10) })] },
    });

    // Ticking the row without hours needs times before it can be proposed.
    await userEvent.click(within(list).getByRole("checkbox", { name: "Include #103" }));
    expect(screen.getByRole("button", { name: "Propose 2 entries…" })).toBeDisabled();
  });
});

describe("SolidtimeConnectionsSection", () => {
  it("connects with an address and token, then shows the connection without the token", async () => {
    const calls = mockBackend([
      { path: "/api/solidtime/connections", body: { connections: [] } },
      { method: "POST", path: "/api/solidtime/connections", status: 201, body: { connection, memberships: [] } },
      { path: "/api/credentials", body: { credentials: [] } },
    ]);
    renderWithProviders(<SolidtimeConnectionsSection />);

    await userEvent.click(await screen.findByRole("button", { name: "Connect Solidtime" }));
    const form = screen.getByRole("form", { name: "Connect Solidtime" });
    await userEvent.type(within(form).getByLabelText("Solidtime address"), "https://time.example.com");
    await userEvent.type(within(form).getByLabelText("API token"), "st-token-0123456789abcdefghij");
    await userEvent.click(within(form).getByRole("button", { name: "Connect" }));

    await waitFor(() => expect(calls.find((call) => call.method === "POST")?.body).toEqual({ baseUrl: "https://time.example.com", token: "st-token-0123456789abcdefghij" }));
  });
});
