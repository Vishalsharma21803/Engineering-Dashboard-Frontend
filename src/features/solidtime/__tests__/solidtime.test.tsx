import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AuthContext } from "@/features/auth/context/auth-context";
import { mockBackend, renderWithProviders } from "@/test/render";
import { SolidtimeConnectionsSection } from "../components/solidtime-connections-section";
import { TicketTimerButton } from "../components/ticket-timer-button";
import { TimerBar } from "../components/timer-bar";
import { TimesheetTab } from "../components/timesheet-tab";
import { DraftTab } from "../components/draft-tab";
import { TicketTimeLookup } from "../components/ticket-time-lookup";
import { TicketTimePanel } from "../components/ticket-time-panel";
import { ReportsTab } from "../components/reports-tab";
import { TimePage } from "../pages/time-page";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { projectNameKey, solidtimeProjectFor } from "../utils/project-map";
import { localDay, shiftDay, weekStart, zonedClock, zonedInstant } from "../utils/time";
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
    remainingWorkLowered: 0,
    alreadyTrackedHours: 0,
    hours: null,
    hoursSource: null,
    hoursBasis: null,
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
      row({ ticketId: 102, title: "Fix flaky test", activity: [{ at: at("03:00"), what: "Completed Work 0 → 2" }], completedWorkAdded: 2, hours: 2, hoursSource: "completed-work", hoursBasis: "Completed Work raised by 2 h", anchor: at("03:00"), start: at("01:00"), end: at("03:00"), description: "#102 Fix flaky test", solidtimeProjectId: alpha.id, projectSource: "ticket" }),
      row({ ticketId: 103, title: "Crash on save", activity: [{ at: at("06:00"), what: "Commented" }], hours: 1, hoursSource: "activity", hoursBasis: "1 change at 06:00", anchor: at("06:00"), start: at("05:00"), end: at("06:00"), description: "#103 Crash on save" }),
      row({ ticketId: 104, title: "Already logged", activity: [{ at: at("07:00"), what: "Completed Work 0 → 1" }], completedWorkAdded: 1, alreadyTrackedHours: 1, hours: 0, hoursSource: "completed-work", hoursBasis: "Completed Work raised by 1 h", anchor: at("07:00"), description: "#104 Already logged", note: "Already tracked in Solidtime." }),
      row({ ticketId: 105, title: "Lowered", activity: [{ at: at("08:00"), what: "Remaining Work 4 → 2.5" }], remainingWorkLowered: 1.5, hours: 1.5, hoursSource: "remaining-work", hoursBasis: "Remaining Work lowered by 1.5 h", anchor: at("08:00"), start: at("06:30"), end: at("08:00"), description: "#105 Lowered", projectMatches: ["Beta", "BETA-"] }),
    ],
  };
  const render = (routes: Parameters<typeof mockBackend>[0] = []) => {
    const calls = mockBackend([{ path: `${base}/catalog`, body: catalog }, { path: `${base}/draft`, body: { draft } }, ...routes]);
    const onPropose = vi.fn();
    renderWithProviders(<DraftTab connection={connection} onPropose={onPropose} isProposing={false} today={day} />);
    return { calls, onPropose };
  };
  const checked = (ticketId: number, hours: number, ruleHours: number, reason = "Checked.") => ({ ticketId, ruleHours, hours, confidence: "medium", reason, start: null, end: null });

  it("pre-fills rows from the evidence, says where the hours come from, and proposes the chosen ones as one batch", async () => {
    const { onPropose } = render();
    const list = await screen.findByRole("list", { name: "Drafted entries" });
    expect(within(list).getByLabelText("Start for #102")).toHaveValue("01:00");
    expect(within(list).getByLabelText("Hours for #102")).toHaveValue(2);
    expect(within(list).getByLabelText("End for #102")).toHaveValue("03:00");
    expect(within(list).getByRole("checkbox", { name: "Include #103" })).toBeChecked();
    expect(within(list).getByLabelText("Hours for #103")).toHaveValue(1);
    expect(within(list).getByText("Hours from: 1 change at 06:00.")).toBeInTheDocument();
    expect(within(list).getByText("From your activity")).toBeInTheDocument();
    expect(within(list).getByText("Remaining Work −1.5 h")).toBeInTheDocument();
    expect(within(list).getByText("Hours from: Completed Work raised by 1 h, minus 1 h already in Solidtime.")).toBeInTheDocument();
    expect(within(list).getByText("Used for this ticket before")).toBeInTheDocument();
    expect(within(list).getAllByText("No match: choose a project")).toHaveLength(2);
    expect(within(list).getByText("2 projects match (Beta, BETA-): choose one")).toBeInTheDocument();
    // 8 h target − 0.5 h tracked − 4.5 h drafted: shown, not spread over the tickets.
    expect(screen.getByText(/of your 8 h target is not on any ticket/)).toHaveTextContent("3 h of your 8 h target is not on any ticket");

    await userEvent.click(within(list).getByRole("checkbox", { name: "Include #103" }));
    await userEvent.click(within(list).getByRole("checkbox", { name: "Include #105" }));
    await userEvent.click(screen.getByRole("button", { name: "Propose 1 entry…" }));
    expect(onPropose.mock.calls[0]?.[0]).toMatchObject({
      kind: "SOLIDTIME_ENTRIES_CREATE",
      params: { entries: [expect.objectContaining({ description: "#102 Fix flaky test", projectId: alpha.id, start: at("01:00"), end: at("03:00") })] },
    });
  });

  it("fills the times when I enter hours, and blocks rows that are not complete", async () => {
    render();
    const list = await screen.findByRole("list", { name: "Drafted entries" });
    await userEvent.clear(within(list).getByLabelText("Hours for #103"));
    expect(screen.getByRole("button", { name: "Propose 3 entries…" })).toBeDisabled();
    expect(within(list).getByText("Enter the hours (up to 24).")).toBeInTheDocument();

    await userEvent.type(within(list).getByLabelText("Hours for #103"), "1.5");
    // Ends at my last change on the ticket.
    expect(within(list).getByLabelText("Start for #103")).toHaveValue("04:30");
    expect(within(list).getByLabelText("End for #103")).toHaveValue("06:00");
    expect(within(list).getByText("Entered by you")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Propose 3 entries…" })).toBeEnabled();
  });

  it("asks the AI to check only evidence hours I did not change, and shows what it changed", async () => {
    const { calls } = render([
      { method: "POST", path: `${base}/draft/estimate`, body: { estimate: { day, model: "claude-haiku-5-5", costUsd: 0.0012, estimates: [{ ...checked(103, 1.25, 1, "One comment after a long gap."), start: at("04:45"), end: at("06:00") }] } } },
    ]);
    const drafted = await screen.findByRole("list", { name: "Drafted entries" });
    expect(within(drafted).getByText("Already in Solidtime")).toBeInTheDocument();
    // Unticked by me: left out of the AI request.
    await userEvent.click(within(drafted).getByRole("checkbox", { name: "Include #105" }));
    await userEvent.click(screen.getByRole("button", { name: "Check hours with AI" }));

    const list = screen.getByRole("list", { name: "Drafted entries" });
    expect(await within(list).findByText("AI: One comment after a long gap. (the rules said 1 h)")).toBeInTheDocument();
    expect(calls.find((call) => call.method === "POST")?.body).toEqual({ day, ticketIds: [103], planned: [{ start: at("01:00"), end: at("03:00") }] });
    expect(within(list).getByLabelText("Hours for #103")).toHaveValue(1.25);
    expect(within(list).getByLabelText("Start for #103")).toHaveValue("04:45");
    expect(within(list).getByText("AI · medium confidence")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("AI (claude-haiku-5-5) checked 1 ticket: kept 0, changed #103.");
    expect(screen.getByRole("button", { name: "Propose 2 entries…" })).toBeEnabled();
  });

  it("says which tickets the AI kept and which it did not answer for", async () => {
    render([{ method: "POST", path: `${base}/draft/estimate`, body: { estimate: { day, model: "m", costUsd: 0, estimates: [checked(103, 1, 1, "Fits the activity.")] } } }]);
    const list = await screen.findByRole("list", { name: "Drafted entries" });
    await userEvent.click(screen.getByRole("button", { name: "Check hours with AI" }));
    expect(await screen.findByRole("status")).toHaveTextContent("AI (m) checked 1 ticket: kept 1.");
    expect(screen.getByRole("status")).toHaveTextContent("No result for #105 (no answer, or no longer needs checking): their hours are unchanged.");
    expect(within(list).getByText("AI: Fits the activity.")).toBeInTheDocument();
    expect(within(list).getByLabelText("Hours for #105")).toHaveValue(1.5);
  });

  it("says why the AI button is off instead of doing nothing", async () => {
    render();
    const list = await screen.findByRole("list", { name: "Drafted entries" });
    await userEvent.clear(within(list).getByLabelText("Hours for #103"));
    await userEvent.type(within(list).getByLabelText("Hours for #103"), "1");
    await userEvent.click(within(list).getByRole("checkbox", { name: "Include #105" }));
    const button = screen.getByRole("button", { name: "Check hours with AI" });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(/Nothing to check/);
  });

  it("keeps unsaved edits through a sign-out and brings them back on the same day", async () => {
    window.sessionStorage.clear();
    const signedIn = { user: { id: "u1", name: "Ada", email: "ada@example.com" }, isAuthenticated: true, isLoading: false };
    const withUser = () => (
      <AuthContext.Provider value={signedIn}>
        <DraftTab connection={connection} onPropose={vi.fn()} isProposing={false} today={day} />
      </AuthContext.Provider>
    );
    mockBackend([{ path: `${base}/catalog`, body: catalog }, { path: `${base}/draft`, body: { draft } }]);
    const first = renderWithProviders(withUser());
    const list = await screen.findByRole("list", { name: "Drafted entries" });
    await userEvent.clear(within(list).getByLabelText("Description for #102"));
    await userEvent.type(within(list).getByLabelText("Description for #102"), "Pairing on the flaky test");
    // The session expires: the redirect unmounts the tab right after typing.
    first.unmount();

    renderWithProviders(withUser());
    const restored = await screen.findByRole("list", { name: "Drafted entries" });
    expect(within(restored).getByLabelText("Description for #102")).toHaveValue("Pairing on the flaky test");
    expect(screen.getByText("Restored your unsaved edits from before you were signed out.")).toBeInTheDocument();

    await userEvent.click(await screen.findByRole("button", { name: "Discard" }));
    expect(within(restored).getByLabelText("Description for #102")).toHaveValue("#102 Fix flaky test");
    window.sessionStorage.clear();
  });

  it("points to the AI settings when no model is set up", async () => {
    render([{ method: "POST", path: `${base}/draft/estimate`, status: 422, body: { message: "Choose an AI provider and model on the Credentials page first", reason: "AI_NOT_CONFIGURED" } }]);
    await screen.findByRole("list", { name: "Drafted entries" });
    await userEvent.click(screen.getByRole("button", { name: "Check hours with AI" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Choose an AI provider");
    expect(screen.getByRole("link", { name: "Open AI settings" })).toHaveAttribute("href", "/credentials");
  });

  const renderDraft = (served: Record<string, unknown>) => {
    mockBackend([{ path: `${base}/catalog`, body: catalog }, { path: `${base}/draft`, body: { draft: { ...draft, ...served } } }]);
    renderWithProviders(<DraftTab connection={connection} onPropose={vi.fn()} isProposing={false} today={day} />);
  };

  it("says when more tickets were changed since the day than were checked", async () => {
    renderDraft({ truncated: true, truncatedReason: "scan" });
    expect(await screen.findByText("More than 200 tickets you changed since this day were found; only the 200 most recent were checked.")).toBeInTheDocument();
  });

  it("says when only the 50 most recently changed tickets are shown", async () => {
    renderDraft({ truncated: true, truncatedReason: "rows" });
    expect(await screen.findByText("Only the 50 most recently changed tickets are shown.")).toBeInTheDocument();
  });

  it("shows every warning about reads that failed or were cut", async () => {
    renderDraft({ warnings: ["Solidtime projects could not be read; choose projects yourself.", "Comments on #103 could not be read; its activity may be incomplete."] });
    expect(await screen.findByText("Solidtime projects could not be read; choose projects yourself.")).toBeInTheDocument();
    expect(screen.getByText("Comments on #103 could not be read; its activity may be incomplete.")).toBeInTheDocument();
  });

  it("shows no notice for a complete draft", async () => {
    renderDraft({ truncatedReason: null, warnings: [] });
    await screen.findByRole("list", { name: "Drafted entries" });
    expect(screen.queryByText(/only the 200 most recent|Only the 50 tickets/)).not.toBeInTheDocument();
  });
});

describe("TimesheetTab", () => {
  const day = localDay(undefined, "UTC");
  const entry = { id: "e1", start: `${day}T09:00:00Z`, end: `${day}T11:00:00Z`, seconds: 7200, description: "#101 Implement login", projectId: null, projectName: null, taskId: null, tags: [], billable: false, running: false, tickets: [{ id: 101, title: "Implement login" }] };
  const page = <T,>(items: T[]) => ({ items, total: items.length, page: 1, pageSize: 10, totalPages: 1 });
  const sheet = (from: string, to: string) => ({
    timesheet: {
      from,
      to,
      timeZone: "UTC",
      totalSeconds: 7200,
      days: Array.from({ length: 7 }, (_, index) => ({ day: shiftDay(from, index), seconds: shiftDay(from, index) === day ? 7200 : 0 })),
      byTicket: page([{ ticketId: 101, title: "Implement login", seconds: 7200 }]),
      unlinkedSeconds: 0,
      entries: page([entry]),
      ticketsChecked: true,
      truncated: false,
    },
  });

  it("lists the picked day's entries, offers the whole week, and shows totals per ticket in their own view", async () => {
    const from = weekStart(day);
    const calls = mockBackend([{ path: `${base}/timesheet`, body: sheet(from, shiftDay(from, 6)) }, { path: `${base}/catalog`, body: catalog }]);
    renderWithProviders(<TimesheetTab connection={connection} onPropose={vi.fn()} isProposing={false} today={day} />);

    expect(await screen.findByRole("heading", { name: /^Entries on / })).toBeInTheDocument();
    expect(calls.find((call) => call.url.includes("/timesheet"))?.url).toContain(`day=${day}`);
    expect(within(screen.getByRole("list", { name: "Time entries" })).getByText("09:00 – 11:00")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Whole week" }));
    expect(await screen.findByRole("heading", { name: "Entries this week" })).toBeInTheDocument();
    expect(calls.at(-1)?.url).not.toContain("day=");

    await userEvent.click(screen.getByRole("button", { name: /^By ticket/ }));
    expect(within(screen.getByRole("list", { name: "Time per ticket" })).getByText("2h 00m")).toBeInTheDocument();
  });

  it("edits an entry in the Solidtime time zone", async () => {
    const from = weekStart(day);
    mockBackend([{ path: `${base}/timesheet`, body: sheet(from, shiftDay(from, 6)) }, { path: `${base}/catalog`, body: catalog }]);
    renderWithProviders(<TimesheetTab connection={connection} onPropose={vi.fn()} isProposing={false} today={day} />);

    await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
    const form = screen.getByRole("form", { name: "Edit time entry" });
    expect(within(form).getByLabelText("Start")).toHaveValue(`${day}T09:00`);
    expect(within(form).getByText("Times are in UTC, your Solidtime time zone.")).toBeInTheDocument();
  });
});

describe("timer errors", () => {
  it("says the timer is unavailable, with the reason, instead of offering Start", async () => {
    mockBackend([
      { path: `${base}/timer`, status: 424, body: { message: "Solidtime rejected the API token", reason: "SOLIDTIME_TOKEN_INVALID" } },
      { path: `${base}/catalog`, body: catalog },
    ]);
    renderWithProviders(<TicketTimerButton connection={connection} ticket={{ id: 101, title: "Implement login", projectName: "Alpha" }} onPropose={vi.fn()} />);
    const button = await screen.findByRole("button", { name: "Timer unavailable: Solidtime rejected the API token" });
    expect(button).toBeDisabled();
  });

  it("does not offer Start while the Solidtime projects cannot be loaded (the mapped project would be lost)", async () => {
    mockBackend([
      { path: `${base}/timer`, body: { timer: null } },
      { path: `${base}/catalog`, status: 502, body: { message: "Solidtime could not be reached", reason: "SOLIDTIME_UPSTREAM_ERROR" } },
    ]);
    renderWithProviders(<TicketTimerButton connection={connection} ticket={{ id: 101, title: "Implement login", projectName: "Alpha" }} onPropose={vi.fn()} />);
    // A 5xx is retried once (about a second) before it counts.
    const button = await screen.findByRole("button", { name: "Timer unavailable: Solidtime projects could not be loaded: Solidtime could not be reached" }, { timeout: 4_000 });
    expect(button).toBeDisabled();
  });

  it("shows why the timer could not be read on the Time page, with a retry", async () => {
    mockBackend([
      { path: `${base}/timer`, status: 503, body: { message: "Solidtime is rate limiting requests", reason: "SOLIDTIME_RATE_LIMITED" } },
      { path: `${base}/catalog`, body: catalog },
    ]);
    renderWithProviders(<TimerBar connection={connection} onPropose={vi.fn()} isProposing={false} />);
    expect(await screen.findByRole("alert", {}, { timeout: 5_000 })).toHaveTextContent("Your Solidtime timer could not be read: Solidtime is rate limiting requests");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start timer…" })).toBeDisabled();
  });
});

describe("ticket time", () => {
  const ticket = { id: 101, title: "Implement login", type: "Task", state: "Active", projectName: "Alpha", originalEstimate: 8, completedWork: 2, remainingWork: 6 };
  const response = (basis: "team" | "mine") => ({
    time: { ticketId: 101, mySeconds: 3 * 3600, teamSeconds: basis === "team" ? 5 * 3600 : null, people: null, running: false },
    ticket,
    comparison: { trackedHours: basis === "team" ? 5 : 3, estimateHours: 8, overEstimate: false, suggested: { completedWork: basis === "team" ? 5 : 3, remainingWork: basis === "team" ? 3 : 5 }, completedInSync: false, remainingInSync: false, inSync: false, basis },
  });

  it("looks a ticket up by id on the Time page and proposes Azure's time fields from the total", async () => {
    const calls = mockBackend([{ path: `${base}/tickets/101/time`, body: response("team") }]);
    const onPropose = vi.fn();
    renderWithProviders(<TicketTimeLookup connection={connection} onPropose={onPropose} isProposing={false} />);

    await userEvent.type(screen.getByLabelText("Ticket ID"), "#101");
    await userEvent.click(screen.getByRole("button", { name: "Check" }));
    expect(await screen.findByRole("link", { name: "#101 Implement login" })).toBeInTheDocument();
    expect(screen.getByText("Total in Solidtime")).toBeInTheDocument();
    expect(screen.getByText("5h 00m")).toBeInTheDocument();
    expect(calls[0]?.url).toContain("/tickets/101/time?refresh=true");
    expect(screen.queryByRole("note")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Update Azure to 5 h…" }));
    expect(onPropose).toHaveBeenCalledWith({
      credentialId: connection.azureCredentialId,
      kind: "WORK_ITEM_UPDATE_FIELDS",
      source: "USER",
      target: { projectId: "Alpha", workItemId: 101 },
      params: { completedWork: 5, remainingWork: 3 },
    });
  });

  it("warns when only my own time is known, and the ticket page reads nothing until I click Check", async () => {
    const calls = mockBackend([
      { path: "/api/solidtime/connections", body: { connections: [connection] } },
      { path: `${base}/timer`, body: { timer: null } },
      { path: `${base}/catalog`, body: catalog },
      { path: `${base}/tickets/101/time`, body: response("mine") },
    ]);
    renderWithProviders(<TicketTimePanel azureCredentialId={connection.azureCredentialId!} ticket={{ id: 101, title: "Implement login", projectName: "Alpha" }} onPropose={vi.fn()} isProposing={false} />);

    await userEvent.click(await screen.findByRole("button", { name: "Check time in Solidtime" }));
    expect(await screen.findByRole("note")).toHaveTextContent("Based on your own time only");
    expect(screen.getByText("Total (your time)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update Azure to 3 h…" })).toBeEnabled();
    expect(calls.filter((call) => call.url.includes("/tickets/101/time"))).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Check again" })).toBeInTheDocument();
  });

  it("disables the update when Azure's Completed Work already equals the total, even if Remaining differs", async () => {
    const same = response("team");
    same.ticket = { ...ticket, completedWork: 5, remainingWork: 1 };
    same.comparison = { ...same.comparison, completedInSync: true };
    mockBackend([{ path: `${base}/tickets/101/time`, body: same }]);
    renderWithProviders(<TicketTimeLookup connection={connection} onPropose={vi.fn()} isProposing={false} />);
    await userEvent.type(screen.getByLabelText("Ticket ID"), "101");
    await userEvent.click(screen.getByRole("button", { name: "Check" }));
    expect(await screen.findByRole("button", { name: "Azure already up to date" })).toBeDisabled();
    expect(screen.getByText("Azure Completed Work already matches Solidtime (5 h).")).toBeInTheDocument();
  });

  it("treats time within a minute as the same: 40 min (0.67 h) matches Azure's 0.66 h", async () => {
    const forty = response("team");
    forty.time = { ...forty.time, teamSeconds: 40 * 60 };
    forty.ticket = { ...ticket, completedWork: 0.66 };
    forty.comparison = { ...forty.comparison, trackedHours: 0.67, suggested: { completedWork: 0.67, remainingWork: 7.33 }, completedInSync: true };
    mockBackend([{ path: `${base}/tickets/101/time`, body: forty }]);
    renderWithProviders(<TicketTimeLookup connection={connection} onPropose={vi.fn()} isProposing={false} />);
    await userEvent.type(screen.getByLabelText("Ticket ID"), "101");
    await userEvent.click(screen.getByRole("button", { name: "Check" }));
    expect(await screen.findByRole("button", { name: "Azure already up to date" })).toBeDisabled();
  });
});

describe("ThemeToggle", () => {
  it("switches between light and dark and remembers the choice", async () => {
    document.documentElement.dataset.theme = "light";
    renderWithProviders(<ThemeToggle />);
    await userEvent.click(screen.getByRole("button", { name: "Switch to dark mode" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(window.localStorage.getItem("relay-theme")).toBe("dark");
    await userEvent.click(screen.getByRole("button", { name: "Switch to light mode" }));
    expect(document.documentElement.dataset.theme).toBe("light");
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

describe("Solidtime on the Credentials page", () => {
  it("points an empty Solidtime section to the Add credential page", async () => {
    mockBackend([{ path: "/api/solidtime/connections", body: { connections: [] } }]);
    renderWithProviders(<SolidtimeConnectionsSection onNotice={vi.fn()} />);
    expect(await screen.findByRole("link", { name: "Add one" })).toHaveAttribute("href", "/credentials/new?platform=solidtime");
    expect(screen.queryByRole("button", { name: /Connect/ })).not.toBeInTheDocument();
  });
});

describe("load failures are not empty states", () => {
  it("shows an error with a retry on the ticket page, not \"Connect Solidtime\", when connections fail to load", async () => {
    mockBackend([{ path: "/api/solidtime/connections", status: 500, body: { message: "Database unavailable" } }]);
    renderWithProviders(<TicketTimePanel azureCredentialId={connection.azureCredentialId!} ticket={{ id: 101, title: "Implement login", projectName: "Alpha" }} onPropose={vi.fn()} isProposing={false} />);

    // The connections query retries once before giving up.
    const alert = await screen.findByRole("alert", {}, { timeout: 4000 });
    expect(screen.queryByText(/Connect Solidtime/)).not.toBeInTheDocument();

    mockBackend([
      { path: "/api/solidtime/connections", body: { connections: [connection] } },
      { path: `${base}/timer`, body: { timer: null } },
      { path: `${base}/catalog`, body: catalog },
    ]);
    await userEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("button", { name: "Check time in Solidtime" })).toBeInTheDocument();
  });

  it("shows an error on the Credentials page, not \"No Solidtime account connected\", when connections fail to load", async () => {
    mockBackend([{ path: "/api/solidtime/connections", status: 500, body: { message: "Database unavailable" } }]);
    renderWithProviders(<SolidtimeConnectionsSection onNotice={vi.fn()} />);

    expect(await screen.findByRole("button", { name: "Try again" }, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.queryByText(/No Solidtime account connected/)).not.toBeInTheDocument();
  });

  it("rebuilds the draft from fresh data", async () => {
    const day = localDay(undefined, "UTC");
    const draft = { day, timeZone: "UTC", targetHours: 8, trackedHours: 0, busy: [], truncated: false, rows: [] };
    const calls = mockBackend([
      { path: `${base}/catalog`, body: catalog },
      { path: `${base}/draft`, body: { draft } },
    ]);
    renderWithProviders(<DraftTab connection={connection} onPropose={vi.fn()} isProposing={false} today={day} />);

    await screen.findByText(/nothing to draft/);
    expect(calls.filter((call) => call.url.includes("/draft"))).toHaveLength(1);
    expect(calls.find((call) => call.url.includes("/draft"))?.url).not.toContain("refresh");

    await userEvent.click(screen.getByRole("button", { name: "Rebuild" }));
    await waitFor(() => expect(calls.filter((call) => call.url.includes("/draft"))).toHaveLength(2));
    expect(calls.filter((call) => call.url.includes("/draft"))[1]?.url).toContain(`/draft?day=${day}&refresh=true`);
  });
});

describe("TimePage time zone", () => {
  it("waits for the Solidtime time zone, and says when the browser's is used instead, with a retry", async () => {
    mockBackend([
      { path: "/api/solidtime/connections", body: { connections: [connection] } },
      { path: `${base}/profile`, status: 500, body: { message: "Solidtime unavailable" } },
      { path: `${base}/timer`, body: { timer: null } },
      { path: `${base}/catalog`, body: catalog },
    ]);
    renderWithProviders(<TimePage />, { path: "/time/:credentialId", route: `/time/${connection.credentialId}` });

    // The profile query retries once before giving up; the tabs wait meanwhile.
    expect(await screen.findByRole("tabpanel")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ Add entry" })).not.toBeInTheDocument();

    const notice = await screen.findByText(/time zone could not be loaded/, {}, { timeout: 4000 });
    expect(notice).toHaveTextContent(Intl.DateTimeFormat().resolvedOptions().timeZone);
    expect(within(notice).getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Add entry" })).toBeInTheDocument();
  });
});

describe("ReportsTab", () => {
  const today = "2026-10-29";
  const page = { items: [], page: 1, pageSize: 10, total: 0, totalPages: 0 };
  const report = {
    from: shiftDay(today, -29),
    to: today,
    team: false,
    totals: { tickets: 3, trackedHours: 12, estimateHours: 10, withinEstimate: 2, compliance: 0.67, overEstimate: 1 },
    byTicket: {
      ...page,
      total: 2,
      totalPages: 1,
      items: [
        { ticketId: 101, title: "Implement login", type: "Task", projectName: "Alpha", periodHours: 3, trackedHours: 6, estimateHours: 4, withinEstimate: false, overByHours: 2 },
        { ticketId: 102, title: "Fix flaky test", type: "Task", projectName: "Alpha", periodHours: 1, trackedHours: 3, estimateHours: 3, withinEstimate: true, overByHours: 0 },
      ],
    },
    byPerson: page,
    byType: page,
    ticketsWithoutEstimate: 0,
  };

  it("never offers a start after the end, and loads the range picked in the calendar", async () => {
    const calls = mockBackend([{ path: `${base}/reports/accuracy`, body: { accuracy: report } }]);
    renderWithProviders(<ReportsTab connection={connection} today={today} />);

    expect(await screen.findByText("Tickets compared")).toBeInTheDocument();
    const reads = calls.length;

    // The From calendar opens on the current start (September); the day after the end date cannot be picked.
    await userEvent.click(screen.getByLabelText("From"));
    await userEvent.click(screen.getByRole("button", { name: /next month/i }));
    const dayButton = (date: string) => document.querySelector<HTMLButtonElement>(`[data-day="${new Date(`${date}T00:00`).toLocaleDateString()}"]`)!;
    expect(dayButton(shiftDay(today, 1))).toBeDisabled();
    expect(calls).toHaveLength(reads);

    await userEvent.click(dayButton(shiftDay(today, -6)));
    expect(screen.getByLabelText("From")).toHaveAttribute("data-value", shiftDay(today, -6));
    expect(await screen.findByText("Tickets compared")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows compliance as tickets within their estimate, and exports the chosen range as CSV", async () => {
    const calls = mockBackend([
      { path: `${base}/reports/accuracy`, body: { accuracy: report } },
      { path: `${base}/reports/time.csv`, body: "csv" },
    ]);
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:csv"), revokeObjectURL: vi.fn() }));
    renderWithProviders(<ReportsTab connection={connection} today={today} />);

    expect(await screen.findByText("67%")).toBeInTheDocument();
    expect(screen.getByText("2 of 3 within estimate")).toBeInTheDocument();
    const tickets = screen.getByRole("table", { name: "Tickets compared" });
    expect(within(tickets).getByText("Over by 2 h")).toBeInTheDocument();
    expect(within(tickets).getByText("Within estimate")).toBeInTheDocument();

    // This week by default; Last week is Monday 19 to Sunday 25 October.
    expect(screen.getByText(/The file covers Mon, Oct 26, 2026 to Thu, Oct 29, 2026, both days included\./)).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("Export range"));
    await userEvent.click(screen.getByRole("button", { name: "Last week" }));
    await userEvent.click(screen.getByRole("button", { name: "Download CSV" }));
    await waitFor(() => expect(calls.some((call) => call.url.includes("/reports/time.csv?from=2026-10-19&to=2026-10-25"))).toBe(true));
  });
});
