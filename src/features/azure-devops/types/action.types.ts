export type ActionKind =
  | "WORK_ITEM_COMMENT"
  | "WORK_ITEM_UPDATE_FIELDS"
  | "WORK_ITEM_TRANSITION_STATE"
  | "WORK_ITEM_LINK_PR"
  | "WORK_ITEM_CLOSE_AFTER_MERGE"
  | "PIPELINE_QUEUE_RUN"
  | "BUILD_RETRY_STAGE"
  | "BUILD_CANCEL";

export type ActionStatus =
  | "PENDING"
  | "APPROVED"
  | "EXECUTING"
  | "SUCCEEDED"
  | "FAILED"
  | "REJECTED"
  | "EXPIRED";

export interface PreviewChange {
  field: string;
  before: string | number | null;
  after: string | number | null;
}

export interface Verification {
  verified: boolean;
  checks: Array<{ check: string; passed: boolean }>;
}

export interface ProposedAction {
  id: string;
  credentialId: string | null;
  organizationUrl: string;
  projectId: string;
  kind: ActionKind;
  source: "RECOMMENDATION" | "USER";
  target: Record<string, string | number>;
  params: Record<string, unknown>;
  preview: PreviewChange[];
  summary: string;
  payloadHash: string;
  baseRev: number | null;
  status: ActionStatus;
  expiresAt: string;
  decidedAt: string | null;
  executedAt: string | null;
  result: (Record<string, unknown> & { verification?: Verification }) | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProposeActionInput {
  credentialId: string;
  kind: ActionKind;
  source?: "RECOMMENDATION" | "USER";
  target: Record<string, string | number>;
  params: Record<string, unknown>;
}

export type AuditEvent =
  | "PROPOSED"
  | "APPROVED"
  | "REJECTED"
  | "EXPIRED"
  | "EXECUTION_STARTED"
  | "EXECUTION_SUCCEEDED"
  | "EXECUTION_FAILED";

export interface AuditLogEntry {
  id: string;
  actionId: string | null;
  event: AuditEvent;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface ActionResponse {
  message: string;
  action: ProposedAction;
}

export interface ApproveActionResponse extends ActionResponse {
  verification: Verification;
}

/** Body of a failed approval (execution ran and failed). */
export interface ActionFailurePayload {
  message: string;
  reason: string;
  action?: ProposedAction;
}
