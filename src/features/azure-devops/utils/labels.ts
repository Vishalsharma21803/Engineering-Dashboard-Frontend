import type { ActionKind, ActionStatus } from "../types/action.types";
import type {
  PullRequestReviewer,
  Severity,
} from "../types/azure.types";

export type Tone = "success" | "danger" | "warning" | "info" | "neutral";

export const ACTION_KIND_LABELS: Record<ActionKind, string> = {
  WORK_ITEM_COMMENT: "Add comment",
  WORK_ITEM_UPDATE_FIELDS: "Update work fields",
  WORK_ITEM_TRANSITION_STATE: "Change state",
  WORK_ITEM_LINK_PR: "Link pull request",
  WORK_ITEM_CLOSE_AFTER_MERGE: "Close after merge",
  WORK_ITEM_EDIT_TEXT: "Replace text",
  WORK_ITEM_SET_CATEGORY: "Set category",
  WORK_ITEM_ADD_TAGS: "Add tags",
  WORK_ITEMS_UPDATE_TIME: "Update time on tickets",
  PIPELINE_QUEUE_RUN: "Queue pipeline run",
  BUILD_RETRY_STAGE: "Retry failed stage",
  BUILD_CANCEL: "Cancel run",
  SOLIDTIME_TIMER_START: "Start timer",
  SOLIDTIME_TIMER_STOP: "Stop timer",
  SOLIDTIME_ENTRY_CREATE: "Add time entry",
  SOLIDTIME_ENTRY_UPDATE: "Edit time entry",
  SOLIDTIME_ENTRY_DELETE: "Delete time entry",
  SOLIDTIME_ENTRIES_CREATE: "Add time entries",
  SOLIDTIME_PROJECT_CREATE: "Create Solidtime project",
  SOLIDTIME_TASK_CREATE: "Create Solidtime task",
  SOLIDTIME_TAG_CREATE: "Create Solidtime tag",
  SOLIDTIME_CLIENT_CREATE: "Create Solidtime client",
};

export function actionKindLabel(kind: string): string {
  return ACTION_KIND_LABELS[kind as ActionKind] ?? kind;
}

/** Status words for people ("Succeeded", not the API's "SUCCEEDED"). */
export const ACTION_STATUS_LABELS: Record<ActionStatus, string> = {
  PENDING: "Pending approval",
  APPROVED: "Approved",
  EXECUTING: "Running",
  SUCCEEDED: "Succeeded",
  FAILED: "Failed",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
};

export const ACTION_STATUS_TONES: Record<ActionStatus, Tone> = {
  PENDING: "warning",
  APPROVED: "info",
  EXECUTING: "info",
  SUCCEEDED: "success",
  FAILED: "danger",
  REJECTED: "neutral",
  EXPIRED: "neutral",
};

export const SEVERITY_TONES: Record<Severity, Tone> = {
  high: "danger",
  medium: "warning",
  low: "info",
};

export const VOTE_LABELS: Record<PullRequestReviewer["voteLabel"], { label: string; tone: Tone }> = {
  approved: { label: "Approved", tone: "success" },
  approvedWithSuggestions: { label: "Approved with suggestions", tone: "success" },
  noVote: { label: "No vote", tone: "neutral" },
  waitingForAuthor: { label: "Waiting for author", tone: "warning" },
  rejected: { label: "Rejected", tone: "danger" },
};

export function buildTone(status: string, result: string | null): Tone {
  if (status !== "completed") {
    return status === "cancelling" ? "neutral" : "info";
  }

  switch (result) {
    case "succeeded":
      return "success";
    case "failed":
      return "danger";
    case "partiallySucceeded":
      return "warning";
    default:
      return "neutral";
  }
}

export function buildLabel(status: string, result: string | null): string {
  if (status !== "completed") {
    return status === "notStarted" ? "Queued" : status === "inProgress" ? "Running" : status;
  }

  return result ?? "completed";
}

export function voteFromValue(vote: number): { label: string; tone: Tone } {
  if (vote >= 10) return VOTE_LABELS.approved;
  if (vote >= 5) return VOTE_LABELS.approvedWithSuggestions;
  if (vote <= -10) return VOTE_LABELS.rejected;
  if (vote <= -5) return VOTE_LABELS.waitingForAuthor;
  return VOTE_LABELS.noVote;
}
