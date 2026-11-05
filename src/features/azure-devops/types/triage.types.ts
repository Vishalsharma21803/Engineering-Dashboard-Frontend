export type TriageStatus = "SNOOZED" | "ACKNOWLEDGED" | "ABANDONED";

/** Personal dashboard mark stored in Relay only; never written to Azure DevOps. */
export interface TriageMark {
  id: string;
  credentialId: string;
  itemKey: string;
  status: TriageStatus;
  snoozedUntil: string | null;
  signals: string[];
  createdAt: string;
  updatedAt: string;
}

export interface UpsertTriageInput {
  credentialId: string;
  itemKey: string;
  status: TriageStatus;
  snoozedUntil?: string;
  signals: string[];
}

/** How an item should be shown after applying its own and its project's marks. */
export type TriageState = "active" | "acknowledged" | "snoozed" | "abandoned";

export interface ResolvedTriage {
  state: TriageState;
  /** The mark that decided the state; null when the item is untriaged. */
  mark: TriageMark | null;
  /** True when the item is shown again because a new problem appeared. */
  resurfaced: boolean;
  /** True when the state comes from the whole-project mark. */
  viaProject: boolean;
}
