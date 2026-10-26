import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { pageWindow } from "@/utils/pagination";
import { mockBackend, renderWithProviders } from "@/test/render";
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
  isLoading: false,
  loadError: null,
  isSaving: false,
  saveError: null,
  clearSaveError: () => undefined,
  projectMarks: [],
  keyFor: () => null,
  resolve: () => UNTRIAGED,
  mark: () => undefined,
  clear: () => undefined,
};

function myWorkPage(page: number, overrides: Partial<MyWorkPage> = {}): MyWorkPage {
  const count = page === 3 ? 7 : 10;
  return {
    items: Array.from({ length: count }, (_, index) => ({ workItem: ticket(page * 100 + index), compliance })),
    page,
    pageSize: 10,
    total: 27,
    totalPages: 3,
    poolTotal: 27,
    hiddenCount: 0,
    showingHidden: false,
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
      <MyWorkTable credentialId="c" projectId={undefined} dashboardToken="t" aiChecks={new Map()} triage={triage} />
      <Location />
    </>,
    { route }
  );
  const requested = () => calls.map((call) => new URL(call.url, "http://x").searchParams);
  return { calls, requested };
}

const rows = () => within(screen.getByRole("table")).getAllByRole("row").length - 1;

describe("MyWorkTable", () => {
  it("shows one page of 10 from the server, with page controls", async () => {
    const { requested } = renderMyWork("/", myWorkPage(1));

    expect(await screen.findByText("Showing 1–10 of 27")).toBeInTheDocument();
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

    await screen.findByText("Showing 1–10 of 27");
    expect(requested()[0]?.get("page")).toBe("1");
    await waitFor(() => expect(screen.getByLabelText("location")).toHaveTextContent(/^$/));
  });

  it("moves the URL to the page the server served when the page does not exist", async () => {
    // The server clamps ?page=99 to the last page (3).
    renderMyWork("/?page=99", myWorkPage(3));

    expect(await screen.findByText("Showing 21–27 of 27")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("location")).toHaveTextContent("?page=3"));
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("sends filters to the server and goes back to page 1", async () => {
    const { requested } = renderMyWork("/?page=2", myWorkPage(2));
    await screen.findByText("Showing 11–20 of 27");

    await userEvent.selectOptions(screen.getByLabelText("Type"), "Bug");
    await waitFor(() => expect(requested().some((params) => params.get("type") === "Bug" && params.get("page") === "1")).toBe(true));

    await userEvent.type(screen.getByLabelText("Search ID, title or tag"), "crash");
    await waitFor(() => expect(requested().some((params) => params.get("search") === "crash")).toBe(true));
  });

  it("hides the page controls when everything fits on one page", async () => {
    renderMyWork("/", myWorkPage(1, { total: 4, totalPages: 1, items: myWorkPage(1).items.slice(0, 4) }));
    await waitFor(() => expect(rows()).toBe(4));
    expect(screen.queryByRole("navigation", { name: "My work pages" })).not.toBeInTheDocument();
  });
});

describe("TeamWorkTable", () => {
  it("pages everyone's tickets and filters by assignee on the server", async () => {
    const page: TeamWorkPage = {
      items: [ticket(1, { assignedTo: null }), ticket(2, { assignedTo: { id: "other", displayName: "Reviewer Two", uniqueName: null } })],
      page: 1,
      pageSize: 10,
      total: 12,
      totalPages: 2,
      poolTotal: 12,
      facets: { types: [], states: [], priorities: [], assignees: [{ value: "unassigned", label: "Unassigned", count: 1 }] },
    };
    const calls = mockBackend([{ path: "/api/azure/c/projects/Alpha/team-work-items", body: { teamWork: page } }]);
    renderWithProviders(<TeamWorkTable credentialId="c" projectId="Alpha" scope="open" myId="me" />);

    expect(await screen.findByText("Reviewer Two")).toBeInTheDocument();
    expect(screen.getByText("Unassigned")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Team work item pages" })).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Assignee"), "unassigned");
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
