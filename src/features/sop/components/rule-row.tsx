import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { SelectField } from "@/components/ui/select-field";
import { StatusBadge } from "@/features/azure-devops/components/status-badge";
import { cn } from "@/utils/cn";
import { useEditRules } from "../hooks/use-sop";
import type { CheckInfo, RuleEdit, RuleListItem } from "../types/rules-list.types";
import type { RulebookScope, RuleSeverity } from "../types/sop.types";
import { ruleEditErrorText } from "../utils/rule-edit-errors";
import { AI_REVIEW_NOTES, ITEM_KINDS, SEVERITY_LABELS, SEVERITY_ORDER, checkerLabel, itemTypeLabel } from "../utils/rule-labels";
import { paramEntries } from "../utils/rule-params";
import { RuleParamsForm } from "./rule-params-form";

const SEVERITY_TONE: Record<RuleSeverity, "danger" | "warning" | "info" | "neutral"> = {
  fail: "danger",
  warn: "warning",
  notice: "info",
  off: "neutral",
};

interface RuleRowProps {
  rule: RuleListItem;
  check: CheckInfo | undefined;
  scope: RulebookScope;
  editable: boolean;
  /** The rulebook version the list was loaded from; every edit is made on it. */
  baseVersion: number;
  onSaved: () => void;
}

/**
 * One rule in the rules list. The level saves as soon as it is picked;
 * settings save with their own button. Each row has its own save state, so a
 * slow or failed save only disables and explains that row.
 */
export function RuleRow({ rule, check, scope, editable, baseVersion, onSaved }: RuleRowProps) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const edit = useEditRules(scope);
  const titleId = useId();
  const panelId = useId();
  const busy = edit.isPending;

  async function send(change: RuleEdit, success: string, note: string) {
    setMessage(null);

    try {
      // mutateAsync, not mutate: a removed row unmounts before the save settles, and onSaved must still run.
      await edit.mutateAsync({ baseVersion, edits: [change], note: `${rule.id}: ${note}` });
      setMessage({ tone: "success", text: success });
      onSaved();
    } catch (error) {
      setMessage({ tone: "error", text: ruleEditErrorText(error) });
    }
  }

  const pending = edit.variables?.edits[0];
  const level = busy && pending?.op === "set" && pending.severity ? pending.severity : rule.severity;
  const changedDefault = scope === "personal" && rule.defaults !== null && !rule.custom;
  const canRemove = editable && (scope === "default" || rule.custom);
  const hasParams = paramEntries(check?.params).length > 0;
  const appliesTo = rule.appliesTo.length === ITEM_KINDS.length ? "All types" : rule.appliesTo.map(itemTypeLabel).join(", ");

  return (
    <li aria-labelledby={titleId} className={cn("px-4 py-3", busy && "opacity-70")}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-600">{rule.id}</span>
            <span id={titleId} className="break-words font-medium text-slate-900">
              {rule.title}
            </span>
            {rule.origin === "personal" ? <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] font-semibold text-indigo-700">yours</span> : null}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {rule.checker === "ai" ? "AI review only" : rule.uses ? `Code · ${checkerLabel(rule.uses)}` : "Code"}
            <span aria-hidden="true"> · </span>
            <span className="sr-only">, applies to </span>
            {appliesTo}
            {changedDefault && rule.defaults ? ` · default level ${SEVERITY_LABELS[rule.defaults.severity]}` : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
          {busy ? <Spinner className="size-4 text-slate-400" /> : null}
          {editable ? (
            <SelectField
              aria-label={`Level for ${rule.id}`}
              size="sm"
              className="w-32"
              value={level}
              disabled={busy}
              onValueChange={(selected) => {
                const severity = selected as RuleSeverity;
                void send({ op: "set", id: rule.id, severity }, `Level set to ${SEVERITY_LABELS[severity]}.`, `level set to ${SEVERITY_LABELS[severity]}`);
              }}
            >
              {SEVERITY_ORDER.map((value) => (
                <option key={value} value={value}>
                  {SEVERITY_LABELS[value]}
                </option>
              ))}
            </SelectField>
          ) : (
            <StatusBadge tone={SEVERITY_TONE[rule.severity]}>{SEVERITY_LABELS[rule.severity]}</StatusBadge>
          )}
          <Button size="sm" variant="ghost" aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={() => setOpen(!open)}>
            Settings
          </Button>
          {changedDefault ? (
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => void send({ op: "reset", id: rule.id }, "Back to the default.", "reset to default")}>
              Reset to default
            </Button>
          ) : null}
          {editable && scope === "default" && rule.inStarter ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              title="Bring back the built-in starter version of this rule"
              onClick={() => void send({ op: "reset", id: rule.id }, "Restored the starter version.", "restored the starter version")}
            >
              Reset to starter
            </Button>
          ) : null}
          {canRemove ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
              onClick={() => {
                const question =
                  scope === "default" ? `Remove ${rule.id} from the default rules for everyone?` : `Remove your rule ${rule.id}?`;
                if (window.confirm(`${question} Earlier versions stay in the history.`)) {
                  void send({ op: "remove", id: rule.id }, "Removed.", "removed");
                }
              }}
            >
              Remove
            </Button>
          ) : null}
        </div>
      </div>

      {message ? (
        <p role={message.tone === "error" ? "alert" : "status"} className={cn("mt-2 text-sm", message.tone === "error" ? "text-rose-600" : "text-emerald-700")}>
          {message.text}
        </p>
      ) : null}

      {open ? (
        <div id={panelId} className="mt-3 flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Rule</p>
            <p className="mt-1 whitespace-pre-line break-words text-slate-700">{rule.rule || "No rule text."}</p>
          </div>

          {rule.checker === "ai" ? (
            <>
              {rule.passesWhen ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Passes when</p>
                  <p className="mt-1 whitespace-pre-line break-words text-slate-700">{rule.passesWhen}</p>
                </div>
              ) : null}
              {rule.failsWhen ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Fails when</p>
                  <p className="mt-1 whitespace-pre-line break-words text-slate-700">{rule.failsWhen}</p>
                </div>
              ) : null}
              <p className="text-xs text-slate-500">Judged by your AI model on the ticket page only.</p>
            </>
          ) : check ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Check: {checkerLabel(check.name)}</p>
              <p className="mt-1 text-slate-700">{check.description}</p>
              {check.aiReview ? <p className="mt-1 text-xs text-slate-500">{AI_REVIEW_NOTES[check.aiReview]}</p> : null}
            </div>
          ) : (
            <p className="text-xs text-amber-700">This rule uses a check that no longer exists ({rule.uses}).</p>
          )}

          {rule.checker === "code" && check ? (
            hasParams ? (
              <RuleParamsForm
                // A new saved version brings new values: start the inputs again from them.
                key={JSON.stringify(rule.params)}
                ruleId={rule.id}
                schema={check.params}
                values={rule.params}
                editable={editable}
                saving={busy}
                onSave={(params) => void send({ op: "set", id: rule.id, params }, "Settings saved.", "settings changed")}
              />
            ) : (
              <p className="text-xs text-slate-500">This check has no settings.</p>
            )
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
