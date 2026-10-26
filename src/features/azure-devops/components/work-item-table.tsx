import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { cn } from "@/utils/cn";
import type { DashboardTriage } from "../hooks/use-triage";
import type { ComplianceResult, WorkItemSummary } from "../types/azure.types";
import { formatValue } from "../utils/format";
import { isAiCheckBusy, isAiCheckPaused } from "@/features/sop/hooks/use-sop-ai";
import type { AiCheck } from "@/features/sop/types/sop.types";
import { describeAiCheckReason, describeAiPause } from "@/features/sop/utils/ai-check";
import { SEVERITY_TONES } from "../utils/labels";
import { UNTRIAGED, isHidden, workItemKey } from "../utils/triage";
import {
  EMPTY_WORK_ITEM_FILTERS,
  matchesWorkItem,
  workItemFilterOptions,
  type WorkItemFilters,
} from "../utils/work-item-filters";
import { EmptyState } from "./feedback";
import { FilterBar, type FilterDefinition } from "./filter-bar";
import { StatusBadge } from "./status-badge";
import { HiddenToggle, TriageBadge, TriageMenu } from "./triage-menu";
import {
  PriorityBadge,
  WorkItemStateBadge,
  WorkItemTypeBadge,
} from "./work-item-badges";
import { workItemTypeStyle } from "../utils/work-item-types";

interface WorkItemTableProps {
  credentialId: string;
  workItems: WorkItemSummary[];
  /**
   * mine: my work with SOP compliance.
   * team: everyone's items in a project, with assignee instead of compliance.
   */
  mode?: "mine" | "team";
  compliance?: Map<number, ComplianceResult>;
  /** AI check status per ticket (My work only). */
  aiChecks?: Map<number, AiCheck>;
  /** Signed-in Azure DevOps identity, used by the team "Mine" filter. */
  myId?: string | null;
  /** Dashboard snooze / acknowledge / abandon state; omitted for team lists. */
  triage?: DashboardTriage;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function AiStatusBadge({ check }: { check: AiCheck | undefined }) {
  if (check && isAiCheckPaused(check)) {
    return (
      <StatusBadge tone="warning" title={`${describeAiPause(check)}${check.errorDetail ? ` Provider said: ${check.errorDetail}` : ""}`}>
        AI paused
      </StatusBadge>
    );
  }

  if (isAiCheckBusy(check)) {
    return (
      <StatusBadge tone="info" title="AI check running">
        AI…
      </StatusBadge>
    );
  }

  if (check?.status === "FAILED" || check?.status === "SKIPPED") {
    return (
      <StatusBadge tone="neutral" title={`AI check: ${describeAiCheckReason(check.errorReason)}`}>
        AI ✕
      </StatusBadge>
    );
  }

  return null;
}

export function ComplianceBadges({ result, ai }: { result: ComplianceResult | undefined; ai?: AiCheck | undefined }) {
  if (!result) {
    return <span className="text-xs text-slate-400">—</span>;
  }

  if (!result.configured) {
    return (
      <StatusBadge tone="neutral" title={`${result.projectName} is not in the SOP rulebook, so it is not checked.`}>
        Not set up
      </StatusBadge>
    );
  }

  if (result.violations.length === 0) {
    const notes = [
      `${result.passedRules.length} rule(s) passed`,
      result.pendingRules.length ? `${result.pendingRules.length} still open` : null,
      result.skippedRules.length ? `skipped: ${result.skippedRules.map((rule) => rule.ruleId).join(", ")}` : null,
    ].filter(Boolean);

    return (
      <div className="flex flex-wrap gap-1">
        <StatusBadge tone="success" title={notes.join("; ")}>
          SOP OK
        </StatusBadge>
        <AiStatusBadge check={ai} />
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-1">
      {result.violations.map((violation) => (
        <StatusBadge
          key={`${violation.checker}:${violation.ruleId}`}
          tone={SEVERITY_TONES[violation.severity]}
          title={`${violation.checker === "ai" ? "AI: " : ""}${violation.ruleTitle}: ${violation.message}`}
        >
          {violation.ruleId}
          {violation.checker === "ai" ? " · AI" : ""}
        </StatusBadge>
      ))}
      <AiStatusBadge check={ai} />
    </div>
  );
}

export function WorkItemTable({
  credentialId,
  workItems,
  mode = "mine",
  compliance = new Map(),
  aiChecks,
  myId = null,
  triage,
}: WorkItemTableProps) {
  const [filters, setFilters] = useState<WorkItemFilters>(EMPTY_WORK_ITEM_FILTERS);
  const [showHiddenChoice, setShowHidden] = useState(false);
  const team = mode === "team";
  const options = useMemo(
    () => workItemFilterOptions(workItems, compliance, myId),
    [workItems, compliance, myId]
  );

  if (workItems.length === 0) {
    return (
      <EmptyState>
        {team ? "No work items in this project match." : "No open work items are assigned to you."}
      </EmptyState>
    );
  }

  const resolved = new Map(
    workItems.map((item) => [
      item.id,
      triage ? triage.resolve(workItemKey(item.id), item.projectName) : UNTRIAGED,
    ])
  );
  const hiddenOf = (item: WorkItemSummary) => isHidden((resolved.get(item.id) ?? UNTRIAGED).state);
  const hiddenCount = workItems.filter(hiddenOf).length;
  const showHidden = showHiddenChoice && hiddenCount > 0;
  const pool = workItems.filter((item) => hiddenOf(item) === showHidden);
  const visible = pool.filter((item) => matchesWorkItem(item, filters, compliance, myId));
  const set = (key: keyof WorkItemFilters) => (value: string) => setFilters({ ...filters, [key]: value });

  const definitions: FilterDefinition[] = [
    { id: "type", label: "Type", value: filters.type, options: options.types, onChange: set("type") },
    { id: "state", label: "State", value: filters.state, options: options.states, onChange: set("state") },
    { id: "priority", label: "Priority", value: filters.priority, options: options.priorities, onChange: set("priority") },
    team
      ? { id: "assignee", label: "Assignee", value: filters.assignee, options: options.assignees, onChange: set("assignee") }
      : { id: "sop", label: "SOP", value: filters.sop, options: options.sop, onChange: set("sop") },
  ];

  return (
    <div className="space-y-3">
      <FilterBar
        search={{ value: filters.search, onChange: set("search"), placeholder: "Search ID, title or tag" }}
        filters={definitions}
        shown={visible.length}
        total={pool.length}
        onClear={() => setFilters(EMPTY_WORK_ITEM_FILTERS)}
      />
      {hiddenCount > 0 ? (
        <div className="flex justify-end">
          <HiddenToggle count={hiddenCount} shown={showHidden} onToggle={() => setShowHidden(!showHidden)} />
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="py-2 pl-4 pr-3 font-medium">Work item</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">State</th>
              <th className="px-3 py-2 font-medium">Pri</th>
              <th className="px-3 py-2 font-medium" title="Estimate / completed / remaining">
                Est · Done · Left
              </th>
              <th className="px-3 py-2 font-medium">{team ? "Assigned to" : "SOP compliance"}</th>
              {triage ? (
                <th className="w-12 px-3 py-2 font-medium">
                  <span className="sr-only">Triage</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visible.map((item) => {
              const triaged = resolved.get(item.id) ?? UNTRIAGED;

              return (
                <tr
                  key={item.id}
                  className={cn("group align-top transition hover:bg-slate-50", triaged.state !== "active" && "opacity-75")}
                >
                  <td className="relative py-3 pl-4 pr-3">
                    <span aria-hidden="true" className={cn("absolute inset-y-2 left-0 w-1 rounded-full", workItemTypeStyle(item.type).bar)} />
                    <Link
                      to={`/azure/${encodeURIComponent(credentialId)}/projects/${encodeURIComponent(item.projectName)}/work-items/${item.id}`}
                      className="font-medium text-slate-950 group-hover:text-indigo-600"
                    >
                      <span className="text-slate-500">#{item.id}</span> {item.title}
                    </Link>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                      {item.projectName}
                      {item.iterationPath ? <span>· {item.iterationPath.split("\\").at(-1)}</span> : null}
                      {item.blocked ? <StatusBadge tone="danger">Blocked</StatusBadge> : null}
                      <TriageBadge resolved={triaged} />
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <WorkItemTypeBadge type={item.type} compact />
                  </td>
                  <td className="px-3 py-3">
                    <WorkItemStateBadge state={item.state} category={item.stateCategory} />
                  </td>
                  <td className="px-3 py-3">
                    <PriorityBadge priority={item.priority} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 tabular-nums text-slate-700">
                    {formatValue(item.originalEstimate ?? item.storyPoints ?? item.effort)} · {formatValue(item.completedWork)} ·{" "}
                    {formatValue(item.remainingWork)}
                  </td>
                  <td className="px-3 py-3">
                    {team ? (
                      item.assignedTo ? (
                        <span className="inline-flex items-center gap-2 text-sm text-slate-700">
                          <span
                            className={cn(
                              "flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                              item.assignedTo.id === myId ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-700"
                            )}
                          >
                            {initials(item.assignedTo.displayName)}
                          </span>
                          {item.assignedTo.id === myId ? "You" : item.assignedTo.displayName}
                        </span>
                      ) : (
                        <span className="text-xs italic text-slate-400">Unassigned</span>
                      )
                    ) : (
                      <ComplianceBadges result={compliance.get(item.id)} ai={aiChecks?.get(item.id)} />
                    )}
                  </td>
                  {triage ? (
                    <td className="px-3 py-3 text-right">
                      <TriageMenu
                        triage={triage}
                        itemKey={workItemKey(item.id)}
                        projectName={item.projectName}
                        label={`#${item.id} ${item.title}`}
                        resolved={triaged}
                      />
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
        {visible.length === 0 ? (
          <EmptyState className="mt-3">
            {pool.length === 0 && !showHidden
              ? "All your open work items are snoozed or abandoned."
              : "No work items match these filters."}
          </EmptyState>
        ) : null}
      </div>
    </div>
  );
}
