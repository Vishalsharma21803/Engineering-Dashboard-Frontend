import { cn } from "@/utils/cn";
import type { StateCategory } from "../types/azure.types";

/**
 * Where a ticket stands, as one circle that reads without color: empty to do,
 * half in progress, check resolved, filled check done, cross removed, dashed unknown.
 */
export function StatusIcon({ category, className }: { category: StateCategory; className?: string }) {
  const base = cn("size-4 shrink-0", className);
  switch (category) {
    case "InProgress":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true" className={cn(base, "text-amber-500")}>
          <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 3.75a4.25 4.25 0 0 1 0 8.5z" fill="currentColor" />
        </svg>
      );
    case "Resolved":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true" className={cn(base, "text-indigo-500")}>
          <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="m5.25 8.25 1.9 1.9 3.6-3.9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "Completed":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true" className={cn(base, "text-slate-400")}>
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <path d="m5.25 8.25 1.9 1.9 3.6-3.9" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "Removed":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true" className={cn(base, "text-slate-400")}>
          <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="m5.75 5.75 4.5 4.5m0-4.5-4.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true" className={cn(base, "text-slate-400")}>
          <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray={category === "Unknown" ? "2 2" : undefined} />
        </svg>
      );
  }
}
