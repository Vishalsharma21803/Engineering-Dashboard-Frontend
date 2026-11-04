import { BookMarked, Bug, CircleAlert, ClipboardList, Crown, FileText, FlaskConical, Trophy, type LucideIcon } from "lucide-react";

import { Hint } from "@/components/ui/hint";
import type { StateCategory } from "../../types/azure.types";
import { StatusIcon } from "../status-icon";

const TYPE_ICONS: Record<string, LucideIcon> = {
  "User Story": BookMarked,
  "Product Backlog Item": BookMarked,
  Requirement: BookMarked,
  Bug,
  Task: ClipboardList,
  Feature: Trophy,
  Epic: Crown,
  Issue: CircleAlert,
  "Test Case": FlaskConical,
};

/** The ticket type as a quiet grey glyph (Azure DevOps' own shapes: bookmark story, bug, clipboard task, trophy feature, crown epic). */
export function TypeIcon({ type }: { type: string }) {
  const Icon = TYPE_ICONS[type] ?? FileText;
  return (
    <Hint label={type}>
      <span className="inline-flex size-4 shrink-0 cursor-default items-center justify-center text-slate-400">
        <Icon aria-hidden="true" className="size-4" strokeWidth={1.75} />
        <span className="sr-only">{type}</span>
      </span>
    </Hint>
  );
}

/** The state as a status circle; its name on hover and for screen readers. */
export function StateIcon({ category, state }: { category: StateCategory; state: string }) {
  return (
    <Hint label={state}>
      <span className="inline-flex shrink-0 cursor-default">
        <StatusIcon category={category} />
        <span className="sr-only">{state}</span>
      </span>
    </Hint>
  );
}

export function NewDot() {
  return (
    <Hint label="Changed since your last visit">
      <span className="inline-flex size-3 shrink-0 cursor-default items-center justify-center">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-indigo-500" />
        <span className="sr-only">Changed since your last visit</span>
      </span>
    </Hint>
  );
}
