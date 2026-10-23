import { apiRequest } from "@/lib/api-client";
import type { TriageMark, UpsertTriageInput } from "../types/triage.types";

/** Triage is stored in Cockpit only; none of these calls change Azure DevOps. */
export async function listTriage(credentialId: string) {
  const response = await apiRequest<{ marks: TriageMark[] }>(
    `/api/triage?credentialId=${encodeURIComponent(credentialId)}`
  );
  return response.marks;
}

export async function upsertTriage(input: UpsertTriageInput) {
  const response = await apiRequest<{ mark: TriageMark }>("/api/triage", {
    method: "PUT",
    body: input,
  });
  return response.mark;
}

export async function clearTriage(markId: string): Promise<void> {
  await apiRequest<{ message: string }>(`/api/triage/${encodeURIComponent(markId)}`, {
    method: "DELETE",
  });
}
