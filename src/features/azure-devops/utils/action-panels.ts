/** The ticket page's change forms, each in its own dialog. */
export type ActionPanel = "comment" | "fields" | "state" | "pr";

/** Which form a suggested action that needs input opens. */
export const PANEL_FOR_KIND: Partial<Record<string, ActionPanel>> = {
  WORK_ITEM_COMMENT: "comment",
  WORK_ITEM_UPDATE_FIELDS: "fields",
  WORK_ITEM_TRANSITION_STATE: "state",
  WORK_ITEM_LINK_PR: "pr",
};
