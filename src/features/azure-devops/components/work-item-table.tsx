import { Link } from "react-router-dom";

import type { ComplianceResult, WorkItemSummary } from "../types/azure.types";
import { formatValue } from "../utils/format";
import { RULE_LABELS, SEVERITY_TONES } from "../utils/labels";
import { EmptyState } from "./feedback";
import { StatusBadge } from "./status-badge";

interface WorkItemTableProps {
  credentialId: string;
  workItems: WorkItemSummary[];
  compliance: Map<number, ComplianceResult>;
}

export function ComplianceBadges({ result }: { result: ComplianceResult | undefined }) {
  if (!result) {
    return <span className="text-xs text-slate-400">—</span>;
  }

  if (result.violations.length === 0) {
    return (
      <StatusBadge tone="success" title={result.skippedRules.length ? `Skipped: ${result.skippedRules.join(", ")}` : undefined}>
        SOP OK
      </StatusBadge>
    );
  }

  return (
    <div className="flex flex-wrap gap-1">
      {result.violations.map((violation) => (
        <StatusBadge key={violation.ruleId} tone={SEVERITY_TONES[violation.severity]} title={violation.message}>
          {RULE_LABELS[violation.ruleId]}
        </StatusBadge>
      ))}
    </div>
  );
}

export function WorkItemTable({ credentialId, workItems, compliance }: WorkItemTableProps) {
  if (workItems.length === 0) {
    return <EmptyState>No open work items are assigned to you.</EmptyState>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="py-2 pr-3 font-medium">Work item</th>
            <th className="px-3 py-2 font-medium">State</th>
            <th className="px-3 py-2 font-medium">Priority</th>
            <th className="px-3 py-2 font-medium">Est. / Done / Left</th>
            <th className="px-3 py-2 font-medium">SOP compliance</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {workItems.map((item) => (
            <tr key={item.id} className="align-top">
              <td className="py-3 pr-3">
                <Link
                  to={`/azure/${encodeURIComponent(credentialId)}/projects/${encodeURIComponent(item.projectName)}/work-items/${item.id}`}
                  className="font-medium text-slate-950 hover:text-indigo-600"
                >
                  #{item.id} {item.title}
                </Link>
                <p className="mt-0.5 text-xs text-slate-500">
                  {item.type} · {item.projectName}
                  {item.blocked ? " · " : ""}
                  {item.blocked ? <span className="font-medium text-rose-600">Blocked</span> : null}
                </p>
              </td>
              <td className="px-3 py-3 text-slate-700">{item.state}</td>
              <td className="px-3 py-3 text-slate-700">{formatValue(item.priority)}</td>
              <td className="px-3 py-3 text-slate-700">
                {formatValue(item.originalEstimate ?? item.storyPoints ?? item.effort)} /{" "}
                {formatValue(item.completedWork)} / {formatValue(item.remainingWork)}
              </td>
              <td className="px-3 py-3">
                <ComplianceBadges result={compliance.get(item.id)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
