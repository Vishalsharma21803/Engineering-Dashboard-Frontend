import { useEffect, useState } from "react";

import { cn } from "@/utils/cn";

/* Illustrative content for the sign-in panel. Nothing here comes from a real organization. */
const ROWS = [
  { chip: "Blocker", tone: "bg-rose-500/15 text-rose-300 ring-rose-400/25", dot: "bg-rose-400", title: "#2178 Checkout times out on retry", meta: "Marked as blocked · 2 h ago" },
  { chip: "Code review", tone: "bg-sky-500/15 text-sky-300 ring-sky-400/25", dot: "bg-sky-400", title: "PR 412 Payment webhooks", meta: "Changes requested · 3 threads" },
  { chip: "Failed pipeline", tone: "bg-rose-500/15 text-rose-300 ring-rose-400/25", dot: "bg-rose-400", title: "release-ci #2026.88 failed", meta: "main · 14 min ago" },
  { chip: "SOP", tone: "bg-amber-500/15 text-amber-300 ring-amber-400/25", dot: "bg-amber-400", title: "#2190 Add rate-limit headers", meta: "No original estimate" },
];

const RUNS = ["ok", "ok", "fail", "ok", "ok", "ok", "ok", "fail", "ok", "running"] as const;

function formatClock(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}

/** A small, decorative replica of the cockpit at work. Hidden from assistive technology. */
export function CockpitPreview() {
  const [elapsed, setElapsed] = useState(6137);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!document.hidden) setElapsed((value) => value + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div aria-hidden="true" className="cockpit-preview relative select-none">
      {/* The screen's own light, spilling onto the panel behind it. */}
      <div className="pointer-events-none absolute -inset-x-10 -inset-y-12 bg-[radial-gradient(closest-side,rgb(99_80_255/0.28),transparent)]" />

      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900/90 shadow-[inset_0_1px_0_0_rgb(255_255_255/0.06),0_30px_60px_-20px_rgb(0_0_0/0.8)]">
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-3">
          <p className="text-xs font-medium text-slate-300">
            Prioritized actions <span className="text-slate-400">· preview</span>
          </p>
          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-400/10 px-2.5 py-1 font-mono text-[11px] text-emerald-300 ring-1 ring-inset ring-emerald-400/20">
            <span className="cp-live size-1.5 rounded-full bg-emerald-400" />
            #2178 · {formatClock(elapsed)}
          </span>
        </div>

        <ol className="relative px-2 py-2">
          <span className="cp-focus pointer-events-none absolute inset-x-2 top-2 h-14 rounded-xl bg-white/[0.06] ring-1 ring-inset ring-white/10" />
          {ROWS.map((row, index) => (
            <li
              key={row.title}
              className="cp-row relative flex h-14 items-center gap-3 px-3"
              style={{ animationDelay: `${300 + index * 110}ms` }}
            >
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white/[0.07] text-[11px] font-semibold text-slate-300 tabular-nums">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-px text-[10px] font-medium ring-1 ring-inset", row.tone)}>
                    <span className={cn("size-1 rounded-full", row.dot)} />
                    {row.chip}
                  </span>
                  <span className="truncate text-[13px] font-medium text-slate-100">{row.title}</span>
                </span>
                <span className="mt-0.5 block truncate text-[11px] text-slate-400">{row.meta}</span>
              </span>
              <span className="hidden shrink-0 rounded-md border border-white/10 px-2 py-1 text-[11px] text-slate-300 xl:inline">Open</span>
            </li>
          ))}
        </ol>

        <div className="grid grid-cols-2 gap-px border-t border-white/[0.07] bg-white/[0.07]">
          <div className="bg-slate-900 px-4 py-3">
            <p className="text-[11px] text-slate-400">release-ci · last 10 runs</p>
            <div className="mt-2 flex h-6 items-end gap-1">
              {RUNS.map((run, index) => (
                <span
                  key={index}
                  className={cn(
                    "cp-run w-full rounded-sm",
                    run === "ok" && "h-full bg-emerald-400/70",
                    run === "fail" && "h-full bg-rose-400/80",
                    run === "running" && "cp-running h-full bg-indigo-400"
                  )}
                  style={{ animationDelay: `${700 + index * 45}ms` }}
                />
              ))}
            </div>
          </div>
          <div className="bg-slate-900 px-4 py-3">
            <p className="flex items-baseline justify-between text-[11px] text-slate-400">
              Time today <span className="font-mono text-slate-300">6h 10m / 8h</span>
            </p>
            <div className="mt-3.5 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
              <div className="cp-gauge h-full w-[77%] origin-left rounded-full bg-indigo-400" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
