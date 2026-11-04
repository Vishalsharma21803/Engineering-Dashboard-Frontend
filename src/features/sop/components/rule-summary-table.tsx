import { useState } from "react";

import { Pagination } from "@/components/ui/pagination";
import { EmptyState } from "@/features/azure-devops/components/feedback";
import { FilterBar } from "@/features/azure-devops/components/filter-bar";
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

const PAGE_SIZE = 10;
const ALL_TYPES = 6;

function checkedBy(card: CardSummary): string {
  return card.checker === "ai" ? "AI" : card.uses ? `Code · ${checkerLabel(card.uses)}` : "Code";
}

/** Rule cards as a table, with search, filters and pages of 10 (all in the browser: a rulebook is small). */
export function RuleSummaryTable({ cards }: { cards: CardSummary[] }) {
  const [search, setSearch] = useState("");
  const [severity, setSeverity] = useState("");
  const [checker, setChecker] = useState("");
  const [type, setType] = useState("");
  const [page, setPage] = useState(1);

  const query = search.trim().toLowerCase();
  const filtered = cards.filter(
    (card) =>
      (!query || `${card.id} ${card.title}`.toLowerCase().includes(query)) &&
      (!severity || card.severity === severity) &&
      (!checker || card.checker === checker) &&
      (!type || card.appliesTo.includes(type))
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const shown = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const count = (predicate: (card: CardSummary) => boolean) => cards.filter(predicate).length;
  const types = [...new Set(cards.flatMap((card) => card.appliesTo))].sort();
  const reset = (apply: () => void) => {
    apply();
    setPage(1);
  };

  return (
    <div className="flex flex-col gap-3">
      <FilterBar
        search={{ value: search, onChange: (value) => reset(() => setSearch(value)), placeholder: "Search rule id or title" }}
        filters={[
          {
            id: "severity",
            label: "Severity",
            value: severity,
            options: (["fail", "warn", "notice", "off"] as const).map((value) => ({ value, label: SEVERITY_LABELS[value], count: count((card) => card.severity === value) })).filter((option) => option.count > 0 || option.value === severity),
            onChange: (value) => reset(() => setSeverity(value)),
          },
          {
            id: "checker",
            label: "Checked by",
            value: checker,
            options: [
              { value: "code", label: "Code", count: count((card) => card.checker === "code") },
              { value: "ai", label: "AI", count: count((card) => card.checker === "ai") },
            ].filter((option) => option.count > 0 || option.value === checker),
            onChange: (value) => reset(() => setChecker(value)),
          },
          {
            id: "type",
            label: "Type",
            value: type,
            // A chosen type stays listed even if no rule has it any more, so the filter never hides itself.
            options: [...new Set([...types, ...(type ? [type] : [])])].map((value) => ({ value, label: itemTypeLabel(value), count: count((card) => card.appliesTo.includes(value)) })),
            onChange: (value) => reset(() => setType(value)),
          },
        ]}
        shown={filtered.length}
        total={cards.length}
        onClear={() => reset(() => { setSearch(""); setSeverity(""); setChecker(""); setType(""); })}
      />

      {filtered.length === 0 ? (
        <EmptyState>No rules match these filters.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-surface shadow-sm">
          <table className="w-full min-w-[520px] text-left text-sm sm:min-w-[720px]">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">Rule</th>
                <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Checked by</th>
                <th className="px-4 py-2.5 font-medium">Applies to</th>
                <th className="px-4 py-2.5 font-medium">When</th>
                <th className="px-4 py-2.5 font-medium">Severity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shown.map((card) => (
                <tr key={card.id} className="align-top">
                  <td className="px-4 py-3">
                    <span className="mr-1.5 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-semibold text-slate-600">{card.id}</span>
                    <span className="font-medium text-slate-900">{card.title}</span>
                    {card.origin === "personal" ? <span className="ml-2 rounded bg-indigo-50 px-1.5 py-0.5 text-xs font-semibold text-indigo-700">yours</span> : null}
                    {/* On phones the "Checked by" column is folded under the title. */}
                    <span className="mt-1 block text-xs text-slate-500 sm:hidden">{checkedBy(card)}</span>
                  </td>
                  <td className="hidden px-4 py-3 text-slate-700 sm:table-cell">{checkedBy(card)}</td>
                  <td className="px-4 py-3 text-slate-700">{card.appliesTo.length === ALL_TYPES ? "All types" : card.appliesTo.map(itemTypeLabel).join(", ")}</td>
                  <td className="px-4 py-3 text-slate-700">{WHEN_LABELS[card.when] ?? card.when}</td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={SEVERITY_TONE[card.severity]}>{SEVERITY_LABELS[card.severity]}</StatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination label="Rule pages" page={current} totalPages={totalPages} total={filtered.length} pageSize={PAGE_SIZE} onChange={setPage} />
    </div>
  );
}
