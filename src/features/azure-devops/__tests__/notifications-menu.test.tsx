import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { bumpSessionEpoch } from "@/lib/api-client";
import { dismissGlobalNotice, getGlobalNotices } from "@/lib/global-errors";
import { renderWithProviders } from "@/test/render";
import { NotificationsMenu } from "../components/notifications-menu";
import { useNotificationStatus } from "../hooks/use-notifications";
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
function setup(
  served: CockpitNotification[] = rows,
  options: { failList?: boolean; failSave?: boolean | ((id: string) => boolean); failListAfter?: number } = {}
) {
  let reads = 0;
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
      if (method === "GET") {
        reads += 1;
        const fails = options.failList || (options.failListAfter !== undefined && reads > options.failListAfter);
        return fails ? json({ message: "Database unavailable" }, 400) : json({ notifications: state });
      }
      const target = url.split("?")[0]!.split("/").pop()!;
      if (typeof options.failSave === "function" ? options.failSave(target) : options.failSave) return json({ message: "Database unavailable" }, 400);
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
    expect(screen.getByRole("tab", { name: "Dismissed 1" })).toBeInTheDocument();
  });

  it("marks one as read: it moves to Read at once and is saved, never removed", async () => {
    const { calls } = setup();
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Mark as read: Only 7.9 h tracked on Mon, Nov 2" }));

    expect(await screen.findByRole("tab", { name: "Read 2" })).toBeInTheDocument();
    expect(within(screen.getByRole("tabpanel")).getAllByRole("listitem")).toHaveLength(1);
    expect(saved(calls)).toEqual([["PATCH", "/api/notifications/b", { status: "READ" }]]);
  });

  it("marks all as read, dismisses, and restores", async () => {
    const { calls } = setup();
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Mark all as read" }));
    expect(await screen.findByText("You're all caught up.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: /^Read/ }));
    await userEvent.click(screen.getByRole("button", { name: "Dismiss: alpha-ci #2026.501 failed" }));
    await userEvent.click(screen.getByRole("tab", { name: /^Dismissed/ }));
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

  it("says so when a reload fails while a list is shown, instead of presenting the old list as current", async () => {
    // First read works; the reload after "Mark as read" (same key, list on screen) fails.
    setup(rows, { failListAfter: 1 });
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Mark as read: Only 7.9 h tracked on Mon, Nov 2" }));
    await userEvent.click(screen.getByRole("button", { name: "Mark as read: #21793 Simplify exported time reports" }));

    const alert = await screen.findByText(/Could not refresh: Database unavailable/);
    expect(alert).toHaveTextContent("Showing the last loaded list.");
    expect(screen.queryByText("You're all caught up.")).not.toBeInTheDocument();
    // The count on the button is not shown as if it were current.
    expect(screen.getByRole("button", { name: /^Notifications, could not refresh/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Notifications, \d+ unread$/ })).not.toBeInTheDocument();
  });

  it("keeps an earlier failed save visible when a later one succeeds, naming the item", async () => {
    setup(rows, { failSave: (id) => id === "a" });
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Mark as read: #21793 Simplify exported time reports" }));
    await userEvent.click(screen.getByRole("button", { name: "Mark as read: Only 7.9 h tracked on Mon, Nov 2" }));

    expect(await screen.findByText(/Not saved: #21793 Simplify exported time reports: Database unavailable/)).toBeInTheDocument();
    expect(await screen.findByRole("tab", { name: "Read 2" })).toBeInTheDocument();
  });

  it("keeps a failed save visible after the popover is closed and opened again, until dismissed", async () => {
    setup(rows, { failSave: true });
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Mark as read: Only 7.9 h tracked on Mon, Nov 2" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("tabpanel")).not.toBeInTheDocument();

    // The button says so while the popover is closed.
    const button = await screen.findByRole("button", { name: "Notifications, 2 unread, 1 change not saved" });
    await userEvent.click(button);
    expect(screen.getByRole("alert")).toHaveTextContent("Not saved: Only 7.9 h tracked on Mon, Nov 2: Database unavailable");

    await userEvent.click(screen.getByRole("button", { name: "Dismiss: changes not saved" }));
    expect(screen.queryByText(/^Not saved/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Notifications, 2 unread" })).toBeInTheDocument();
  });

  it("drops a failure once the same change is saved after all", async () => {
    let attempts = 0;
    setup(rows, { failSave: (id) => id === "b" && ++attempts === 1 });
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Mark as read: Only 7.9 h tracked on Mon, Nov 2" }));
    expect(await screen.findByText(/^Not saved: Only 7.9 h/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Mark as read: Only 7.9 h tracked on Mon, Nov 2" }));
    expect(await screen.findByRole("tab", { name: "Read 2" })).toBeInTheDocument();
    await vi.waitFor(() => expect(screen.queryByText(/^Not saved/)).not.toBeInTheDocument());
  });

  it("drops a failed Mark as read once Mark all as read saved that row, keeping other failures", async () => {
    setup(rows, { failSave: (id) => id === "b" || id === "c" });
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Mark as read: Only 7.9 h tracked on Mon, Nov 2" }));
    expect(await screen.findByText(/^Not saved: Only 7.9 h/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: /^Read/ }));
    await userEvent.click(screen.getByRole("button", { name: "Dismiss: alpha-ci #2026.501 failed" }));
    expect(await screen.findByText(/^Not saved: alpha-ci/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: /^Unread/ }));
    await userEvent.click(screen.getByRole("button", { name: "Mark all as read" }));

    expect(await screen.findByText("You're all caught up.")).toBeInTheDocument();
    await vi.waitFor(() => expect(screen.queryByText(/^Not saved: Only 7.9 h/)).not.toBeInTheDocument());
    expect(screen.getByText(/^Not saved: alpha-ci/)).toBeInTheDocument();
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

describe("useNotificationStatus", () => {
  const list = ["notifications", "c", "all", "t"];
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  /** Saves wait until the test answers them, in order. */
  function held() {
    const waiting: Array<(response: Response) => void> = [];
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => waiting.push(resolve))));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    client.setQueryData(list, rows.map((row) => ({ ...row })));
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    return {
      client,
      wrapper,
      answer: async (response: Response) => {
        await act(async () => {
          waiting.shift()?.(response);
        });
      },
    };
  }

  const statusOf = (client: QueryClient, id: string) => client.getQueryData<CockpitNotification[]>(list)?.find((row) => row.id === id)?.status;

  afterEach(() => {
    for (const notice of getGlobalNotices()) dismissGlobalNotice(notice.id);
  });

  it("puts back only the row whose save failed, not another row saving at the same time", async () => {
    const backend = held();
    const onFailure = vi.fn();
    const { result } = renderHook(() => useNotificationStatus("c", onFailure), { wrapper: backend.wrapper });

    act(() => result.current.mutate({ id: "a", status: "READ" }));
    await vi.waitFor(() => expect(statusOf(backend.client, "a")).toBe("READ"));
    act(() => result.current.mutate({ id: "b", status: "ABANDONED" }));
    await vi.waitFor(() => expect(statusOf(backend.client, "b")).toBe("ABANDONED"));

    await backend.answer(json({ message: "Database unavailable" }, 400));

    await vi.waitFor(() => expect(onFailure).toHaveBeenCalledOnce());
    expect(statusOf(backend.client, "a")).toBe("UNREAD");
    expect(statusOf(backend.client, "b")).toBe("ABANDONED");
  });

  it("reports a save that fails after the menu is gone as a toast", async () => {
    const backend = held();
    const onFailure = vi.fn();
    const { result, unmount } = renderHook(() => useNotificationStatus("c", onFailure), { wrapper: backend.wrapper });

    act(() => result.current.mutate({ id: "a", status: "READ" }));
    await vi.waitFor(() => expect(statusOf(backend.client, "a")).toBe("READ"));
    unmount();
    await backend.answer(json({ message: "Database unavailable" }, 400));

    await vi.waitFor(() => expect(getGlobalNotices()).toHaveLength(1));
    expect(getGlobalNotices()[0]).toMatchObject({ tone: "error", title: "Notification change not saved", message: expect.stringContaining("#21793 Simplify exported time reports") });
    expect(onFailure).not.toHaveBeenCalled();
    expect(statusOf(backend.client, "a")).toBe("UNREAD");
  });

  it("does not report a failure to the next account when the session changed while saving", async () => {
    const backend = held();
    const onFailure = vi.fn();
    const { result, unmount } = renderHook(() => useNotificationStatus("c", onFailure), { wrapper: backend.wrapper });

    act(() => result.current.mutate({ id: "a", status: "READ" }));
    await vi.waitFor(() => expect(statusOf(backend.client, "a")).toBe("READ"));
    unmount();
    bumpSessionEpoch();
    await backend.answer(json({ message: "Database unavailable" }, 400));

    await vi.waitFor(() => expect(statusOf(backend.client, "a")).toBe("UNREAD"));
    expect(getGlobalNotices()).toEqual([]);
    expect(onFailure).not.toHaveBeenCalled();
  });
});
