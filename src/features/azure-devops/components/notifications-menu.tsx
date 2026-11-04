import { Bell, Check, ClipboardX, Clock, GitPullRequest, RotateCcw, ShieldCheck, XCircle, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/utils/cn";
import { useNotifications, useNotificationStatus, useReadAllNotifications } from "../hooks/use-notifications";
import type { CockpitNotification, NotificationKind, NotificationStatus } from "../types/notification.types";
import { describeError } from "../utils/error-message";
import { formatRelative, pluralizeText } from "../utils/format";

const TABS: Array<{ status: NotificationStatus; label: string; empty: string }> = [
  { status: "UNREAD", label: "Unread", empty: "You're all caught up." },
  { status: "READ", label: "Read", empty: "Nothing read yet. Read ones stay here until they are fixed." },
  { status: "ABANDONED", label: "Abandoned", empty: "Nothing abandoned. Abandon one you will not act on; it stays here until it is fixed." },
];

const KIND_ICONS: Record<NotificationKind, { icon: LucideIcon; tone: string }> = {
  pullRequest: { icon: GitPullRequest, tone: "text-indigo-600" },
  pipeline: { icon: XCircle, tone: "text-rose-600" },
  approvals: { icon: ShieldCheck, tone: "text-indigo-600" },
  timeDay: { icon: Clock, tone: "text-amber-600" },
  timer: { icon: Clock, tone: "text-amber-600" },
  timeUntracked: { icon: Clock, tone: "text-amber-600" },
  closedTicket: { icon: ClipboardX, tone: "text-amber-600" },
};

/** The page Open goes to, or null for a failed pipeline (it scrolls to Pipelines on this page). */
function linkOf(notification: CockpitNotification, credentialId: string): string | null {
  const base = `/azure/${encodeURIComponent(credentialId)}`;
  const { target } = notification;
  const project = encodeURIComponent(target.projectName ?? "");

  switch (target.type) {
    case "workItem":
      return `${base}/projects/${project}/work-items/${target.id}`;
    case "pullRequest":
      return `${base}/projects/${project}/repos/${encodeURIComponent(target.repositoryId ?? "")}/pull-requests/${target.id}`;
    case "time":
      return target.solidtimeCredentialId ? `/time/${encodeURIComponent(target.solidtimeCredentialId)}` : "/time";
    case "actions":
      return `${base}/actions`;
    case "build":
      return null;
  }
}

interface NotificationsMenuProps {
  credentialId: string;
  /** The chosen project's name (its notifications plus those tied to none), or undefined for all. */
  projectName: string | undefined;
  dashboardToken: string;
  onPipelines: () => void;
}

/**
 * Everything that needs me outside the ticket list, in one place. Reading or abandoning one only
 * moves it to its tab; it leaves the list only when its cause is fixed.
 */
export function NotificationsMenu({ credentialId, projectName, dashboardToken, onPipelines }: NotificationsMenuProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<NotificationStatus>("UNREAD");
  const query = useNotifications(credentialId, projectName, dashboardToken);
  const status = useNotificationStatus(credentialId);
  const readAll = useReadAllNotifications(credentialId, projectName);
  const rows = query.data ?? [];
  const count = (value: NotificationStatus) => rows.filter((row) => row.status === value).length;
  const unread = count("UNREAD");
  const shown = rows.filter((row) => row.status === tab);
  const failure = status.error ?? readAll.error;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          status.reset();
          readAll.reset();
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={query.data ? `Notifications, ${unread} unread` : "Notifications"}
          className={cn(
            "inline-flex h-8 items-center gap-2 rounded-lg border px-2.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500",
            unread > 0 ? "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100" : "border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          )}
        >
          <Bell aria-hidden="true" className="size-4" />
          Notifications
          {query.data ? (
            <span className={cn("min-w-5 rounded-full px-1.5 text-center text-xs tabular-nums", unread > 0 ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-500")}>{unread}</span>
          ) : query.error ? (
            <span className="text-xs font-normal text-rose-700">could not load</span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[28rem] max-w-[calc(100vw-2rem)] p-0">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b border-slate-200 px-3 py-2">
          <div
            role="tablist"
            aria-label="Notifications"
            className="flex items-center gap-1"
            onKeyDown={(event) => {
              if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
              const index = TABS.findIndex((option) => option.status === tab);
              const next = TABS[(index + (event.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length]!;
              setTab(next.status);
              document.getElementById(`notifications-tab-${next.status}`)?.focus();
            }}
          >
            {TABS.map((option) => (
              <button
                key={option.status}
                id={`notifications-tab-${option.status}`}
                type="button"
                role="tab"
                aria-selected={tab === option.status}
                aria-controls="notifications-panel"
                tabIndex={tab === option.status ? 0 : -1}
                onClick={() => setTab(option.status)}
                className={cn(
                  "whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
                  tab === option.status ? "bg-slate-100 text-slate-950" : "text-slate-500 hover:text-slate-900"
                )}
              >
                {option.label} <span className="tabular-nums">{count(option.status)}</span>
              </button>
            ))}
          </div>
          {tab === "UNREAD" && unread > 0 ? (
            <button
              type="button"
              onClick={() => readAll.mutate()}
              disabled={readAll.isPending}
              className="inline-flex items-center gap-1 whitespace-nowrap rounded px-1 text-xs font-medium text-indigo-700 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-60"
            >
              <Check aria-hidden="true" className="size-3.5" />
              Mark all as read
            </button>
          ) : null}
        </div>

        {failure ? (
          <p role="alert" className="border-b border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-800">
            Not saved: {describeError(failure, "the change could not be saved").message}
          </p>
        ) : null}

        <div id="notifications-panel" role="tabpanel" aria-labelledby={`notifications-tab-${tab}`} className="max-h-96 overflow-y-auto">
          {query.isLoading || (!query.data && !query.error) ? (
            <p className="px-3 py-6 text-center text-sm text-slate-500">Loading notifications…</p>
          ) : query.error && !query.data ? (
            <div className="px-3 py-6 text-center text-sm text-slate-600">
              <p>Notifications could not be loaded: {describeError(query.error).message}</p>
              <button type="button" onClick={() => void query.refetch()} className="mt-2 text-xs font-medium text-indigo-700 hover:underline">
                Try again
              </button>
            </div>
          ) : shown.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-slate-500">{TABS.find((option) => option.status === tab)!.empty}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {shown.map((notification) => (
                <NotificationRow
                  key={notification.id}
                  notification={notification}
                  credentialId={credentialId}
                  busy={status.isPending && status.variables?.id === notification.id}
                  onStatus={(next) => status.mutate({ id: notification.id, status: next })}
                  onOpen={() => {
                    setOpen(false);
                    if (notification.target.type === "build") onPipelines();
                  }}
                />
              ))}
            </ul>
          )}
        </div>
        <p className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-500">Each one stays until its cause is fixed. Nothing here changes Azure DevOps.</p>
      </PopoverContent>
    </Popover>
  );
}

function NotificationRow({ notification, credentialId, busy, onStatus, onOpen }: { notification: CockpitNotification; credentialId: string; busy: boolean; onStatus: (status: NotificationStatus) => void; onOpen: () => void }) {
  const { icon: Icon, tone } = KIND_ICONS[notification.kind] ?? KIND_ICONS.closedTicket;
  const to = linkOf(notification, credentialId);
  const action = "rounded px-1 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-60";

  return (
    <li className="flex gap-2.5 px-3 py-2.5">
      <Icon aria-hidden="true" className={cn("mt-0.5 size-4 shrink-0", tone)} />
      <div className="min-w-0 flex-1">
        <p className={cn("line-clamp-2 text-sm", notification.status === "UNREAD" ? "font-medium text-slate-950" : "text-slate-700")}>{notification.title}</p>
        {notification.reasons.length > 0 ? <p className="mt-0.5 text-xs text-slate-600">{notification.reasons.map(pluralizeText).join(" · ")}</p> : null}
        <p className="mt-0.5 text-[11px] text-slate-500">
          {[notification.projectName, `since ${formatRelative(notification.firstSeenAt)}`].filter(Boolean).join(" · ")}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          {to ? (
            <Link to={to} onClick={onOpen} aria-label={`Open ${notification.title}`} className={cn(action, "text-indigo-700 hover:underline")}>
              Open
            </Link>
          ) : (
            <button type="button" onClick={onOpen} aria-label={`Show pipelines: ${notification.title}`} className={cn(action, "text-indigo-700 hover:underline")}>
              Show pipelines
            </button>
          )}
          {notification.status === "UNREAD" ? (
            <button type="button" disabled={busy} onClick={() => onStatus("READ")} aria-label={`Mark as read: ${notification.title}`} className={cn(action, "text-slate-600 hover:text-slate-950")}>
              Mark as read
            </button>
          ) : (
            <button type="button" disabled={busy} onClick={() => onStatus("UNREAD")} aria-label={`${notification.status === "ABANDONED" ? "Restore" : "Mark as unread"}: ${notification.title}`} className={cn(action, "inline-flex items-center gap-1 text-slate-600 hover:text-slate-950")}>
              {notification.status === "ABANDONED" ? <RotateCcw aria-hidden="true" className="size-3" /> : null}
              {notification.status === "ABANDONED" ? "Restore" : "Mark as unread"}
            </button>
          )}
          {notification.status !== "ABANDONED" ? (
            <button type="button" disabled={busy} onClick={() => onStatus("ABANDONED")} aria-label={`Abandon: ${notification.title}`} className={cn(action, "text-slate-500 hover:text-rose-700")}>
              Abandon
            </button>
          ) : null}
        </div>
      </div>
    </li>
  );
}
