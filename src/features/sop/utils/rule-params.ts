import type { ParamSchema, ParamSchemaProperty } from "../types/rules-list.types";

/**
 * Settings inputs built from a check's JSON Schema. Numbers are kept as typed
 * text while editing and only turned into numbers (and checked) on save.
 */

export type ParamDraft = Record<string, string | boolean | string[]>;

export type ParamKind = "number" | "boolean" | "enum" | "multi" | "text";

export function paramKind(property: ParamSchemaProperty): ParamKind {
  if (property.type === "number" || property.type === "integer") return "number";
  if (property.type === "boolean") return "boolean";
  if (property.type === "array" && property.items?.enum) return "multi";
  if (property.enum) return "enum";
  return "text";
}

export function paramEntries(schema: ParamSchema | undefined): Array<[string, ParamSchemaProperty]> {
  return Object.entries(schema?.properties ?? {});
}

export function isRequired(schema: ParamSchema | undefined, key: string): boolean {
  return schema?.required?.includes(key) ?? false;
}

/** zod writes ±MAX_SAFE_INTEGER for "no limit"; that is not a real bound. */
function bound(value: number | undefined): number | undefined {
  return value !== undefined && Math.abs(value) < Number.MAX_SAFE_INTEGER ? value : undefined;
}

export function numberBounds(property: ParamSchemaProperty) {
  return { min: bound(property.minimum), max: bound(property.maximum), above: bound(property.exclusiveMinimum) };
}

/** "Between 1 and 20", "At most 255", "More than 0". */
export function numberHint(property: ParamSchemaProperty): string | undefined {
  const { min, max, above } = numberBounds(property);
  const whole = property.type === "integer" ? "Whole number" : undefined;
  const range =
    min !== undefined && max !== undefined
      ? `between ${min} and ${max}`
      : above !== undefined && max !== undefined
        ? `more than ${above}, at most ${max}`
        : min !== undefined
          ? `at least ${min}`
          : above !== undefined
            ? `more than ${above}`
            : max !== undefined
              ? `at most ${max}`
              : undefined;

  if (!range) return whole;
  return whole ? `${whole}, ${range}` : range.charAt(0).toUpperCase() + range.slice(1);
}

/** The inputs' starting values: the rule's settings, else the check's defaults. */
export function draftFromParams(schema: ParamSchema | undefined, values: Record<string, unknown> | null): ParamDraft {
  const draft: ParamDraft = {};

  for (const [key, property] of paramEntries(schema)) {
    const value = values?.[key] ?? property.default;

    switch (paramKind(property)) {
      case "boolean":
        draft[key] = value === true;
        break;
      case "multi":
        draft[key] = Array.isArray(value) ? value.map(String) : [];
        break;
      default:
        draft[key] = value === undefined || value === null ? "" : String(value);
    }
  }

  return draft;
}

/** Turns the inputs back into settings. Empty optional inputs are left out. */
export function paramsFromDraft(schema: ParamSchema | undefined, draft: ParamDraft) {
  const params: Record<string, unknown> = {};
  const errors: Record<string, string> = {};

  for (const [key, property] of paramEntries(schema)) {
    const value = draft[key];
    const kind = paramKind(property);

    if (kind === "boolean" || kind === "multi") {
      params[key] = value ?? (kind === "boolean" ? false : []);
      continue;
    }

    const text = typeof value === "string" ? value.trim() : "";

    if (text === "") {
      if (isRequired(schema, key)) errors[key] = "Required";
      continue;
    }

    if (kind !== "number") {
      params[key] = text;
      continue;
    }

    const number = Number(text);
    const { min, max, above } = numberBounds(property);

    if (!Number.isFinite(number)) {
      errors[key] = "Enter a number";
    } else if (property.type === "integer" && !Number.isInteger(number)) {
      errors[key] = "Enter a whole number";
    } else if ((min !== undefined && number < min) || (max !== undefined && number > max) || (above !== undefined && number <= above)) {
      errors[key] = numberHint(property) ?? "Out of range";
    } else {
      params[key] = number;
    }
  }

  return { params, errors };
}

/** The settings whose value differs from `before` (a "set" edit merges them into the rule's own). */
export function changedParams(before: Record<string, unknown>, after: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(after).filter(([key, value]) => JSON.stringify(before[key]) !== JSON.stringify(value)));
}
