import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/test/render";
import { NotificationsMenu } from "../components/notifications-menu";
import type { CockpitNotification } from "../types/notification.types";

const at = "2026-11-03T08:00:00Z";
const notification = (overrides: Partial<CockpitNotification>): CockpitNotification => ({
  id: "n",
  key: "k",
  kind: "timeDay",
  projectName: null,
  title: "",
  reasons: [],
  target: { type: "time", projectName: null, id: 0 },
  status: "UNREAD",
  firstSeenAt: at,
  updatedAt: at,
  ...overrides,
});

const rows = [
  notification({ id: "a", key: "closed:wi:21793", kind: "closedTicket", projectName: "automations", title: "#21793 Simplify exported time reports", reasons: ["Story has no story points", "No time tracked"], target: { type: "workItem", projectName: "automations", id: 21793 } }),
  notification({ id: "b", key: "time:day:2026-11-02", title: "Only 7.9 h tracked on Mon, Nov 2", reasons: ["Your target is 8 h a working day"], target: { type: "time", projectName: null, id: 0, solidtimeCredentialId: "st-1" } }),
  notification({ id: "c", key: "pipeline:Alpha:10:refs/heads/main", kind: "pipeline", projectName: "Alpha", title: "alpha-ci #2026.501 failed", status: "READ", target: { type: "build", projectName: "Alpha", id: 501 } }),
  notification({ id: "d", key: "pr:r:3", kind: "pullRequest", projectName: "Alpha", title: "PR 3 Refactor settings", status: "ABANDONED", target: { type: "pullRequest", projectName: "Alpha", id: 3, repositoryId: "r" } }),
];

/** A small stateful backend: saved statuses come back on the next read, like the real one. */
function setup(served: CockpitNotification[] = rows, options: { failList?: boolean; failSave?: boolean } = {}) {
  const state = served.map((row) => ({ ...row }));
  const calls: Array<{ method: string; url: string; body: unknown }> = [];
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push({ method, url, body });
      if (method === "GET") return options.failList ? json({ message: "Database unavailable" }, 400) : json({ notifications: state });
      if (options.failSave) return json({ message: "Database unavailable" }, 400);
      if (method === "POST") {
        for (const row of state) if (row.status === "UNREAD") row.status = "READ";
        return json({ count: 0 });
      }
      const row = state.find((candidate) => url.endsWith(`/${candidate.id}`))!;
      row.status = body.status;
      return json({ notification: row });
    })
  );
  const onPipelines = vi.fn();
  renderWithProviders(<NotificationsMenu credentialId="c" projectName={undefined} dashboardToken="t" onPipelines={onPipelines} />);
  return { calls, onPipelines };
}

const open = async () => userEvent.click(await screen.findByRole("button", { name: /^Notifications, \d+ unread$/ }));
const saved = (calls: Array<{ method: string; url: string; body: unknown }>) => calls.filter((call) => call.method !== "GET").map((call) => [call.method, call.url.replace(/\?.*$/, ""), call.body]);

describe("NotificationsMenu", () => {
  it("counts unread ones on the button and lists them with every reason and where Open goes", async () => {
    setup();
    expect(await screen.findByRole("button", { name: "Notifications, 2 unread" })).toBeInTheDocument();
    await open();

    const panel = screen.getByRole("tabpanel", { name: /^Unread/ });
    expect(within(panel).getAllByRole("listitem")).toHaveLength(2);
    expect(within(panel).getByText("Story has no story points · No time tracked")).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: "Open #21793 Simplify exported time reports" })).toHaveAttribute("href", "/azure/c/projects/automations/work-items/21793");
    expect(within(panel).getByRole("link", { name: "Open Only 7.9 h tracked on Mon, Nov 2" })).toHaveAttribute("href", "/time/st-1");
    expect(screen.getByRole("tab", { name: "Read 1" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Abandoned 1" })).toBeInTheDocument();
  });

  it("marks one as read: it moves to Read at once and is saved, never removed", async () => {
    const { calls } = setup();
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Mark as read: Only 7.9 h tracked on Mon, Nov 2" }));

    expect(await screen.findByRole("tab", { name: "Read 2" })).toBeInTheDocument();
    expect(within(screen.getByRole("tabpanel")).getAllByRole("listitem")).toHaveLength(1);
    expect(saved(calls)).toEqual([["PATCH", "/api/notifications/b", { status: "READ" }]]);
  });

  it("marks all as read, abandons, and restores", async () => {
    const { calls } = setup();
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Mark all as read" }));
    expect(await screen.findByText("You're all caught up.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: /^Read/ }));
    await userEvent.click(screen.getByRole("button", { name: "Abandon: alpha-ci #2026.501 failed" }));
    await userEvent.click(screen.getByRole("tab", { name: /^Abandoned/ }));
    await userEvent.click(screen.getByRole("button", { name: "Restore: PR 3 Refactor settings" }));

    expect(saved(calls)).toEqual([
      ["POST", "/api/notifications/read-all", { credentialId: "c" }],
      ["PATCH", "/api/notifications/c", { status: "ABANDONED" }],
      ["PATCH", "/api/notifications/d", { status: "UNREAD" }],
    ]);
  });

  it("opens Pipelines on this page for a failed pipeline", async () => {
    const { onPipelines } = setup();
    await open();
    await userEvent.click(screen.getByRole("tab", { name: /^Read/ }));
    await userEvent.click(screen.getByRole("button", { name: "Show pipelines: alpha-ci #2026.501 failed" }));
    expect(onPipelines).toHaveBeenCalledOnce();
    expect(screen.queryByRole("tabpanel")).not.toBeInTheDocument();
  });

  it("says so when a change could not be saved, and puts it back", async () => {
    setup(rows, { failSave: true });
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Mark as read: Only 7.9 h tracked on Mon, Nov 2" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/^Not saved/);
    expect(within(screen.getByRole("tabpanel")).getAllByRole("listitem")).toHaveLength(2);
  });

  it("says so when they could not be loaded", async () => {
    setup(rows, { failList: true });
    expect(await screen.findByText("could not load")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Notifications" }));
    expect(await screen.findByText(/Notifications could not be loaded/)).toBeInTheDocument();
  });

  it("is calm when nothing needs me", async () => {
    setup([]);
    await open();
    expect(screen.getByText("You're all caught up.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark all as read" })).not.toBeInTheDocument();
  });
});
