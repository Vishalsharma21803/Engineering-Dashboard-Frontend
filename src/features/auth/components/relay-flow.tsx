import { Check, Clock, GitPullRequest, ShieldCheck, type LucideIcon } from "lucide-react";
import type { CSSProperties } from "react";

import { BrandMark } from "@/components/brand/brand-mark";
import { cn } from "@/utils/cn";

/*
 * Decorative: what Relay does, drawn as one flow. Work arrives from Azure DevOps, Solidtime and the
 * SOP rules (one source at a time), meets in Relay (the hub), and only leaves once you approve it.
 * Illustrative content; nothing here comes from a real organization.
 *
 * Coordinates are in the SVG's 560 × 300 box; the HTML layer above it uses the same box in %.
 * Timing (index.css, "Sign-in flow"): a 9 s cycle, one source every 3 s. Captions get their own line along the
 * bottom, centred under the hub: text keeps its size while the box scales, so nearer the nodes they collide.
 */
const W = 560;
const H = 300;
const HUB = { x: 340, y: 140 };
const APPROVE = { x: 516, y: 140 };

interface Source {
  label: string;
  icon: LucideIcon;
  y: number;
  /** The caption shown at the hub when this source's pulse arrives. */
  chip: string;
  tone: string;
  caption: string;
}

const SOURCES: Source[] = [
  { label: "Azure DevOps", icon: GitPullRequest, y: 40, chip: "Code review", tone: "bg-sky-500/25 text-white ring-sky-300/50", caption: "PR 412 needs your review" },
  { label: "Solidtime", icon: Clock, y: 140, chip: "Time", tone: "bg-indigo-500/35 text-white ring-indigo-300/50", caption: "6h 10m drafted for Tuesday" },
  { label: "SOP rules · AI", icon: ShieldCheck, y: 240, chip: "SOP check", tone: "bg-amber-500/25 text-white ring-amber-300/50", caption: "Approach missing on #2190" },
];

const LINE_START = 178;

/** A soft S-curve from a source's label into the hub. */
const sourcePath = (y: number) => `M${LINE_START},${y} C${LINE_START + 90},${y} ${HUB.x - 110},${HUB.y} ${HUB.x - 34},${HUB.y}`;
const approvePath = `M${HUB.x + 34},${HUB.y} L${APPROVE.x - 22},${APPROVE.y}`;

const at = (x: number, y: number): CSSProperties => ({ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` });
const delay = (index: number): CSSProperties => ({ animationDelay: `${index * 3}s` });

export function RelayFlow() {
  return (
    <div aria-hidden="true" className="relay-flow relative aspect-[560/300] w-full select-none">
      {/* The hub's light, centred on it. */}
      <div className="pointer-events-none absolute size-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(99_80_255/0.32),transparent)]" style={at(HUB.x, HUB.y)} />

      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 size-full overflow-visible" fill="none">
        {SOURCES.map((source, index) => (
          <g key={source.label}>
            <path d={sourcePath(source.y)} className="fl-track" />
            <path d={sourcePath(source.y)} pathLength={100} className="fl-pulse fl-pulse-in" style={delay(index)} />
          </g>
        ))}
        <path d={approvePath} className="fl-track" />
        <path d={approvePath} pathLength={100} className="fl-pulse fl-pulse-out" />
      </svg>

      {SOURCES.map((source, index) => {
        const Icon = source.icon;
        return (
          <div key={source.label} className="absolute flex -translate-y-1/2 items-center gap-2.5" style={at(0, source.y)}>
            <span className="fl-source flex size-9 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-slate-300 ring-1 ring-inset ring-white/10" style={delay(index)}>
              <Icon className="size-4" strokeWidth={1.8} />
            </span>
            <span className="text-xs font-medium whitespace-nowrap text-slate-300">{source.label}</span>
          </div>
        );
      })}

      <div className="absolute -translate-x-1/2 -translate-y-1/2" style={at(HUB.x, HUB.y)}>
        <span className="fl-ring absolute inset-0 rounded-2xl ring-2 ring-indigo-300/60" />
        <BrandMark inverted className="relative size-[3.25rem] rounded-2xl [&_svg]:size-6" />
      </div>

      {SOURCES.map((source, index) => (
        <div key={source.label} className={cn("fl-caption absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 whitespace-nowrap", index === 0 && "fl-caption-still")} style={{ ...at(HUB.x, H - 14), ...delay(index) }}>
          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", source.tone)}>{source.chip}</span>
          <span className="text-xs font-medium text-white">{source.caption}</span>
        </div>
      ))}

      <div className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2" style={at(APPROVE.x, APPROVE.y + 13)}>
        <span className="fl-approve flex size-11 items-center justify-center rounded-full bg-white/[0.06] text-slate-300 ring-1 ring-inset ring-white/10">
          <Check className="size-5" strokeWidth={2} />
        </span>
        <span className="text-xs font-medium whitespace-nowrap text-slate-300">You approve</span>
      </div>
    </div>
  );
}
