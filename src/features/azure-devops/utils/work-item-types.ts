export interface TypeStyle {
  /** Short label used in compact lists. */
  short: string;
  chip: string;
  bar: string;
  icon: string;
}

/** Azure DevOps-like colors so each work item type is recognizable at a glance. */
const TYPE_STYLES: Record<string, TypeStyle> = {
  "User Story": { short: "Story", chip: "bg-sky-50 text-sky-700 ring-sky-200", bar: "bg-sky-500", icon: "M4 3h12v14l-6-3-6 3V3Z" },
  "Product Backlog Item": { short: "PBI", chip: "bg-sky-50 text-sky-700 ring-sky-200", bar: "bg-sky-500", icon: "M4 3h12v14l-6-3-6 3V3Z" },
  Requirement: { short: "Req", chip: "bg-sky-50 text-sky-700 ring-sky-200", bar: "bg-sky-500", icon: "M4 3h12v14l-6-3-6 3V3Z" },
  Bug: { short: "Bug", chip: "bg-rose-50 text-rose-700 ring-rose-200", bar: "bg-rose-500", icon: "M10 3a4 4 0 0 1 4 4v1h2v2h-2v1h2v2h-2a4 4 0 0 1-8 0H4v-2h2v-1H4V8h2V7a4 4 0 0 1 4-4Z" },
  Task: { short: "Task", chip: "bg-amber-50 text-amber-800 ring-amber-200", bar: "bg-amber-400", icon: "M4 4h12v12H4V4Zm3 6 2 2 4-4" },
  Feature: { short: "Feature", chip: "bg-violet-50 text-violet-700 ring-violet-200", bar: "bg-violet-500", icon: "M10 2 12.5 7.5 18 8l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5L10 2Z" },
  Epic: { short: "Epic", chip: "bg-orange-50 text-orange-700 ring-orange-200", bar: "bg-orange-500", icon: "M11 2 4 11h5l-1 7 7-9h-5l1-7Z" },
  Issue: { short: "Issue", chip: "bg-pink-50 text-pink-700 ring-pink-200", bar: "bg-pink-500", icon: "M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm0 4v5m0 3h.01" },
  "Test Case": { short: "Test", chip: "bg-teal-50 text-teal-700 ring-teal-200", bar: "bg-teal-500", icon: "M7 3h6v4l4 8a2 2 0 0 1-2 3H5a2 2 0 0 1-2-3l4-8V3Z" },
};

const FALLBACK_STYLE: TypeStyle = {
  short: "Item",
  chip: "bg-slate-50 text-slate-700 ring-slate-200",
  bar: "bg-slate-400",
  icon: "M4 4h12v12H4V4Z",
};

export function workItemTypeStyle(type: string): TypeStyle {
  return TYPE_STYLES[type] ?? { ...FALLBACK_STYLE, short: type || FALLBACK_STYLE.short };
}
