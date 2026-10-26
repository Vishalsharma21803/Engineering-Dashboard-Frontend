import { apiRequest } from "@/lib/api-client";
import type {
  AiCheck,
  AzureSopProject,
  ProjectChange,
  ProjectSettings,
  ProjectSetUp,
  ProjectSuggestion,
  EffectiveRules,
  EnqueueAiResult,
  RulebookContent,
  RulebookScope,
  RulebookVersionInfo,
  SopReport,
  SopTestInput,
  SopTestResult,
  ValidationResult,
} from "../types/sop.types";

const BASE: Record<RulebookScope, string> = {
  default: "/api/sop/rulebook",
  personal: "/api/sop/my-rules",
};

export async function getRulebook(scope: RulebookScope) {
  return (await apiRequest<{ rulebook: RulebookContent }>(BASE[scope])).rulebook;
}

export async function listRulebookVersions(scope: RulebookScope) {
  return (await apiRequest<{ versions: RulebookVersionInfo[] }>(`${BASE[scope]}/versions`)).versions;
}

export async function getRulebookVersion(scope: RulebookScope, version: number) {
  return (await apiRequest<{ rulebook: RulebookContent }>(`${BASE[scope]}/versions/${version}`)).rulebook;
}

export async function saveRulebook(scope: RulebookScope, content: string, note?: string) {
  return (
    await apiRequest<{ rulebook: RulebookContent }>(BASE[scope], {
      method: "PUT",
      body: scope === "default" && note ? { content, note } : { content },
    })
  ).rulebook;
}

export async function validateRulebook(scope: RulebookScope, content: string) {
  return apiRequest<ValidationResult>("/api/sop/validate", { method: "POST", body: { content, scope } });
}

export async function getEffectiveRules() {
  return apiRequest<EffectiveRules>("/api/sop/effective");
}

/** Runs saved or draft rules on one real ticket; read-only. */
export async function testRulesOnTicket(credentialId: string, input: SopTestInput) {
  return apiRequest<SopTestResult>(`/api/sop/test/${encodeURIComponent(credentialId)}`, { method: "POST", body: input });
}

export async function enqueueAiChecks(credentialId: string, workItemIds: number[], force = false) {
  return apiRequest<EnqueueAiResult>(`/api/sop/ai/${encodeURIComponent(credentialId)}/check`, {
    method: "POST",
    body: { workItemIds, force },
  });
}

export async function listAiChecks(credentialId: string, workItemIds: number[]) {
  const ids = workItemIds.join(",");
  return (await apiRequest<{ checks: AiCheck[] }>(`/api/sop/ai/${encodeURIComponent(credentialId)}/results?ids=${ids}`)).checks;
}

/** Team report for one project: default rules, code rules, whole team. */
/** The report with its tickets-with-gaps list paged (10 per page). `refresh` rebuilds it on the server. */
export async function getSopReport(credentialId: string, projectId: string, page: number, refresh = false) {
  const query = new URLSearchParams({ page: String(page), ...(refresh ? { refresh: "1" } : {}) });
  return (
    await apiRequest<{ report: SopReport }>(
      `/api/azure/${encodeURIComponent(credentialId)}/projects/${encodeURIComponent(projectId)}/sop-report?${query.toString()}`
    )
  ).report;
}

/* Projects: anyone may set one up; each user chooses which are checked for them. */

export async function listSopProjects() {
  return (await apiRequest<{ projects: ProjectSetUp[] }>("/api/sop/projects")).projects;
}

export async function listAzureProjectsForSop(credentialId: string) {
  return (await apiRequest<{ projects: AzureSopProject[] }>(`/api/sop/azure-projects/${encodeURIComponent(credentialId)}`)).projects;
}

export async function getProjectSuggestion(credentialId: string, projectId: string) {
  return (
    await apiRequest<{ suggestion: ProjectSuggestion }>(
      `/api/sop/azure-projects/${encodeURIComponent(credentialId)}/${encodeURIComponent(projectId)}/suggestion`
    )
  ).suggestion;
}

export async function saveProjectSetUp(projectName: string, settings: ProjectSettings) {
  return (
    await apiRequest<{ project: Omit<ProjectSetUp, "checkedForMe"> }>(`/api/sop/projects/${encodeURIComponent(projectName)}`, {
      method: "PUT",
      body: { settings },
    })
  ).project;
}

export async function removeProjectSetUp(projectName: string) {
  await apiRequest(`/api/sop/projects/${encodeURIComponent(projectName)}`, { method: "DELETE" });
}

export async function listProjectChanges(projectName: string) {
  return (await apiRequest<{ changes: ProjectChange[] }>(`/api/sop/projects/${encodeURIComponent(projectName)}/history`)).changes;
}

export async function setProjectChecked(projectName: string, checked: boolean) {
  await apiRequest(`/api/sop/projects/${encodeURIComponent(projectName)}/checked`, { method: "PUT", body: { checked } });
}
