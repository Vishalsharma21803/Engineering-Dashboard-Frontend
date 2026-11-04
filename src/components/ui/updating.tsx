import type { ReactNode } from "react";

import { Spinner } from "@/components/ui/spinner";
import { StatusNotice } from "@/components/ui/status-notice";
import { cn } from "@/utils/cn";

interface UpdatingProps {
  /** True while the content shown is the previous result (another page, period or filter is loading). */
  active: boolean;
  label?: string;
  className?: string;
  children: ReactNode;
}

/**
 * Wraps content that stays on screen while its next version loads: it is
 * dimmed and cannot be clicked or focused (so nothing acts on stale rows), and
 * a "Loading…" badge says the change was taken.
 */
export function Updating({ active, label = "Loading…", className, children }: UpdatingProps) {
  return (
    <div className={cn("relative", className)} aria-busy={active}>
      {active ? (
        <StatusNotice className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border border-slate-200 bg-surface px-3 py-1.5 text-xs font-medium text-slate-700 shadow-md">
          <Spinner className="size-3.5 text-indigo-600" />
          {label}
        </StatusNotice>
      ) : null}
      <div className={cn("transition-opacity", active && "pointer-events-none opacity-50")} inert={active}>
        {children}
      </div>
    </div>
  );
}
