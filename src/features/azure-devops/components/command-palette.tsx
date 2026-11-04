import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, GitPullRequest, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { StatusNotice } from "@/components/ui/status-notice";
import { cn } from "@/utils/cn";
import { useDashboard } from "../hooks/use-dashboard";
import type { Dashboard } from "../types/azure.types";
import { StatusIcon } from "./status-icon";

interface Entry {
  id: string;
  label: string;
  detail: string;
  to: string;
  icon: ReactNode;
  /** Lower-cased text the search matches. */
  haystack: string;
}

function isTyping(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return Boolean(element && (element.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName)));
}

interface CommandPaletteProps {
  credentialId: string;
  /** The page links (My work, Project overview, Approvals…), with their G-key. */
  pages: Array<{ label: string; to: string; key: string }>;
}

/**
 * ⌘K / Ctrl+K: jump to any of my tickets, pull requests or pages. It searches
 * what the dashboard already loaded, so it opens instantly; opened before any
 * dashboard was loaded (e.g. on a project page), it loads My work's dashboard itself.
 * G then a letter jumps to a page (G M My work, G O overview, G A approvals…).
 */
export function CommandPalette({ credentialId, pages }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const listRef = useRef<HTMLUListElement>(null);
  // Closing always starts the next search fresh.
  const setVisible = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setQuery("");
      setActive(0);
    }
  };
  // Read by the key listener, so it is attached once (a G pressed just before a re-render still counts).
  const openRef = useRef(open);
  const pagesRef = useRef(pages);
  useEffect(() => {
    openRef.current = open;
    pagesRef.current = pages;
  }, [open, pages]);

  useEffect(() => {
    let awaitingG = 0;
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        // Not on top of another dialog (e.g. an approval being reviewed).
        if (!openRef.current && document.querySelector("[role=dialog]")) return;
        event.preventDefault();
        if (openRef.current) {
          setOpen(false);
          setQuery("");
          setActive(0);
        } else {
          setOpen(true);
        }
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target) || document.querySelector("[role=dialog]")) return;
      if (event.key === "g") {
        awaitingG = Date.now();
        return;
      }
      if (Date.now() - awaitingG < 1000) {
        const page = pagesRef.current.find((candidate) => candidate.key === event.key.toLowerCase());
        awaitingG = 0;
        if (page) {
          event.preventDefault();
          navigate(page.to);
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [navigate]);

  const cachedDashboards = () =>
    queryClient.getQueriesData<Dashboard>({ queryKey: ["azure", credentialId, "dashboard"] }).map(([, data]) => data).filter((data): data is Dashboard => Boolean(data));
  // Nothing cached to search: load the dashboard (all projects) while the palette is open.
  const fallback = useDashboard(credentialId, undefined, { enabled: open && cachedDashboards().length === 0 });

  const entries = useMemo<Entry[]>(() => {
    if (!open) return [];
    const base = `/azure/${encodeURIComponent(credentialId)}`;
    const dashboards = queryClient.getQueriesData<Dashboard>({ queryKey: ["azure", credentialId, "dashboard"] }).map(([, data]) => data).filter((data): data is Dashboard => Boolean(data));
    // The palette's own load, once it arrives.
    if (fallback.data && !dashboards.includes(fallback.data)) dashboards.push(fallback.data);
    const tickets = new Map<number, Entry>();
    const pullRequests = new Map<number, Entry>();
    for (const dashboard of dashboards) {
      for (const item of dashboard.sections.workItems.data ?? []) {
        tickets.set(item.id, {
          id: `wi:${item.id}`,
          label: `#${item.id} ${item.title}`,
          detail: `${item.type} · ${item.state} · ${item.projectName}`,
          to: `${base}/projects/${encodeURIComponent(item.projectName)}/work-items/${item.id}`,
          icon: <StatusIcon category={item.stateCategory} />,
          haystack: `#${item.id} ${item.id} ${item.title} ${item.type} ${item.state}`.toLowerCase(),
        });
      }
      for (const pr of dashboard.sections.pullRequests.data ?? []) {
        pullRequests.set(pr.pullRequestId, {
          id: `pr:${pr.pullRequestId}`,
          label: `PR ${pr.pullRequestId} ${pr.title}`,
          detail: `${pr.repositoryName} · ${pr.sourceBranch.replace("refs/heads/", "")}`,
          to: `${base}/projects/${encodeURIComponent(pr.projectId)}/repos/${encodeURIComponent(pr.repositoryId)}/pull-requests/${pr.pullRequestId}`,
          icon: <GitPullRequest aria-hidden="true" className="size-4 text-slate-500" />,
          haystack: `pr ${pr.pullRequestId} !${pr.pullRequestId} ${pr.title} ${pr.repositoryName}`.toLowerCase(),
        });
      }
    }
    const pageEntries: Entry[] = pages.map((page) => ({
      id: `page:${page.to}`,
      label: page.label,
      detail: `Page · G then ${page.key.toUpperCase()}`,
      to: page.to,
      icon: <ArrowRight aria-hidden="true" className="size-4 text-slate-500" />,
      haystack: page.label.toLowerCase(),
    }));
    return [...tickets.values(), ...pullRequests.values(), ...pageEntries];
  }, [open, credentialId, queryClient, pages, fallback.data]);
  const hasTickets = entries.some((entry) => !entry.id.startsWith("page:"));
  const loadingTickets = open && !hasTickets && fallback.isFetching;
  const ticketsFailed = open && !hasTickets && Boolean(fallback.error) && !fallback.isFetching;

  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const results = (words.length === 0 ? entries : entries.filter((entry) => words.every((word) => entry.haystack.includes(word)))).slice(0, 12);
  const current = Math.min(active, Math.max(0, results.length - 1));

  const go = (entry: Entry | undefined) => {
    if (!entry) return;
    setVisible(false);
    navigate(entry.to);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={setVisible}
    >
      <DialogContent showCloseButton={false} className="top-[15%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogTitle className="sr-only">Search tickets, pull requests and pages</DialogTitle>
        <DialogDescription className="sr-only">Type to filter, arrow keys to move, Enter to open.</DialogDescription>
        <div className="flex items-center gap-2 border-b border-slate-200 px-4">
          <Search aria-hidden="true" className="size-4 shrink-0 text-slate-400" />
          <input
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls="command-results"
            aria-activedescendant={results[current] ? `command-${results[current]!.id}` : undefined}
            aria-label="Search tickets, pull requests and pages"
            placeholder="Search your tickets, pull requests and pages…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive(Math.min(results.length - 1, current + 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive(Math.max(0, current - 1));
              } else if (event.key === "Enter") {
                event.preventDefault();
                go(results[current]);
              }
            }}
            className="h-12 w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
          />
          <kbd className="hidden shrink-0 rounded border border-slate-200 px-1.5 text-[11px] text-slate-500 sm:inline">Esc</kbd>
        </div>
        {loadingTickets ? (
          <StatusNotice as="p" className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
            Loading your tickets…
          </StatusNotice>
        ) : ticketsFailed ? (
          <StatusNotice as="p" className="border-b border-slate-100 px-4 py-2 text-xs text-amber-700">
            Your tickets could not be loaded; only pages are searchable.
          </StatusNotice>
        ) : null}
        <ul id="command-results" role="listbox" ref={listRef} aria-label="Results" className="max-h-80 overflow-y-auto p-1.5">
          {results.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-slate-500">No tickets or pull requests match.</li>
          ) : (
            results.map((entry, index) => (
              <li
                key={entry.id}
                id={`command-${entry.id}`}
                role="option"
                aria-selected={index === current}
                onMouseEnter={() => setActive(index)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  go(entry);
                }}
                className={cn("flex cursor-pointer items-center gap-3 rounded-md px-3 py-2", index === current ? "bg-slate-100" : "")}
              >
                {entry.icon}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-slate-900">{entry.label}</span>
                  <span className="block truncate text-xs text-slate-500">{entry.detail}</span>
                </span>
              </li>
            ))
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
