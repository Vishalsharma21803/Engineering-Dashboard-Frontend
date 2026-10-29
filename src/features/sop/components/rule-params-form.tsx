import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { ParamSchema } from "../types/rules-list.types";
import { paramLabel } from "../utils/rule-labels";
import {
  changedParams,
  draftFromParams,
  isRequired,
  numberBounds,
  numberHint,
  paramEntries,
  paramKind,
  paramsFromDraft,
  type ParamDraft,
} from "../utils/rule-params";

/** A select without a width, for callers that set their own. */
export const SELECT_BASE_CLASS =
  "h-9 min-w-0 rounded-lg border border-slate-300 bg-surface px-2 text-sm text-slate-950 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500";
export const SELECT_CLASS = `${SELECT_BASE_CLASS} w-full`;

interface RuleParamsFieldsProps {
  schema: ParamSchema | undefined;
  draft: ParamDraft;
  onChange: (draft: ParamDraft) => void;
  errors?: Record<string, string>;
  disabled?: boolean;
}

/** One input per check setting, chosen from its JSON Schema type (number, yes/no, one of, several of). */
export function RuleParamsFields({ schema, draft, onChange, errors = {}, disabled = false }: RuleParamsFieldsProps) {
  const prefix = useId();
  const set = (key: string, value: ParamDraft[string]) => onChange({ ...draft, [key]: value });

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {paramEntries(schema).map(([key, property]) => {
        const id = `${prefix}-${key}`;
        const label = `${paramLabel(key)}${isRequired(schema, key) ? "" : property.default === undefined ? " (optional)" : ""}`;
        const value = draft[key];
        const kind = paramKind(property);

        if (kind === "boolean") {
          return (
            <div key={key} className="space-y-1.5">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <input type="checkbox" checked={value === true} disabled={disabled} onChange={(event) => set(key, event.target.checked)} className="size-4 rounded border-slate-300" />
                {paramLabel(key)}
              </label>
              {property.description ? <p className="text-xs text-slate-500">{property.description}</p> : null}
            </div>
          );
        }

        if (kind === "multi") {
          const chosen = Array.isArray(value) ? value : [];
          return (
            <fieldset key={key} className="sm:col-span-2" disabled={disabled}>
              <legend className="text-sm font-medium text-slate-700">{paramLabel(key)}</legend>
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1.5">
                {(property.items?.enum ?? []).map((option) => (
                  <label key={option} className="flex items-center gap-1.5 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={chosen.includes(option)}
                      onChange={(event) => set(key, event.target.checked ? [...chosen, option] : chosen.filter((item) => item !== option))}
                      className="size-4 rounded border-slate-300"
                    />
                    {paramLabel(option)}
                  </label>
                ))}
              </div>
              {errors[key] ? <p className="mt-1 text-sm text-rose-600">{errors[key]}</p> : null}
            </fieldset>
          );
        }

        const text = typeof value === "string" ? value : "";

        if (kind === "enum") {
          return (
            <FormField key={key} id={id} label={label} {...(errors[key] ? { error: errors[key] } : property.description ? { hint: property.description } : {})}>
              <select id={id} className={SELECT_CLASS} value={text} disabled={disabled} onChange={(event) => set(key, event.target.value)}>
                {text === "" ? <option value="">Choose…</option> : null}
                {(property.enum ?? []).map((option) => (
                  <option key={option} value={option}>
                    {paramLabel(option)}
                  </option>
                ))}
              </select>
            </FormField>
          );
        }

        const { min, max } = numberBounds(property);
        const hint = kind === "number" ? numberHint(property) : property.description;
        return (
          <FormField key={key} id={id} label={label} {...(errors[key] ? { error: errors[key] } : hint ? { hint } : {})}>
            <Input
              id={id}
              type={kind === "number" ? "number" : "text"}
              inputMode={kind === "number" ? "decimal" : undefined}
              step={property.type === "integer" ? 1 : "any"}
              min={min}
              max={max}
              value={text}
              disabled={disabled}
              onChange={(event) => set(key, event.target.value)}
              className="h-9"
            />
          </FormField>
        );
      })}
    </div>
  );
}

interface RuleParamsFormProps {
  ruleId: string;
  schema: ParamSchema | undefined;
  values: Record<string, unknown> | null;
  editable: boolean;
  saving: boolean;
  /** Called with only the settings that changed. */
  onSave: (params: Record<string, unknown>) => void;
}

/** A rule's settings with an explicit Save: several inputs are often changed together, so nothing saves on each keystroke. */
export function RuleParamsForm({ ruleId, schema, values, editable, saving, onSave }: RuleParamsFormProps) {
  const [initial] = useState(() => draftFromParams(schema, values));
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);

  function save() {
    const next = paramsFromDraft(schema, draft);
    setErrors(next.errors);

    if (Object.keys(next.errors).length === 0) {
      const changed = changedParams(paramsFromDraft(schema, initial).params, next.params);
      if (Object.keys(changed).length > 0) onSave(changed);
    }
  }

  return (
    <form
      aria-label={`Settings for ${ruleId}`}
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <RuleParamsFields schema={schema} draft={draft} onChange={setDraft} errors={errors} disabled={!editable || saving} />
      {editable ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" disabled={!dirty || saving}>
            {saving ? <Spinner className="size-4" /> : null}
            Save settings
          </Button>
          {dirty && !saving ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraft(initial);
                setErrors({});
              }}
            >
              Undo changes
            </Button>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
