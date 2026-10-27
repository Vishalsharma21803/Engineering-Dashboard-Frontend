import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { mockBackend, renderWithProviders } from "@/test/render";
import { SolidtimeConnectionsSection } from "../components/solidtime-connections-section";
import { TicketTimerButton } from "../components/ticket-timer-button";
import { DraftTab } from "../components/draft-tab";
import { projectNameKey, solidtimeProjectFor } from "../utils/project-map";
import { localDay, zonedClock, zonedInstant } from "../utils/time";
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
  const day = localDay(undefined, "UTC");
  const at = (time: string) => `${day}T${time}:00.000Z`;
  const row = (overrides: Record<string, unknown>) => ({
    projectName: "Alpha",
    type: "Task",
    state: "Active",
    originalEstimate: null,
    completedWork: null,
    remainingWork: null,
    completedWorkAdded: 0,
    completedWorkRemoved: 0,
    alreadyTrackedHours: 0,
    hours: null,
    hoursSource: null,
    start: null,
    end: null,
    solidtimeProjectId: null,
    projectSource: null,
    projectMatches: [],
    note: null,
    ...overrides,
  });
  const draft = {
    day,
    timeZone: "UTC",
    targetHours: 8,
    trackedHours: 0.5,
    busy: [{ start: at("00:00"), end: at("00:30") }],
    truncated: false,
    rows: [
      row({ ticketId: 102, title: "Fix flaky test", activity: [{ at: at("03:00"), what: "Completed Work 0 → 2" }], completedWorkAdded: 2, hours: 2, hoursSource: "completed-work", anchor: at("03:00"), start: at("01:00"), end: at("03:00"), description: "#102 Fix flaky test", solidtimeProjectId: alpha.id, projectSource: "ticket" }),
      row({ ticketId: 103, title: "Crash on save", activity: [{ at: at("06:00"), what: "Commented" }], anchor: at("06:00"), description: "#103 Crash on save" }),
      row({ ticketId: 104, title: "Already logged", activity: [{ at: at("07:00"), what: "Completed Work 0 → 1" }], completedWorkAdded: 1, alreadyTrackedHours: 1, hours: 0, hoursSource: "completed-work", anchor: at("07:00"), description: "#104 Already logged", note: "Already tracked in Solidtime." }),
      row({ ticketId: 105, title: "Unticked", activity: [{ at: at("08:00"), what: "Commented" }], anchor: at("08:00"), description: "#105 Unticked", projectMatches: ["Beta", "BETA-"] }),
    ],
  };
  const render = (routes: Parameters<typeof mockBackend>[0] = []) => {
    const calls = mockBackend([{ path: `${base}/catalog`, body: catalog }, { path: `${base}/draft`, body: { draft } }, ...routes]);
    const onPropose = vi.fn();
    renderWithProviders(<DraftTab connection={connection} onPropose={onPropose} isProposing={false} today={day} />);
    return { calls, onPropose };
  };

  it("pre-fills rows from Completed Work and proposes the chosen ones as one batch", async () => {
    const { onPropose } = render();
    const list = await screen.findByRole("list", { name: "Drafted entries" });
    expect(within(list).getByRole("checkbox", { name: "Include #103" })).not.toBeChecked();
    expect(within(list).getByLabelText("Start for #102")).toHaveValue("01:00");
    expect(within(list).getByLabelText("Hours for #102")).toHaveValue(2);
    expect(within(list).getByLabelText("End for #102")).toHaveValue("03:00");
    expect(within(list).getByText("Used for this ticket before")).toBeInTheDocument();
    expect(within(list).getAllByText("No match: choose a project")).toHaveLength(2);
    expect(within(list).getByText("2 projects match (Beta, BETA-): choose one")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Propose 1 entry…" }));

    expect(onPropose.mock.calls[0]?.[0]).toMatchObject({
      kind: "SOLIDTIME_ENTRIES_CREATE",
      params: { entries: [expect.objectContaining({ description: "#102 Fix flaky test", projectId: alpha.id, start: at("01:00"), end: at("03:00") })] },
    });
  });

  it("fills the times when I enter hours, and blocks rows that are not complete", async () => {
    render();
    const list = await screen.findByRole("list", { name: "Drafted entries" });
    await userEvent.click(within(list).getByRole("checkbox", { name: "Include #103" }));
    expect(screen.getByRole("button", { name: "Propose 2 entries…" })).toBeDisabled();
    expect(within(list).getByText("Enter the hours (up to 24).")).toBeInTheDocument();

    await userEvent.type(within(list).getByLabelText("Hours for #103"), "1.5");
    // Ends at my last change on the ticket.
    expect(within(list).getByLabelText("Start for #103")).toHaveValue("04:30");
    expect(within(list).getByLabelText("End for #103")).toHaveValue("06:00");
    expect(within(list).getByText("Entered by you")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Propose 2 entries…" })).toBeEnabled();
  });

  it("asks the AI only about rows without hours, counting the planned ones, and fills them in", async () => {
    const { calls } = render([
      {
        method: "POST",
        path: `${base}/draft/estimate`,
        body: { estimate: { day, availableHours: 5.5, model: "claude-haiku-5-5", costUsd: 0.0012, estimates: [{ ticketId: 103, hours: 1.25, confidence: "medium", reason: "One comment and a long gap." , start: at("04:45"), end: at("06:00") }] } },
      },
    ]);
    const drafted = await screen.findByRole("list", { name: "Drafted entries" });
    expect(within(drafted).getByText("Already in Solidtime")).toBeInTheDocument();
    // Ticked then unticked by me: left out of the AI request.
    await userEvent.click(within(drafted).getByRole("checkbox", { name: "Include #105" }));
    await userEvent.click(within(drafted).getByRole("checkbox", { name: "Include #105" }));
    await userEvent.click(screen.getByRole("button", { name: "Suggest hours with AI" }));

    const list = screen.getByRole("list", { name: "Drafted entries" });
    expect(await within(list).findByText("AI: One comment and a long gap.")).toBeInTheDocument();
    expect(calls.find((call) => call.method === "POST")?.body).toEqual({ day, ticketIds: [103], plannedHours: 2, planned: [{ start: at("01:00"), end: at("03:00") }] });
    expect(within(list).getByRole("checkbox", { name: "Include #103" })).toBeChecked();
    expect(within(list).getByLabelText("Start for #103")).toHaveValue("04:45");
    expect(within(list).getByText("AI · medium confidence")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("claude-haiku-5-5");
    expect(screen.getByRole("button", { name: "Propose 2 entries…" })).toBeEnabled();
  });

  it("points to the AI settings when no model is set up", async () => {
    render([{ method: "POST", path: `${base}/draft/estimate`, status: 422, body: { message: "Choose an AI provider and model on the Credentials page first", reason: "AI_NOT_CONFIGURED" } }]);
    await screen.findByRole("list", { name: "Drafted entries" });
    await userEvent.click(screen.getByRole("button", { name: "Suggest hours with AI" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Choose an AI provider");
    expect(screen.getByRole("link", { name: "Open AI settings" })).toHaveAttribute("href", "/credentials");
  });
});

describe("matching project names", () => {
  it("ignores case and separators, needs the full name, and never guesses between two matches", () => {
    expect(projectNameKey(" Engineer – Cockpit_v2.0 ")).toBe("engineercockpitv20");
    const projects = [alpha, { ...alpha, id: "p-ec", name: "Engineer-Cockpit" }, { ...alpha, id: "p-sifars", name: "Sifars Engineer Cockpit" }];
    expect(solidtimeProjectFor(connection, projects, "engineer cockpit")).toBe("p-ec");
    expect(solidtimeProjectFor(connection, projects, "Cockpit")).toBeNull();
    expect(solidtimeProjectFor(connection, [...projects, { ...alpha, id: "p-ec2", name: "ENGINEER_COCKPIT" }], "Engineer Cockpit")).toBeNull();
    expect(solidtimeProjectFor({ ...connection, projectMap: { "engineer cockpit": "p-sifars" } }, projects, "Engineer Cockpit")).toBe("p-sifars");
  });
});

describe("times in the Solidtime time zone", () => {
  it("converts a day and clock to an instant and back, across daylight saving", () => {
    expect(zonedInstant("2026-03-29", "03:30", "Europe/Berlin")).toBe("2026-03-29T01:30:00.000Z");
    expect(zonedInstant("2026-01-15", "09:00", "Asia/Kolkata")).toBe("2026-01-15T03:30:00.000Z");
    expect(zonedClock("2026-01-15T03:30:00.000Z", "Asia/Kolkata")).toBe("09:00");
    expect(zonedInstant("2026-01-15", "25:00", "UTC")).toBeNull();
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
