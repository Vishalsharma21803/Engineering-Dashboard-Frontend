import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/utils/cn";
import type { DashboardTriage, TriageTarget } from "../hooks/use-triage";
import type { ResolvedTriage, TriageStatus } from "../types/triage.types";
import { formatDateTime } from "../utils/format";
import { addDays, snoozeDateFromInput, snoozePresets, toDateInputValue } from "../utils/triage";
import { StatusBadge } from "./status-badge";

export function TriageBadge({ resolved }: { resolved: ResolvedTriage }) {
  const scope = resolved.viaProject ? " · project" : "";

  if (resolved.resurfaced) {
    const was = resolved.mark?.status === "SNOOZED" ? "snoozed" : "acknowledged";
    return (
      <StatusBadge tone="warning" title={`A new problem appeared after this was ${was}`}>
        New since {was}
        {scope}
      </StatusBadge>
    );
  }

  switch (resolved.state) {
    case "acknowledged":
      return <StatusBadge tone="neutral">Acknowledged{scope}</StatusBadge>;
    case "snoozed":
      return (
        <StatusBadge tone="info">
          Snoozed until {formatDateTime(resolved.mark?.snoozedUntil)}
          {scope}
        </StatusBadge>
      );
    case "abandoned":
      return <StatusBadge tone="neutral">Abandoned{scope}</StatusBadge>;
    case "active":
      return null;
  }
}

interface TriageMenuProps {
  triage: DashboardTriage;
  /** Item to mark; null when only the project can be marked. */
  itemKey: string | null;
  projectName: string | null;
  /** Accessible name of the item, e.g. "#102 Fix flaky test". */
  label: string;
  resolved: ResolvedTriage;
}

const MENU_WIDTH = 272;
const MENU_HEIGHT_ESTIMATE = 420;

/**
 * Fixed position next to the trigger (rendered in a portal, so neither table
 * overflow nor card stacking contexts clip it), kept inside the viewport.
 */
function placeNear(rect: DOMRect): CSSProperties {
  const width = Math.min(MENU_WIDTH, window.innerWidth - 16);
  const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8);
  const spaceBelow = window.innerHeight - rect.bottom - 12;
  const above = spaceBelow < MENU_HEIGHT_ESTIMATE && rect.top > spaceBelow;

  return above
    ? { position: "fixed", left, width, bottom: window.innerHeight - rect.top + 4, maxHeight: rect.top - 12 }
    : { position: "fixed", left, width, top: rect.bottom + 4, maxHeight: Math.max(160, spaceBelow) };
}

function MenuButton({ onClick, children, tone = "default" }: { onClick: () => void; children: ReactNode; tone?: "default" | "danger" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "block w-full rounded-md px-2.5 py-1.5 text-left text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-indigo-500",
        tone === "danger" ? "text-rose-700 hover:bg-rose-50" : "text-slate-700 hover:bg-slate-100"
      )}
    >
      {children}
    </button>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="py-1.5" role="group" aria-label={title}>
      <p className="truncate px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{title}</p>
      {children}
    </div>
  );
}

/** Snooze / acknowledge / abandon an item or its whole project. Cockpit-only. */
export function TriageMenu({ triage, itemKey, projectName, label, resolved }: TriageMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({});
  const [customDate, setCustomDate] = useState("");
  // Captured when the menu opens so snooze presets stay stable while it is open.
  const [now, setNow] = useState(() => new Date());
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const disabled = !triage.ready || triage.isSaving;

  useEffect(() => {
    if (!open) {
      return;
    }

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !buttonRef.current?.contains(target)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }

    // The panel is fixed-positioned, so keep it next to its trigger while the page moves.
    function follow(event: Event) {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (rect && !panelRef.current?.contains(event.target as Node)) {
        setPosition(placeNear(rect));
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", follow, true);
    window.addEventListener("resize", follow);
    panelRef.current?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", follow, true);
      window.removeEventListener("resize", follow);
    };
  }, [open]);

  function toggle() {
    const rect = buttonRef.current?.getBoundingClientRect();

    if (!open) {
      setNow(new Date());
    }

    if (!open && rect) {
      setPosition(placeNear(rect));
    }

    setOpen(!open);
  }

  function apply(target: TriageTarget, status: TriageStatus, until?: Date) {
    triage.mark(target, status, until);
    setOpen(false);
    setCustomDate("");
  }

  const presets = snoozePresets(now);
  const customUntil = snoozeDateFromInput(customDate);
  const ownMark = resolved.mark && !resolved.viaProject ? resolved.mark : null;
  const projectMark = triage.projectMarks.find(
    (mark) => projectName !== null && mark.itemKey === `project:${projectName.toLowerCase()}`
  );

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        disabled={disabled}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`Triage ${label}`}
        title="Snooze, acknowledge or abandon"
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 outline-none transition hover:border-slate-300 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="size-4">
          <path d="M3 10a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Zm5.5 0a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0ZM15.5 8.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" />
        </svg>
      </button>

      {open
        ? createPortal(
            <div
              ref={panelRef}
              id={panelId}
              role="dialog"
              aria-label={`Triage ${label}`}
              style={position}
              className="z-50 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 text-left shadow-xl"
            >
              {itemKey ? (
                <Group title="This item">
                  {ownMark ? <MenuButton onClick={() => { triage.clear(ownMark); setOpen(false); }}>Restore to my list</MenuButton> : null}
                  {presets.map((preset) => (
                    <MenuButton key={preset.label} onClick={() => apply({ itemKey }, "SNOOZED", preset.until)}>
                      Snooze · {preset.label.toLowerCase()}
                    </MenuButton>
                  ))}
                  <form
                    className="flex items-center gap-1.5 px-2.5 py-1.5"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (customUntil) apply({ itemKey }, "SNOOZED", customUntil);
                    }}
                  >
                    <label className="sr-only" htmlFor={`${panelId}-date`}>
                      Snooze until date
                    </label>
                    <input
                      id={`${panelId}-date`}
                      type="date"
                      value={customDate}
                      min={toDateInputValue(addDays(now, 1))}
                      max={toDateInputValue(addDays(now, 364))}
                      onChange={(event) => setCustomDate(event.target.value)}
                      className="min-w-0 flex-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700"
                    />
                    <button
                      type="submit"
                      disabled={!customUntil}
                      className="rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-40"
                    >
                      Snooze
                    </button>
                  </form>
                  <MenuButton onClick={() => apply({ itemKey }, "ACKNOWLEDGED")}>Acknowledge · keep, move down</MenuButton>
                  <MenuButton tone="danger" onClick={() => apply({ itemKey }, "ABANDONED")}>
                    Abandon · hide until restored
                  </MenuButton>
                </Group>
              ) : null}

              {projectName ? (
                <Group title={`Whole project · ${projectName}`}>
                  {projectMark ? (
                    <MenuButton onClick={() => { triage.clear(projectMark); setOpen(false); }}>Restore project</MenuButton>
                  ) : null}
                  {presets.slice(0, 2).map((preset) => (
                    <MenuButton key={preset.label} onClick={() => apply({ projectName }, "SNOOZED", preset.until)}>
                      Snooze project · {preset.label.toLowerCase()}
                    </MenuButton>
                  ))}
                  <MenuButton onClick={() => apply({ projectName }, "ACKNOWLEDGED")}>Acknowledge project</MenuButton>
                  <MenuButton tone="danger" onClick={() => apply({ projectName }, "ABANDONED")}>
                    Abandon project
                  </MenuButton>
                </Group>
              ) : null}

              <p className="px-2.5 pb-1 pt-2 text-[11px] leading-4 text-slate-400">
                Only changes your Cockpit view. Nothing is changed in Azure DevOps.
              </p>
            </div>,
            document.body
          )
        : null}
    </>
  );
}

/** "Show hidden (n)" toggle used by every triaged list. */
export function HiddenToggle({ count, shown, onToggle }: { count: number; shown: boolean; onToggle: () => void }) {
  if (count === 0) {
    return null;
  }

  return (
    <button
      type="button"
      aria-pressed={shown}
      onClick={onToggle}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition",
        shown
          ? "border-slate-900 bg-slate-900 text-white"
          : "border-dashed border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-900"
      )}
    >
      {shown ? "Hide snoozed & abandoned" : `Show snoozed & abandoned (${count})`}
    </button>
  );
}
