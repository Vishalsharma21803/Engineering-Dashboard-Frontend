import { apiRequest } from "@/lib/api-client";
import type {
  ActionResponse,
  ActionStatus,
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

export async function listActions(filter: { status?: ActionStatus; credentialId?: string } = {}) {
  const search = new URLSearchParams();

  if (filter.status) search.set("status", filter.status);
  if (filter.credentialId) search.set("credentialId", filter.credentialId);

  const suffix = search.size > 0 ? `?${search.toString()}` : "";
  const response = await apiRequest<{ actions: ProposedAction[] }>(`/api/actions${suffix}`);
  return response.actions;
}

export async function listAuditLogs(actionId?: string) {
  const suffix = actionId ? `?actionId=${encodeURIComponent(actionId)}` : "";
  const response = await apiRequest<{ auditLogs: AuditLogEntry[] }>(`/api/audit-logs${suffix}`);
  return response.auditLogs;
}
