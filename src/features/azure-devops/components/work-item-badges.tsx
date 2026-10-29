import { Hint } from "@/components/ui/hint";
import { cn } from "@/utils/cn";
import type { StateCategory } from "../types/azure.types";
import { workItemTypeStyle } from "../utils/work-item-types";

export function WorkItemTypeIcon({ type, className }: { type: string; className?: string }) {
  const style = workItemTypeStyle(type);
  const stroked = type === "Task" || type === "Issue";

  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className={cn("size-3.5 shrink-0", className)}
      fill={stroked ? "none" : "currentColor"}
      stroke={stroked ? "currentColor" : "none"}
      strokeWidth={stroked ? 2 : 0}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={style.icon} />
    </svg>
  );
}

export function WorkItemTypeBadge({ type, compact = false }: { type: string; compact?: boolean }) {
  const style = workItemTypeStyle(type);

  return (
    <span
      title={type}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold ring-1 ring-inset",
        style.chip
      )}
    >
      <WorkItemTypeIcon type={type} />
      {compact ? style.short : type}
    </span>
  );
}

const STATE_STYLES: Record<StateCategory, string> = {
  Proposed: "bg-slate-100 text-slate-700",
  InProgress: "bg-blue-100 text-blue-800",
  Resolved: "bg-amber-100 text-amber-800",
  Completed: "bg-emerald-100 text-emerald-800",
  Removed: "bg-slate-100 text-slate-500 line-through",
  Unknown: "bg-slate-100 text-slate-700",
};

export function WorkItemStateBadge({ state, category }: { state: string; category: StateCategory }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium", STATE_STYLES[category])}>
      {state}
    </span>
  );
}

const PRIORITY_STYLES: Record<number, string> = {
  1: "bg-rose-600 text-white",
  2: "bg-badge-high text-white",
  3: "bg-badge-muted text-white",
  4: "bg-slate-300 text-slate-700",
};

export function PriorityBadge({ priority }: { priority: number | null }) {
  if (priority === null) {
    return <span className="text-xs text-slate-400">—</span>;
  }

  return (
    <Hint label={`Priority ${priority}`}>
      <span
        className={cn(
          "inline-flex h-5 min-w-7 shrink-0 cursor-default items-center justify-center rounded px-1 text-[11px] font-bold",
          PRIORITY_STYLES[priority] ?? "bg-slate-300 text-slate-700"
        )}
      >
        P{priority}
      </span>
    </Hint>
  );
}
