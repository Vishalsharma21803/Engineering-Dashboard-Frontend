import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import { pageWindow } from "@/utils/pagination";
import { mockBackend, renderWithProviders } from "@/test/render";
import { chooseOption } from "@/test/select";
import { MyWorkTable, TeamWorkTable } from "../components/work-item-table";
import type { DashboardTriage } from "../hooks/use-triage";
import type { MyWorkPage, TeamWorkPage, WorkItemSummary } from "../types/azure.types";
import { UNTRIAGED } from "../utils/triage";
import { dashboard } from "./fixtures";

const task = dashboard.sections.workItems.data![0]!;
const compliance = dashboard.sections.compliance.data![0]!;
const ticket = (id: number, overrides: Partial<WorkItemSummary> = {}): WorkItemSummary => ({ ...task, id, title: `Ticket ${id}`, ...overrides });

const triage: DashboardTriage = {
  ready: true,
  version: 1,
  savedVersion: 1,
  isLoading: false,
  loadError: null,
  retryLoad: () => undefined,
  isRetryingLoad: false,
  isSaving: false,
  saveError: null,
  clearSaveError: () => undefined,
  projectMarks: [],
  keyFor: () => null,
  resolve: () => UNTRIAGED,
  mark: () => undefined,
  clear: () => undefined,
};

const single = (id: number) => ({ heading: null, section: null, progress: null, latest: null, headingRow: null, rows: [{ workItem: ticket(id), compliance, attention: null }] });

function myWorkPage(page: number, overrides: Partial<MyWorkPage> = {}): MyWorkPage {
  const count = page === 3 ? 7 : 10;
  return {
    items: Array.from({ length: count }, (_, index) => single(page * 100 + index)),
    page,
    pageSize: 10,
    total: 27,
    totalPages: 3,
    groupBy: "status",
    sections: [],
    overview: { sprint: null, counts: { inProgress: 0, todo: 0, resolved: 0, done: 0 }, remainingHours: 0 },
    ticketCount: 27,
    poolTotal: 27,
    hiddenCount: 0,
    showingHidden: false,
    sprint: { mode: "all", inSprint: 0, names: [] },
    closed: { included: false, count: 0 },
    attention: { only: false, count: 0 },
    facets: {
      types: [{ value: "Task", label: "Task", count: 26 }, { value: "Bug", label: "Bug", count: 1 }],
      states: [{ value: "InProgress", label: "In progress", count: 27 }],
      priorities: [{ value: "2", label: "P2", count: 27 }],
      sop: [{ value: "gaps", label: "Any gap", count: 26 }],
    },
    ...overrides,
  };
}

function Location() {
  const location = useLocation();
  return <output aria-label="location">{location.search}</output>;
}

function renderMyWork(route: string, page: MyWorkPage) {
  const calls = mockBackend([{ path: "/api/azure/c/my-work", body: { myWork: page } }]);
  renderWithProviders(
    <>
      <MyWorkTable credentialId="c" projectId={undefined} dashboardToken="t" triage={triage} myId="me" fix={{ onPropose: () => undefined, isProposing: false }} pullRequests={[]} />
      <Location />
    </>,
    { route }
  );
  const requested = () => calls.map((call) => new URL(call.url, "http://x").searchParams);
  return { calls, requested };
}

const rows = () => screen.getAllByRole("link", { name: /^\d+ / }).length;

describe("MyWorkTable", () => {
  // Filters, the sprint view and folded stories are remembered in the browser: each test starts fresh.
  beforeEach(() => window.localStorage.clear());

  it("shows one page of 10 from the server, with page controls", async () => {
    const { requested } = renderMyWork("/", myWorkPage(1));

    expect(await screen.findByText("Page 1 of 3")).toBeInTheDocument();
    expect(rows()).toBe(10);
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Page 1" })).toHaveAttribute("aria-current", "page");
    expect(requested()[0]?.get("page")).toBe("1");

    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(requested().some((params) => params.get("page") === "2")).toBe(true));
    expect(screen.getByLabelText("location")).toHaveTextContent("?page=2");
  });

  it("asks for page 1 when the URL page is tampered, and cleans the URL", async () => {
    const { requested } = renderMyWork("/?page=abc", myWorkPage(1));

    await screen.findByText("Page 1 of 3");
    expect(requested()[0]?.get("page")).toBe("1");
    await waitFor(() => expect(screen.getByLabelText("location")).toHaveTextContent(/^$/));
  });

  it("moves the URL to the page the server served when the page does not exist", async () => {
    // The server clamps ?page=99 to the last page (3).
    renderMyWork("/?page=99", myWorkPage(3));

    expect(await screen.findByText("Page 3 of 3")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("location")).toHaveTextContent("?page=3"));
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("sends filters to the server and goes back to page 1", async () => {
    const { requested } = renderMyWork("/?page=2", myWorkPage(2));
    await screen.findByText("Page 2 of 3");

    // The dropdown filters sit behind one "Filter" button.
    await userEvent.click(screen.getByRole("button", { name: "Filter" }));
    await chooseOption(screen.getByLabelText("Type"), "Bug");
    await waitFor(() => expect(requested().some((params) => params.get("type") === "Bug" && params.get("page") === "1")).toBe(true));

    await userEvent.type(screen.getByLabelText("Search ID, title or tag"), "crash");
    await waitFor(() => expect(requested().some((params) => params.get("search") === "crash")).toBe(true));
  });

  it("hides the page controls when everything fits on one page", async () => {
    renderMyWork("/", myWorkPage(1, { total: 4, totalPages: 1, ticketCount: 4, poolTotal: 4, items: myWorkPage(1).items.slice(0, 4) }));
    await waitFor(() => expect(rows()).toBe(4));
    expect(screen.queryByRole("navigation", { name: "My work pages" })).not.toBeInTheDocument();
  });

  it("shows my tickets under their story, with whose story it is, and only what matters on each row", async () => {
    const story = { id: 50, title: "Checkout flow", type: "User Story", state: "Active", stateCategory: "InProgress" as const, projectName: "Alpha", assignedTo: { id: "other", displayName: "Reviewer Two", uniqueName: null }, changedDate: task.changedDate, readable: true };
    const mine = { ...story, id: 60, title: "Settings revamp", assignedTo: { id: "me", displayName: "Dev Example", uniqueName: null } };
    const passing = { ...compliance, violations: [] };
    renderMyWork(
      "/",
      myWorkPage(1, {
        total: 3,
        totalPages: 1,
        items: [
          // Someone else's story last edited long ago, with my ticket changed just now: the heading shows the group's newest change.
          { heading: { ...story, changedDate: "2026-07-01T00:00:00Z" }, section: null, progress: null, latest: new Date().toISOString(), headingRow: null, rows: [{ workItem: ticket(1), compliance, attention: null }, { workItem: ticket(2, { title: "Passing", blocked: true }), compliance: passing, attention: null }] },
          { heading: mine, section: null, progress: null, latest: null, headingRow: { workItem: ticket(60, { title: "Settings revamp", type: "User Story" }), compliance: passing, attention: null }, rows: [] },
          { heading: { ...story, id: 99, readable: false, title: "" }, section: null, progress: null, latest: null, headingRow: null, rows: [{ workItem: ticket(3), compliance: passing, attention: null }] },
        ],
      })
    );

    const list = await screen.findByRole("list", { name: "My work items" });
    expect(within(list).getByRole("link", { name: "50 Checkout flow" })).toBeInTheDocument();
    expect(within(list).getByText("Assigned to Reviewer Two")).toBeInTheDocument();
    expect(within(list).getByTitle("Last change to your tickets in this story")).toHaveTextContent("just now");
    expect(within(list).getByText("Assigned to you")).toBeInTheDocument();
    expect(within(list).getByText("Story #99 (could not be read from Azure DevOps)")).toBeInTheDocument();
    const under = within(list).getByRole("list", { name: "Under #50" });
    expect(within(under).getAllByRole("link").map((link) => link.textContent)).toEqual(["1 Ticket 1", "2 Passing"]);
    // A missing step is one small "SOP issue" tag only when there is one (its words are for screen readers and the hint); a passing ticket shows nothing.
    expect(within(under).getAllByText("SOP issue")).toHaveLength(1);
    expect(within(under).getAllByText("No original estimate (hours)")).toHaveLength(1);
    expect(within(under).getAllByText("Blocked").length).toBeGreaterThan(0);

    // A story folds away, and stays folded (remembered in this browser).
    await userEvent.click(within(list).getByRole("button", { name: "Collapse #50 Checkout flow" }));
    expect(within(list).queryByRole("list", { name: "Under #50" })).not.toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem("cockpit:collapsed:c") ?? "[]")).toEqual([50]);
  });

  it("shows what a ticket needs as small tags: every SOP gap in one tag, time reminders included", async () => {
    const attention = { category: "SOP" as const, reasons: ["Overdue", "You worked on this today but tracked no time on it", "Priority 2"], suggestedAction: null };
    const twoGaps = { ...compliance, violations: [...compliance.violations, { ...compliance.violations[0]!, ruleId: "story-points" as never, message: "No story points." }] };
    renderMyWork("/", myWorkPage(1, { total: 1, totalPages: 1, items: [{ ...single(7), rows: [{ workItem: ticket(7, { blocked: true }), compliance: twoGaps, attention }] }] }));

    const row = (await screen.findByRole("link", { name: "7 Ticket 7" })).closest("li")!;
    // The two most serious as tags, "+2" for the rest, so the title keeps its room.
    for (const tag of ["Blocked", "Overdue", "+2"]) expect(within(row).getAllByText(tag).length).toBeGreaterThan(0);
    expect(within(row).queryByText("2 SOP issues")).not.toBeInTheDocument();
    // The SOP rules' words are not on the row; screen readers and the hint get them all.
    expect(row).toHaveTextContent("No original estimate (hours). No story points. You worked on this today but tracked no time on it");
  });

  it("shows an SOP gap once, also when its words count something (\"change(s)\")", async () => {
    const gap = { ...compliance.violations[0]!, message: "2 state change(s) without a comment." };
    const attention = { category: "SOP" as const, reasons: ["2 state change(s) without a comment.", "You worked on this today but tracked no time on it"], suggestedAction: null };
    renderMyWork("/", myWorkPage(1, { total: 1, totalPages: 1, items: [{ ...single(8), rows: [{ workItem: ticket(8), compliance: { ...compliance, violations: [gap] }, attention }] }] }));

    const row = (await screen.findByRole("link", { name: "8 Ticket 8" })).closest("li")!;
    expect(within(row).getAllByText("SOP issue").length).toBeGreaterThan(0);
    expect(within(row).getAllByText("No time today").length).toBeGreaterThan(0);
    expect(within(row).queryByText("Needs a look")).not.toBeInTheDocument();
    expect(row.textContent?.match(/2 state changes without a comment/g)).toHaveLength(1);
  });

  it("keeps a closed story's heading free of warnings (they are in the notifications)", async () => {
    const closedStory = { id: 60, title: "Old story", type: "User Story", state: "Closed", stateCategory: "Completed" as const, projectName: "Alpha", assignedTo: { id: "me", displayName: "Dev Example", uniqueName: null }, changedDate: task.changedDate, readable: true };
    renderMyWork(
      "/",
      myWorkPage(1, {
        total: 1,
        totalPages: 1,
        items: [{ heading: closedStory, section: null, progress: null, latest: null, headingRow: { workItem: ticket(60, { title: "Old story", type: "User Story", state: "Closed", stateCategory: "Completed" }), compliance, attention: null }, rows: [] }],
      })
    );
    const list = await screen.findByRole("list", { name: "My work items" });
    expect(within(list).getByRole("link", { name: "60 Old story" })).toBeInTheDocument();
    expect(within(list).queryByText("No original estimate (hours)")).not.toBeInTheDocument();
  });

  it("splits each status section by project when tickets come from several projects, newest first within each", async () => {
    const at = (id: number, section: "inProgress" | "todo", projectName: string) => ({ ...single(id), section, rows: [{ workItem: ticket(id, { projectName }), compliance, attention: null }] });
    renderMyWork(
      "/",
      myWorkPage(1, {
        total: 4,
        totalPages: 1,
        items: [at(1, "inProgress", "Alpha"), at(2, "inProgress", "Beta"), at(3, "inProgress", "Alpha"), at(4, "todo", "Beta")],
      })
    );

    const list = await screen.findByRole("list", { name: "My work items" });
    // In progress: Alpha (1, 3), then Beta (2); To do: Beta again.
    expect(within(list).getAllByRole("heading").map((heading) => heading.textContent)).toEqual(["In progress", "Alpha", "Beta", "To do", "Beta"]);
    expect(within(list).getAllByRole("link", { name: /^\d+ / }).map((link) => link.textContent)).toEqual(["1 Ticket 1", "3 Ticket 3", "2 Ticket 2", "4 Ticket 4"]);
  });

  it("defaults to the current sprint, switches to all sprints and shows recently done tickets on request", async () => {
    const { requested } = renderMyWork("/", myWorkPage(1, { sprint: { mode: "current", inSprint: 4, names: ["Sprint 12"] }, closed: { included: false, count: 2 }, total: 10, totalPages: 1, sections: [{ key: "todo", count: 10 }, { key: "done", count: 2 }] }));

    await userEvent.click(await screen.findByRole("button", { name: "All sprints" }));
    await waitFor(() => expect(requested().some((params) => params.get("sprint") === "all")).toBe(true));
    expect(screen.getByRole("button", { name: "Sprint 12" })).toBeInTheDocument();

    // Done is folded at the end of the list.
    const doneToggle = screen.getByRole("button", { name: /Done recently\s*2\s*Show/ });
    expect(doneToggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(doneToggle);
    await waitFor(() => expect(requested().some((params) => params.get("closed") === "1")).toBe(true));
    // Remembered for the next visit.
    expect(JSON.parse(window.localStorage.getItem("cockpit:my-work-view:c") ?? "{}")).toEqual({ sprint: "all", closed: true });
  });

  it("moves between tickets with J and K", async () => {
    renderMyWork("/", myWorkPage(1));
    await screen.findByText("Page 1 of 3");
    const links = screen.getAllByRole("link", { name: /^\d+ / });
    await userEvent.keyboard("j");
    expect(links[0]).toHaveFocus();
    await userEvent.keyboard("jj");
    expect(links[2]).toHaveFocus();
    await userEvent.keyboard("k");
    expect(links[1]).toHaveFocus();
  });
});

describe("TeamWorkTable", () => {
  it("pages everyone's tickets and filters by assignee on the server", async () => {
    const page: TeamWorkPage = {
      items: [
        { heading: null, latest: null, headingRow: null, rows: [ticket(1, { assignedTo: null })] },
        { heading: null, latest: null, headingRow: null, rows: [ticket(2, { assignedTo: { id: "other", displayName: "Reviewer Two", uniqueName: null } })] },
      ],
      page: 1,
      pageSize: 10,
      total: 12,
      totalPages: 2,
      ticketCount: 12,
      poolTotal: 12,
      facets: { types: [], states: [], priorities: [], assignees: [{ value: "unassigned", label: "Unassigned", count: 1 }] },
    };
    const calls = mockBackend([{ path: "/api/azure/c/projects/Alpha/team-work-items", body: { teamWork: page } }]);
    renderWithProviders(<TeamWorkTable credentialId="c" projectId="Alpha" scope="open" myId="me" />);

    expect(await screen.findByText("Reviewer Two")).toBeInTheDocument();
    expect(screen.getByText("Unassigned")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Team work item pages" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Filter" }));
    await chooseOption(screen.getByLabelText("Assignee"), "unassigned");
    await waitFor(() => expect(calls.some((call) => call.url.includes("assignee=unassigned") && call.url.includes("scope=open"))).toBe(true));
  });
});

describe("pageWindow", () => {
  it("shows first, last and neighbours with gaps", () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(1, 3)).toEqual([1, 2, 3]);
    expect(pageWindow(5, 10)).toEqual([1, null, 4, 5, 6, null, 10]);
    expect(pageWindow(10, 10)).toEqual([1, null, 9, 10]);
  });
});
