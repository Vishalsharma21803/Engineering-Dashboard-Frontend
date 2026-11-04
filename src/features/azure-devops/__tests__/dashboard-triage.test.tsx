import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/test/render";
import { DashboardPage } from "../pages/dashboard-page";
import type { MyWorkPage } from "../types/azure.types";
import type { TriageMark } from "../types/triage.types";
import { buildSignalIndex, isHidden, resolveTriage, workItemKey } from "../utils/triage";
import { CREDENTIAL_ID, attentionFor, dashboard, dashboardListBody, pageOf } from "./fixtures";

const base = `/api/azure/${CREDENTIAL_ID}`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** What the server's /my-work answers for these marks (it applies the same triage rules). */
function myWorkFor(marks: TriageMark[], hidden: boolean): MyWorkPage {
  const byKey = new Map(marks.map((item) => [item.itemKey, item]));
  const signals = buildSignalIndex(dashboard.recommendations, dashboard.sections.pipelines.data ?? []);
  const items = dashboard.sections.workItems.data ?? [];
  const isHiddenItem = (id: number, projectName: string) =>
    isHidden(resolveTriage(byKey, workItemKey(id), projectName, signals.get(workItemKey(id))?.signals ?? []).state);
  const hiddenCount = items.filter((item) => isHiddenItem(item.id, item.projectName)).length;
  const showing = hidden && hiddenCount > 0;
  const pool = items.filter((item) => isHiddenItem(item.id, item.projectName) === showing);
  // The header counts every open ticket that is not snoozed or abandoned.
  const visible = items.filter((item) => !isHiddenItem(item.id, item.projectName));
  const count = (category: string) => visible.filter((item) => item.stateCategory === category).length;
  const compliance = new Map((dashboard.sections.compliance.data ?? []).map((result) => [result.workItemId, result]));

  return {
    items: pool.map((workItem) => ({ heading: null, section: null, progress: null, latest: null, headingRow: null, rows: [{ workItem, compliance: compliance.get(workItem.id) ?? null, attention: attentionFor(workItem.id) }] })),
    page: 1,
    pageSize: 10,
    total: pool.length,
    totalPages: 1,
    groupBy: "status",
    sections: [],
    overview: { sprint: null, counts: { inProgress: count("InProgress"), todo: count("Proposed"), resolved: count("Resolved"), done: 0 }, remainingHours: 0 },
    ticketCount: pool.length,
    poolTotal: pool.length,
    hiddenCount,
    showingHidden: showing,
    sprint: { mode: "all", inSprint: 0, names: [] },
    closed: { included: false, count: 0 },
    attention: { only: false, count: 0 },
    facets: { types: [], states: [], priorities: [], sop: [] },
  };
}

let nextId = 0;

function mark(itemKey: string, status: TriageMark["status"], extra: Partial<TriageMark> = {}): TriageMark {
  return {
    id: `00000000-0000-4000-8000-${String(++nextId).padStart(12, "0")}`,
    credentialId: CREDENTIAL_ID,
    itemKey,
    status,
    snoozedUntil: status === "SNOOZED" ? new Date(Date.now() + 86_400_000).toISOString() : null,
    signals: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...extra,
  };
}

/** Backend stub with a stateful /api/triage, so refetches after a change see it. */
function setup(initial: TriageMark[] = []) {
  let marks = [...initial];
  const writes: Array<{ method: string; url: string; body: unknown }> = [];

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      const path = url.split("?")[0] ?? url;

      if (method !== "GET") writes.push({ method, url, body });

      if (path === `${base}/dashboard`) return json({ dashboard });
      if (path === `${base}/my-work`) return json({ myWork: myWorkFor(marks, new URL(url, "http://x").searchParams.get("hidden") === "1") });
      if (path === "/api/actions") return json({ actions: pageOf([]) });
      const list = dashboardListBody(url, marks);
      if (list) return json(list);
      if (path === "/api/triage" && method === "GET") return json({ marks });
      if (path === "/api/triage" && method === "PUT") {
        const saved = mark(body.itemKey, body.status, { signals: body.signals, snoozedUntil: body.snoozedUntil ?? null });
        marks = [saved, ...marks.filter((item) => item.itemKey !== body.itemKey)];
        return json({ message: "Triage saved", mark: saved });
      }
      if (path.startsWith("/api/triage/") && method === "DELETE") {
        marks = marks.filter((item) => !path.endsWith(item.id));
        return json({ message: "Triage cleared" });
      }
      if (path === `${base}/capabilities`) return json({ message: "not needed" }, 404);

      return json({ message: `No mock for ${method} ${url}` }, 500);
    })
  );

  renderWithProviders(<DashboardPage />, { path: "/azure/:credentialId", route: `/azure/${CREDENTIAL_ID}` });
  return writes;
}

const myWork = () => screen.getByRole("heading", { name: /^My work/ }).closest("div")!.parentElement!.parentElement!;

describe("dashboard triage", () => {
  it("abandons a ticket in Cockpit only and lets it be restored", async () => {
    const writes = setup();

    await userEvent.click(await screen.findByRole("button", { name: "Triage #103 Crash on save" }));
    await userEvent.click(screen.getByRole("button", { name: "Abandon · hide until restored" }));

    await waitFor(() => expect(screen.queryByRole("link", { name: "103 Crash on save" })).not.toBeInTheDocument());
    expect(writes).toEqual([
      {
        method: "PUT",
        url: "/api/triage",
        body: {
          credentialId: CREDENTIAL_ID,
          itemKey: "wi:103",
          status: "ABANDONED",
          signals: ["SOP:NOT_CLOSED_AFTER_MERGE"],
        },
      },
    ]);
    expect(writes.some((write) => write.url.startsWith("/api/azure") || write.url.startsWith("/api/actions"))).toBe(false);

    await userEvent.click(await within(myWork()).findByRole("button", { name: "Show snoozed & abandoned (1)" }));
    expect(await within(myWork()).findByText("Abandoned")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Triage #103 Crash on save" }));
    await userEvent.click(screen.getByRole("button", { name: "Restore to my list" }));

    await waitFor(() => expect(writes.at(-1)?.method).toBe("DELETE"));
    // The last hidden item came back, so the list returns to the normal view by itself.
    expect(await screen.findByRole("link", { name: "103 Crash on save" })).toBeInTheDocument();
    expect(within(myWork()).queryByRole("button", { name: /snoozed & abandoned/ })).not.toBeInTheDocument();
  });

  it("snoozes with an end date and hides the item from counts", async () => {
    const writes = setup();

    await userEvent.click(await screen.findByRole("button", { name: "Triage #102 Fix flaky test" }));
    await userEvent.click(screen.getByRole("button", { name: "Snooze · tomorrow" }));

    await waitFor(() => expect(screen.queryByRole("link", { name: "102 Fix flaky test" })).not.toBeInTheDocument());
    const put = writes.find((write) => write.method === "PUT")?.body as { snoozedUntil: string } | undefined;
    expect(put).toMatchObject({ itemKey: "wi:102", status: "SNOOZED" });
    expect(Date.parse(put?.snoozedUntil ?? "")).toBeGreaterThan(Date.now());

    // Snoozed tickets leave the counts.
    await waitFor(() => expect(screen.getByRole("region", { name: "Sprint overview" })).toHaveTextContent("1 ticket assigned to you"));
  });

  it("keeps acknowledged items visible but resurfaces them when a new problem appears", async () => {
    setup([mark("wi:103", "ACKNOWLEDGED", { signals: [] })]);

    const link = await screen.findByRole("link", { name: "103 Crash on save" });
    expect(within(link.closest("li")!).getByText("New since acknowledged")).toBeInTheDocument();
  });

  it("keeps acknowledged tickets in My work with their mark", async () => {
    setup([mark("wi:103", "ACKNOWLEDGED", { signals: ["SOP:NOT_CLOSED_AFTER_MERGE"] })]);

    const link = await within(await screen.findByRole("list", { name: "My work items" })).findByRole("link", { name: "103 Crash on save" });
    expect(within(link.closest("li")!).getByText("Acknowledged")).toBeInTheDocument();
  });

  it("hides a whole abandoned project and restores it from the project strip", async () => {
    const projectMark = mark("project:alpha", "ABANDONED");
    const writes = setup([projectMark]);

    expect(await screen.findByText("All your open tickets are snoozed or abandoned.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "103 Crash on save" })).not.toBeInTheDocument();
    expect(screen.getByText("Triaged projects").parentElement).toHaveTextContent("Alpha · abandoned");

    await userEvent.click(screen.getByRole("button", { name: "Restore project Alpha" }));

    expect(await screen.findByRole("link", { name: "103 Crash on save" })).toBeInTheDocument();
    expect(writes).toEqual([{ method: "DELETE", url: `/api/triage/${projectMark.id}`, body: null }]);
  });

  it("shows everything with a warning when marks cannot be loaded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input).split("?")[0];
        if (path === `${base}/dashboard`) return json({ dashboard });
        if (path === `${base}/my-work`) return json({ myWork: myWorkFor([], false) });
        if (path === "/api/actions") return json({ actions: pageOf([]) });
        const list = dashboardListBody(String(input), []);
        if (list) return json(list);
        return json({ message: "Credential not found" }, 404);
      })
    );
    renderWithProviders(<DashboardPage />, { path: "/azure/:credentialId", route: `/azure/${CREDENTIAL_ID}` });

    expect(await screen.findByText(/could not be loaded \(.+\), so everything is shown/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
    // My work arrives from its own (server-paged) request.
    expect(await screen.findByRole("link", { name: "103 Crash on save" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Triage #103 Crash on save" })).toBeDisabled();
  });
});
