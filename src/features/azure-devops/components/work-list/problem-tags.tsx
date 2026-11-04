import { AlertOctagon, AlertTriangle, Clock } from "lucide-react";

import { Hint } from "@/components/ui/hint";
import { cn } from "@/utils/cn";
import type { Problem } from "./problems";

const PROBLEM_ICONS = { danger: AlertOctagon, warning: AlertTriangle, neutral: Clock } as const;
const TAG_TONES = {
  danger: "bg-rose-50 text-rose-700 ring-rose-200",
  warning: "bg-amber-50 text-amber-800 ring-amber-200",
  neutral: "bg-slate-100 text-slate-600 ring-slate-200",
} as const;

/**
 * Small tags for what a ticket needs: every SOP gap shares one "SOP issue" tag, the rest are a word or two.
 * The full list is in the hint; the ticket page lists each gap with its fix.
 */
const MAX_TAGS = 2;

export function ProblemTags({ problems }: { problems: Problem[] }) {
  if (problems.length === 0) return null;
  const sop = problems.filter((problem) => problem.sop);
  const tags: Array<{ key: string; tone: Problem["tone"]; label: string }> = [];
  for (const problem of problems) {
    if (problem.sop) {
      if (problem === sop[0]) tags.push({ key: "sop", tone: "warning", label: sop.length === 1 ? "SOP issue" : `${sop.length} SOP issues` });
    } else if (!tags.some((tag) => tag.label === problem.tag)) {
      tags.push({ key: problem.text, tone: problem.tone, label: problem.tag });
    }
  }
  return (
    <Hint
      label={
        <span className="block max-w-72">
          {problems.map((problem) => problem.text).join(" · ")}
          {sop.length > 0 ? <span className="mt-1 block opacity-80">Open the ticket to see each SOP issue and its fix.</span> : null}
        </span>
      }
      focusable
    >
      <span className="inline-flex min-w-0 shrink-0 cursor-default items-center gap-1">
        {tags.slice(0, MAX_TAGS).map((tag, index) => {
          const Icon = PROBLEM_ICONS[tag.tone];
          return (
            // Phones keep the title readable: only the first tag's icon shows there.
            <span key={tag.key} className={cn("items-center gap-0.5 whitespace-nowrap rounded px-1 text-xs font-medium leading-4 ring-1 ring-inset", TAG_TONES[tag.tone], index === 0 ? "inline-flex" : "hidden sm:inline-flex")}>
              <Icon aria-hidden="true" className="size-3 shrink-0" />
              <span className="hidden sm:inline">{tag.label}</span>
            </span>
          );
        })}
        {tags.length > MAX_TAGS ? <span className="hidden whitespace-nowrap text-xs font-medium text-slate-500 sm:inline">+{tags.length - MAX_TAGS}</span> : null}
        <span className="sr-only">{problems.map((problem) => problem.text).join(". ")}</span>
      </span>
    </Hint>
  );
}
