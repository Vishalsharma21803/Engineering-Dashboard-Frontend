import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusNotice } from "@/components/ui/status-notice";
import { EmptyState } from "@/features/azure-devops/components/feedback";
import { FilterBar } from "@/features/azure-devops/components/filter-bar";
import type { CheckInfo, RuleListItem, RuleWhen } from "../types/rules-list.types";
import type { RulebookScope } from "../types/sop.types";
import { SEVERITY_LABELS, SEVERITY_ORDER, WHEN_GROUP_LABELS, WHEN_ORDER } from "../utils/rule-labels";
import { AddRuleForm } from "./add-rule-form";
import { RuleRow } from "./rule-row";

interface RulesListProps {
  scope: RulebookScope;
  rules: RuleListItem[];
  checks: CheckInfo[];
  /** False shows the rules read-only (the default rules, for anyone who is not an SOP owner). */
  editable: boolean;
  baseVersion: number;
  /** After any saved change, so views of the same rulebook (the Markdown editor) can reload. */
  onSaved: () => void;
}

function isKnownWhen(value: string): value is RuleWhen {
  return (WHEN_ORDER as string[]).includes(value);
}

/**
 * The rules grouped by the stage they are checked at, in the order a ticket
 * meets them. No pages: a rulebook is a few dozen rules, and search plus the
 * level filter narrow it down.
 */
export function RulesList({ scope, rules, checks, editable, baseVersion, onSaved }: RulesListProps) {
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState("");
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState<string | null>(null);

  const query = search.trim().toLowerCase();
  const filtered = rules.filter((rule) => (!query || `${rule.id} ${rule.title}`.toLowerCase().includes(query)) && (!level || rule.severity === level));
  // A stage the list does not know yet still gets its own group, after the known ones.
  const stages = [...WHEN_ORDER, ...new Set(rules.map((rule) => rule.when).filter((when) => !isKnownWhen(when)))];
  const groups = stages
    .map((when) => ({ when, label: isKnownWhen(when) ? WHEN_GROUP_LABELS[when] : when, rules: filtered.filter((rule) => rule.when === when) }))
    .filter((group) => group.rules.length > 0);
  const checkByName = new Map(checks.map((check) => [check.name, check]));

  return (
    <div className="flex flex-col gap-4">
      {editable ? (
        adding ? (
          <AddRuleForm
            scope={scope}
            checks={checks}
            baseVersion={baseVersion}
            onSaved={onSaved}
            onDone={(message) => {
              setAdding(false);
              setAdded(message);
            }}
          />
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              size="sm"
              onClick={() => {
                setAdded(null);
                setAdding(true);
              }}
            >
              {scope === "default" ? "Add rule" : "Add my rule"}
            </Button>
            {added ? (
              <StatusNotice as="span" className="text-sm text-emerald-700">
                {added}
              </StatusNotice>
            ) : null}
          </div>
        )
      ) : null}

      <FilterBar
        search={{ value: search, onChange: setSearch, placeholder: "Search rule id or title" }}
        filters={[
          {
            id: "level",
            label: "Level",
            value: level,
            options: SEVERITY_ORDER.map((value) => ({ value, label: SEVERITY_LABELS[value], count: rules.filter((rule) => rule.severity === value).length })).filter(
              (option) => option.count > 0 || option.value === level
            ),
            onChange: setLevel,
          },
        ]}
        shown={filtered.length}
        total={rules.length}
        onClear={() => {
          setSearch("");
          setLevel("");
        }}
      />

      {groups.length === 0 ? (
        <EmptyState>{rules.length === 0 ? "No rules yet." : "No rules match these filters."}</EmptyState>
      ) : (
        groups.map((group) => {
          const headingId = `${scope}-rules-${group.when}`;
          return (
            <section key={group.when} aria-labelledby={headingId} className="flex flex-col gap-2">
              <h3 id={headingId} className="text-sm font-semibold text-slate-900">
                {group.label} <span className="font-normal text-slate-500">({group.rules.length})</span>
              </h3>
              <Card className="overflow-hidden">
                <ul className="divide-y divide-slate-100">
                  {group.rules.map((rule) => (
                    <RuleRow
                      key={rule.id}
                      rule={rule}
                      check={rule.uses ? checkByName.get(rule.uses) : undefined}
                      scope={scope}
                      editable={editable}
                      baseVersion={baseVersion}
                      onSaved={onSaved}
                    />
                  ))}
                </ul>
              </Card>
            </section>
          );
        })
      )}
    </div>
  );
}
