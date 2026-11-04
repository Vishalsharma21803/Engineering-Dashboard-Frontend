import { apiRequest, stillRunningTimeoutText } from "@/lib/api-client";
import type {
  AiCheck,
  AzureSopProjectPages,
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
  SopReportFilters,
  SopReportRunList,
  SopReportRunSummary,
  SopTestInput,
  SopTestResult,
  ValidationResult,
} from "../types/sop.types";
import type { RuleEditsInput, RulesList } from "../types/rules-list.types";

/* Timeouts (contract 3): AI calls, ticket tests and report runs get 150 s; Azure-backed project reads 120 s. */
const AI_CALL_TIMEOUT_MS = 150_000;
/** These calls start work on the server: a timeout does not mean it stopped. */
const AI_CALL = { timeoutMs: AI_CALL_TIMEOUT_MS, timeoutMessage: stillRunningTimeoutText(AI_CALL_TIMEOUT_MS) };
const SLOW_READ = { timeoutMs: 120_000 };

const BASE: Record<RulebookScope, string> = {
  default: "/api/sop/rulebook",
  personal: "/api/sop/my-rules",
};

export async function getRulebook(scope: RulebookScope, signal?: AbortSignal) {
  return (await apiRequest<{ rulebook: RulebookContent }>(BASE[scope], { signal })).rulebook;
}

export async function listRulebookVersions(scope: RulebookScope, signal?: AbortSignal) {
  return (await apiRequest<{ versions: RulebookVersionInfo[] }>(`${BASE[scope]}/versions`, { signal })).versions;
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

export async function getEffectiveRules(signal?: AbortSignal) {
  return apiRequest<EffectiveRules>("/api/sop/effective", { signal });
}

/** Runs saved or draft rules on one real ticket; read-only. */
export async function testRulesOnTicket(credentialId: string, input: SopTestInput) {
  return apiRequest<SopTestResult>(`/api/sop/test/${encodeURIComponent(credentialId)}`, { method: "POST", body: input, ...AI_CALL });
}

export async function enqueueAiChecks(credentialId: string, workItemIds: number[], force = false) {
  return apiRequest<EnqueueAiResult>(`/api/sop/ai/${encodeURIComponent(credentialId)}/check`, {
    method: "POST",
    body: { workItemIds, force },
    ...AI_CALL,
  });
}

export async function listAiChecks(credentialId: string, workItemIds: number[], signal?: AbortSignal) {
  const ids = workItemIds.join(",");
  return (await apiRequest<{ checks: AiCheck[] }>(`/api/sop/ai/${encodeURIComponent(credentialId)}/results?ids=${ids}`, { signal })).checks;
}

/** Team report runs for one project: default rules, code rules, whole team; saved privately per person. */
const reportsPath = (credentialId: string, projectId: string) =>
  `/api/sop/reports/${encodeURIComponent(credentialId)}/${encodeURIComponent(projectId)}`;

/** Runs the team report now (reads Azure) and saves it for the signed-in user. */
export async function runSopReport(credentialId: string, projectId: string) {
  return (await apiRequest<{ run: SopReportRunSummary }>(reportsPath(credentialId, projectId), { method: "POST", body: {}, ...AI_CALL })).run;
}

export async function listSopReportRuns(credentialId: string, projectId: string, page: number) {
  return (await apiRequest<{ runs: SopReportRunList }>(`${reportsPath(credentialId, projectId)}?page=${page}`)).runs;
}

export async function getSopReportRun(
  credentialId: string,
  projectId: string,
  runId: string,
  input: { filters: SopReportFilters; page: number; rulePage: number; personPage: number }
) {
  const query = new URLSearchParams({
    page: String(input.page),
    rulePage: String(input.rulePage),
    personPage: String(input.personPage),
    ...Object.fromEntries(Object.entries(input.filters).filter(([, value]) => value !== "")),
  });
  return (await apiRequest<{ report: SopReport }>(`${reportsPath(credentialId, projectId)}/${encodeURIComponent(runId)}?${query.toString()}`)).report;
}

export async function deleteSopReportRun(credentialId: string, projectId: string, runId: string) {
  await apiRequest(`${reportsPath(credentialId, projectId)}/${encodeURIComponent(runId)}`, { method: "DELETE" });
}

/* Projects: anyone may set one up; each user chooses which are checked for them. */

export async function listSopProjects() {
  return (await apiRequest<{ projects: ProjectSetUp[] }>("/api/sop/projects")).projects;
}

export async function listAzureProjectsForSop(credentialId: string, input: { page: number; elsewherePage: number }) {
  const query = new URLSearchParams({ page: String(input.page), elsewherePage: String(input.elsewherePage) });
  return apiRequest<AzureSopProjectPages>(`/api/sop/azure-projects/${encodeURIComponent(credentialId)}?${query.toString()}`, SLOW_READ);
}

export async function getProjectSuggestion(credentialId: string, projectId: string) {
  return (
    await apiRequest<{ suggestion: ProjectSuggestion }>(
      `/api/sop/azure-projects/${encodeURIComponent(credentialId)}/${encodeURIComponent(projectId)}/suggestion`,
      SLOW_READ
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

/* Rules list: the rules as structured data, and edits to them (saved as a new rulebook version). */

export async function getRulesList(signal?: AbortSignal) {
  return apiRequest<RulesList>("/api/sop/rules", { signal });
}

export async function editRules(scope: RulebookScope, input: RuleEditsInput) {
  const { baseVersion, edits, note } = input;
  return (
    await apiRequest<{ rulebook: RulebookContent }>(`${BASE[scope]}/edits`, {
      method: "POST",
      body: scope === "default" && note ? { baseVersion, edits, note } : { baseVersion, edits },
    })
  ).rulebook;
}
