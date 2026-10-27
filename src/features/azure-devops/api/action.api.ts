import { apiRequest } from "@/lib/api-client";
import type { Page } from "../types/azure.types";
import type {
  ActionListFilter,
  ActionResponse,
  ApproveActionResponse,
  AuditLogEntry,
  ProposeActionInput,
  ProposedAction,
} from "../types/action.types";

/** Proposing never changes Azure DevOps; only approveAction does. */
export async function proposeAction(input: ProposeActionInput) {
  const response = await apiRequest<ActionResponse>("/api/actions", {
    method: "POST",
    body: input,
  });
  return response.action;
}

export async function approveAction(action: Pick<ProposedAction, "id" | "payloadHash">) {
  return apiRequest<ApproveActionResponse>(
    `/api/actions/${encodeURIComponent(action.id)}/approve`,
    { method: "POST", body: { payloadHash: action.payloadHash } }
  );
}

export async function rejectAction(actionId: string, reason?: string) {
  const response = await apiRequest<ActionResponse>(
    `/api/actions/${encodeURIComponent(actionId)}/reject`,
    { method: "POST", body: reason ? { reason } : {} }
  );
  return response.action;
}

function listQuery(filter: ActionListFilter): string {
  const search = new URLSearchParams();

  if (filter.status) search.set("status", filter.status);
  if (filter.history) search.set("history", "true");
  if (filter.credentialId) search.set("credentialId", filter.credentialId);
  if (filter.projectId) search.set("projectId", filter.projectId);
  if (filter.projectName) search.set("projectName", filter.projectName);
  if (filter.page && filter.page > 1) search.set("page", String(filter.page));

  return search.size > 0 ? `?${search.toString()}` : "";
}

/** Newest first, 10 per page. */
export async function listActions(filter: ActionListFilter = {}) {
  return (await apiRequest<{ actions: Page<ProposedAction> }>(`/api/actions${listQuery(filter)}`)).actions;
}

/** Newest first, 10 per page. */
export async function listAuditLogs(filter: Omit<ActionListFilter, "status" | "history"> = {}) {
  return (await apiRequest<{ auditLogs: Page<AuditLogEntry> }>(`/api/audit-logs${listQuery(filter)}`)).auditLogs;
}
