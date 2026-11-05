import { useState, type ReactNode } from "react";

import { DatePicker } from "@/components/ui/date-picker";
import { Hint } from "@/components/ui/hint";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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

function MenuButton({ onClick, children, tone = "default" }: { onClick: () => void; children: ReactNode; tone?: "default" | "danger" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500",
        tone === "danger" ? "text-rose-700 hover:bg-rose-50 focus-visible:bg-rose-50" : "text-slate-700 hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent"
      )}
    >
      {children}
    </button>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="py-1.5" role="group" aria-label={title}>
      <p className="truncate px-2.5 pb-1 text-xs font-medium text-slate-500">{title}</p>
      {children}
    </div>
  );
}

/** Snooze / acknowledge / abandon an item or its whole project. Relay-only. */
export function TriageMenu({ triage, itemKey, projectName, label, resolved }: TriageMenuProps) {
  const [open, setOpen] = useState(false);
  const [customDate, setCustomDate] = useState("");
  // Captured when the menu opens so snooze presets stay stable while it is open.
  const [now, setNow] = useState(() => new Date());
  const disabled = !triage.ready || triage.isSaving;

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
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setNow(new Date());
        }
        setOpen(next);
      }}
    >
      <Hint label="Snooze, acknowledge or abandon">
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label={`Triage ${label}`}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-surface text-slate-500 outline-none transition hover:border-slate-300 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 data-[state=open]:border-indigo-300 data-[state=open]:bg-indigo-50 data-[state=open]:text-indigo-700"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="size-4">
              <path d="M3 10a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Zm5.5 0a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0ZM15.5 8.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" />
            </svg>
          </button>
        </PopoverTrigger>
      </Hint>

      <PopoverContent
        align="end"
        collisionPadding={8}
        aria-label={`Triage ${label}`}
        className="max-h-(--radix-popover-content-available-height) w-68 max-w-[calc(100vw-1rem)] divide-y divide-slate-100 overflow-y-auto rounded-xl border-slate-200 p-1.5 text-left shadow-xl"
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
              <DatePicker
                aria-label="Snooze until date"
                placeholder="Until a date…"
                size="sm"
                value={customDate}
                min={toDateInputValue(addDays(now, 1))}
                max={toDateInputValue(addDays(now, 364))}
                onChange={setCustomDate}
                className="h-8 flex-1 px-2 text-xs"
              />
              <button
                type="submit"
                disabled={!customUntil}
                className="h-8 rounded-md bg-inverse px-2.5 text-xs font-medium text-on-inverse transition-opacity disabled:opacity-40"
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

        <p className="px-2.5 pb-1 pt-2 text-xs leading-4 text-slate-500">
          Only changes your Relay view. Nothing is changed in Azure DevOps.
        </p>
      </PopoverContent>
    </Popover>
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
          ? "border-inverse bg-inverse text-on-inverse"
          : "border-dashed border-slate-300 bg-surface text-slate-600 hover:border-slate-400 hover:text-slate-900"
      )}
    >
      {shown ? "Hide snoozed & abandoned" : `Show snoozed & abandoned (${count})`}
    </button>
  );
}
