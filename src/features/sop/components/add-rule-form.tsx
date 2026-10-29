import { useId, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { SelectField } from "@/components/ui/select-field";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api-client";
import { useEditRules } from "../hooks/use-sop";
import type { CheckInfo, ItemKind, NewRuleCard, RuleWhen } from "../types/rules-list.types";
import type { RulebookScope, RuleSeverity } from "../types/sop.types";
import { problemText, ruleEditErrorText } from "../utils/rule-edit-errors";
import { AI_REVIEW_NOTES, ITEM_KINDS, SEVERITY_LABELS, SEVERITY_ORDER, WHEN_GROUP_LABELS, WHEN_ORDER, checkerLabel, itemTypeLabel } from "../utils/rule-labels";
import { draftFromParams, paramEntries, paramsFromDraft, type ParamDraft } from "../utils/rule-params";
import { RuleParamsFields } from "./rule-params-form";

/** Same pattern the server checks: default rule ids look like ABC-01. */
const RULE_ID = /^[A-Z][A-Z0-9]*-[A-Za-z0-9-]+$/;

interface AddRuleFormProps {
  scope: RulebookScope;
  checks: CheckInfo[];
  baseVersion: number;
  onDone: (message: string | null) => void;
  onSaved: () => void;
}

/**
 * A new rule card without writing Markdown. In "My rules" it becomes a MY-
 * rule (the server picks the id); SOP owners adding a default rule choose the id.
 */
export function AddRuleForm({ scope, checks, baseVersion, onDone, onSaved }: AddRuleFormProps) {
  const ids = useId();
  const edit = useEditRules(scope);
  const [ruleId, setRuleId] = useState("");
  const [title, setTitle] = useState("");
  const [checker, setChecker] = useState<"code" | "ai">("code");
  const [uses, setUses] = useState("");
  const [paramDraft, setParamDraft] = useState<ParamDraft>({});
  const [when, setWhen] = useState<RuleWhen | "">("");
  const [types, setTypes] = useState<ItemKind[]>([]);
  const [severity, setSeverity] = useState<RuleSeverity>("warn");
  const [rule, setRule] = useState("");
  const [passesWhen, setPassesWhen] = useState("");
  const [failsWhen, setFailsWhen] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [paramErrors, setParamErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<{ message: string; problems: string[] } | null>(null);
  const check = checks.find((item) => item.name === uses);

  function chooseCheck(name: string) {
    setUses(name);
    setParamDraft(draftFromParams(checks.find((item) => item.name === name)?.params, null));
    setParamErrors({});
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setServerError(null);

    const found: Record<string, string> = {};
    if (scope === "default" && !RULE_ID.test(ruleId.trim())) found.id = "Enter an id like ABC-01";
    if (title.trim().length < 3) found.title = "Enter a title (at least 3 characters)";
    if (checker === "code" && !check) found.uses = "Choose a check";
    if (!when) found.when = "Choose when the rule is checked";
    if (types.length === 0) found.types = "Choose at least one type";
    if (!rule.trim()) found.rule = "Describe the rule";
    if (checker === "ai" && !passesWhen.trim()) found.passesWhen = "Say when the rule passes";
    if (checker === "ai" && !failsWhen.trim()) found.failsWhen = "Say when the rule fails";
    const parsed = checker === "code" && check ? paramsFromDraft(check.params, paramDraft) : { params: {}, errors: {} };
    setErrors(found);
    setParamErrors(parsed.errors);

    if (Object.keys(found).length > 0 || Object.keys(parsed.errors).length > 0 || !when) {
      return;
    }

    const card: NewRuleCard = {
      ...(scope === "default" ? { id: ruleId.trim() } : {}),
      title: title.trim(),
      checker,
      ...(checker === "code" ? { uses, ...(Object.keys(parsed.params).length > 0 ? { params: parsed.params } : {}) } : { passesWhen: passesWhen.trim(), failsWhen: failsWhen.trim() }),
      appliesTo: types,
      when,
      severity,
      rule: rule.trim(),
    };

    try {
      await edit.mutateAsync({ baseVersion, edits: [{ op: "add", card }], note: `Added ${card.id ?? "a rule"}: ${card.title}` });
      onSaved();
      onDone(`Added "${card.title}".`);
    } catch (error) {
      // Validation problems are listed one per line under the server's message.
      const problems = error instanceof ApiError && error.status !== 409 ? error.errors.map(problemText) : [];
      setServerError({ message: problems.length > 0 && error instanceof Error ? error.message : ruleEditErrorText(error), problems });
    }
  }

  const field = (name: string) => `${ids}-${name}`;
  const errorOf = (name: string) => (errors[name] ? { error: errors[name] } : {});

  return (
    <form
      noValidate
      aria-label={scope === "default" ? "Add a default rule" : "Add my rule"}
      onSubmit={(event) => void submit(event)}
      className="flex flex-col gap-4 rounded-lg border border-indigo-200 bg-indigo-50/40 p-4"
    >
      <div>
        <h3 className="text-base font-semibold text-slate-950">{scope === "default" ? "Add a default rule" : "Add my rule"}</h3>
        <p className="text-xs text-slate-500">
          {scope === "default" ? "Default rules apply to everyone and to team reports." : "Your own rules only change your checks. The id (MY-…) is picked for you."}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {scope === "default" ? (
          <FormField id={field("id")} label="Rule id" {...(errors.id ? { error: errors.id } : { hint: "Like ABC-01" })}>
            <Input id={field("id")} value={ruleId} onChange={(event) => setRuleId(event.target.value)} className="h-9 font-mono" autoComplete="off" />
          </FormField>
        ) : null}
        <FormField id={field("title")} label="Title" {...errorOf("title")}>
          <Input id={field("title")} value={title} onChange={(event) => setTitle(event.target.value)} className="h-9" maxLength={120} />
        </FormField>
      </div>

      <fieldset>
        <legend className="text-sm font-medium text-slate-700">Checked by</legend>
        <RadioGroup name={field("checker")} value={checker} onValueChange={(value) => setChecker(value as typeof checker)} className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1.5">
          {(
            [
              ["code", "A built-in check"],
              ["ai", "AI review only"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex items-center gap-1.5 text-sm text-slate-700">
              <RadioGroupItem value={value} />
              {label}
            </label>
          ))}
        </RadioGroup>
      </fieldset>

      {checker === "code" ? (
        <div className="flex flex-col gap-3">
          <FormField id={field("uses")} label="Check" {...errorOf("uses")}>
            <SelectField id={field("uses")} size="sm" value={uses} onValueChange={(selected) => chooseCheck(selected)}>
              <option value="">Choose a check…</option>
              {checks.map((item) => (
                <option key={item.name} value={item.name}>
                  {checkerLabel(item.name)}
                </option>
              ))}
            </SelectField>
          </FormField>
          {check ? (
            <div className="text-sm">
              <p className="text-slate-700">{check.description}</p>
              {check.aiReview ? <p className="mt-1 text-xs text-slate-500">{AI_REVIEW_NOTES[check.aiReview]}</p> : null}
            </div>
          ) : null}
          {check && paramEntries(check.params).length > 0 ? (
            <RuleParamsFields schema={check.params} draft={paramDraft} onChange={setParamDraft} errors={paramErrors} />
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-slate-500">Judged by your AI model on the ticket page only.</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id={field("when")} label="When" {...errorOf("when")}>
          <SelectField id={field("when")} size="sm" value={when} onValueChange={(selected) => setWhen(selected as RuleWhen)}>
            <option value="">Choose a stage…</option>
            {WHEN_ORDER.map((value) => (
              <option key={value} value={value}>
                {WHEN_GROUP_LABELS[value]}
              </option>
            ))}
          </SelectField>
        </FormField>
        <FormField id={field("severity")} label="Level">
          <SelectField id={field("severity")} size="sm" value={severity} onValueChange={(selected) => setSeverity(selected as RuleSeverity)}>
            {SEVERITY_ORDER.map((value) => (
              <option key={value} value={value}>
                {SEVERITY_LABELS[value]}
              </option>
            ))}
          </SelectField>
        </FormField>
      </div>

      <fieldset>
        <legend className="text-sm font-medium text-slate-700">Applies to</legend>
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1.5">
          {ITEM_KINDS.map((kind) => (
            <label key={kind} className="flex items-center gap-1.5 text-sm text-slate-700">
              <Checkbox
                checked={types.includes(kind)}
                onCheckedChange={(state) => setTypes(state === true ? [...types, kind] : types.filter((item) => item !== kind))}
                
              />
              {itemTypeLabel(kind)}
            </label>
          ))}
        </div>
        {errors.types ? <p className="mt-1 text-sm text-rose-600">{errors.types}</p> : null}
      </fieldset>

      <FormField id={field("rule")} label="Rule" {...errorOf("rule")}>
        <Textarea id={field("rule")} className="min-h-20" value={rule} onChange={(event) => setRule(event.target.value)} maxLength={2000} />
      </FormField>

      {checker === "ai" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField id={field("passes")} label="Passes when" {...errorOf("passesWhen")}>
            <Textarea id={field("passes")} className="min-h-20" value={passesWhen} onChange={(event) => setPassesWhen(event.target.value)} maxLength={2000} />
          </FormField>
          <FormField id={field("fails")} label="Fails when" {...errorOf("failsWhen")}>
            <Textarea id={field("fails")} className="min-h-20" value={failsWhen} onChange={(event) => setFailsWhen(event.target.value)} maxLength={2000} />
          </FormField>
        </div>
      ) : null}

      {serverError ? (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          <p>{serverError.message}</p>
          {serverError.problems.length > 0 ? (
            <ul className="mt-1 list-disc pl-5">
              {serverError.problems.map((problem, index) => (
                <li key={index}>{problem}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={edit.isPending}>
          {edit.isPending ? <Spinner className="size-4" /> : null}
          Add rule
        </Button>
        <Button variant="ghost" disabled={edit.isPending} onClick={() => onDone(null)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
