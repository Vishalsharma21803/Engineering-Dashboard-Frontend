import { StatusBadge } from "@/features/azure-devops/components/status-badge";
import type { CardSummary, RuleSeverity } from "../types/sop.types";
import { SEVERITY_LABELS, checkerLabel, itemTypeLabel } from "../utils/rule-labels";

const SEVERITY_TONE: Record<RuleSeverity, "danger" | "warning" | "info" | "neutral"> = {
  fail: "danger",
  warn: "warning",
  notice: "info",
  off: "neutral",
};

const WHEN_LABELS: Record<string, string> = {
  "at-estimation": "Once estimated",
  "before-active": "Once work starts",
  "at-review": "At Review",
  "at-testing": "At Testing",
  "at-qa": "At QA",
  "at-uat": "At UAT",
  "at-done": "At Done",
  "while-active": "While in progress",
  always: "Always",
};

function checkedBy(card: CardSummary): string {
  return card.checker === "ai" ? "AI" : card.uses ? `Code · ${checkerLabel(card.uses)}` : "Code";
}

export function RuleSummaryTable({ cards }: { cards: CardSummary[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full min-w-[520px] text-left text-sm sm:min-w-[720px]">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2 font-medium">Rule</th>
            <th className="hidden px-3 py-2 font-medium sm:table-cell">Checked by</th>
            <th className="px-3 py-2 font-medium">Applies to</th>
            <th className="px-3 py-2 font-medium">When</th>
            <th className="px-3 py-2 font-medium">Severity</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {cards.map((card) => (
            <tr key={card.id}>
              <td className="px-3 py-2">
                <span className="font-mono text-xs text-slate-500">{card.id}</span>{" "}
                <span className="font-medium text-slate-900">{card.title}</span>
                {card.origin === "personal" ? (
                  <span className="ml-2 rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] font-semibold text-indigo-700">yours</span>
                ) : null}
                {/* On phones the "Checked by" column is folded under the title. */}
                <span className="mt-0.5 block text-xs text-slate-500 sm:hidden">{checkedBy(card)}</span>
              </td>
              <td className="hidden px-3 py-2 text-slate-700 sm:table-cell">{checkedBy(card)}</td>
              <td className="px-3 py-2 text-slate-700">
                {card.appliesTo.length === 6 ? "All types" : card.appliesTo.map(itemTypeLabel).join(", ")}
              </td>
              <td className="px-3 py-2 text-slate-700">{WHEN_LABELS[card.when] ?? card.when}</td>
              <td className="px-3 py-2">
                <StatusBadge tone={SEVERITY_TONE[card.severity]}>{SEVERITY_LABELS[card.severity]}</StatusBadge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
