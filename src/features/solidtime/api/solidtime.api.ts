import { apiRequest } from "@/lib/api-client";
import type { Page } from "@/features/azure-devops/types/azure.types";
import type {
  AccuracyReport,
  Catalog,
  DayDraft,
  DraftEstimate,
  SolidtimeConnection,
  SolidtimeMembership,
  SolidtimeNamed,
  SolidtimeProject,
  SolidtimeTask,
  TicketInfo,
  TicketTime,
  TimeVerification,
  TimeVsEstimate,
  Timer,
  Timesheet,
  TimesheetEntry,
} from "../types/solidtime.types";

/** Everything goes through the backend; the token never reaches the browser. */
const base = "/api/solidtime";
const read = (credentialId: string, path: string) => `${base}/${encodeURIComponent(credentialId)}${path}`;

/*
 * Timeouts (contract 3): reads that combine Solidtime with Azure DevOps get 120 s; building
 * a day's draft, verification and accuracy 150 s. Only short reads take TanStack's `signal` (see azure.api.ts).
 */
const SLOW_READ = { timeoutMs: 120_000 };
const DRAFT_READ = { timeoutMs: 150_000 };
/** Verification and accuracy run several Solidtime and Azure passes over a period. */
const PERIOD_READ = { timeoutMs: 150_000 };

/** Shown when the AI estimate times out: the server may still finish it and bill it. */
export const ESTIMATE_TIMEOUT_TEXT =
  "The AI estimate did not finish within 270 s. It may still finish; the AI cost may already be counted.";

export async function listConnections(signal?: AbortSignal) {
  return (await apiRequest<{ connections: SolidtimeConnection[] }>(`${base}/connections`, { signal })).connections;
}

export type ConnectionChange = Partial<{
  label: string | null;
  token: string;
  organizationId: string;
  azureCredentialId: string | null;
  projectMap: Record<string, string>;
  dailyTargetHours: number;
  timerAlertHours: number;
}>;

export async function updateConnection(credentialId: string, change: ConnectionChange) {
  return (await apiRequest<{ connection: SolidtimeConnection }>(`${base}/connections/${encodeURIComponent(credentialId)}`, { method: "PATCH", body: change })).connection;
}

export async function validateConnection(credentialId: string) {
  return apiRequest<{ valid: boolean; lastValidatedAt: string }>(`${base}/connections/${encodeURIComponent(credentialId)}/validate`, { method: "POST" });
}

export async function listMemberships(credentialId: string, signal?: AbortSignal) {
  return (await apiRequest<{ memberships: SolidtimeMembership[] }>(`${base}/connections/${encodeURIComponent(credentialId)}/memberships`, { signal })).memberships;
}

export async function getProfile(credentialId: string, signal?: AbortSignal) {
  return (await apiRequest<{ profile: { name: string; timeZone: string } }>(read(credentialId, "/profile"), { signal })).profile;
}

export async function getTimer(credentialId: string, signal?: AbortSignal) {
  return (await apiRequest<{ timer: Timer | null }>(read(credentialId, "/timer"), { signal })).timer;
}

export async function getCatalog(credentialId: string, signal?: AbortSignal) {
  return apiRequest<Catalog>(read(credentialId, "/catalog"), { signal });
}

/** `day`: list only that day's entries; totals still cover from–to. */
export async function getTimesheet(credentialId: string, input: { from: string; to: string; day?: string; page: number; ticketPage: number }) {
  const query = new URLSearchParams({ from: input.from, to: input.to, ...(input.day ? { day: input.day } : {}), page: String(input.page), ticketPage: String(input.ticketPage) });
  return (await apiRequest<{ timesheet: Timesheet }>(read(credentialId, `/timesheet?${query.toString()}`), SLOW_READ)).timesheet;
}

export async function getUnlinked(credentialId: string, input: { from: string; to: string; page: number }) {
  const query = new URLSearchParams({ from: input.from, to: input.to, page: String(input.page) });
  return (await apiRequest<{ entries: Page<TimesheetEntry> & { ticketsChecked: boolean } }>(read(credentialId, `/unlinked?${query.toString()}`), SLOW_READ)).entries;
}

export type TicketTimeResponse = { time: TicketTime; ticket: TicketInfo | null; comparison: TimeVsEstimate | null };

/** All the time ever tracked on a ticket, with its Azure fields; `refresh` reads both fresh. */
export async function getTicketTime(credentialId: string, ticketId: number, options: { refresh?: boolean } = {}) {
  return apiRequest<TicketTimeResponse>(read(credentialId, `/tickets/${ticketId}/time${options.refresh ? "?refresh=true" : ""}`), SLOW_READ);
}

export async function getTicketTimes(credentialId: string, ids: number[]) {
  return (await apiRequest<{ times: TicketTime[] }>(read(credentialId, `/ticket-times?ids=${ids.join(",")}`), SLOW_READ)).times;
}

/** `refresh` asks the backend to read Azure DevOps and Solidtime fresh instead of from its cache. */
export async function getDraft(credentialId: string, day: string, options: { refresh?: boolean } = {}) {
  return (await apiRequest<{ draft: DayDraft }>(read(credentialId, `/draft?day=${day}${options.refresh ? "&refresh=true" : ""}`), DRAFT_READ)).draft;
}

/** Asks the user's AI model for hours on drafted rows. Writes nothing; spends AI credit. */
export async function estimateDraft(credentialId: string, input: { day: string; ticketIds: number[]; planned: Array<{ start: string; end: string }> }) {
  // Builds the draft (up to 150 s) and then asks the AI (up to 120 s): 270 s in all.
  return (
    await apiRequest<{ estimate: DraftEstimate }>(read(credentialId, "/draft/estimate"), {
      method: "POST",
      body: input,
      timeoutMs: 270_000,
      timeoutMessage: ESTIMATE_TIMEOUT_TEXT,
    })
  ).estimate;
}

export async function getAccuracy(credentialId: string, input: { from: string; to: string; personPage: number; typePage: number; ticketPage: number }) {
  const query = new URLSearchParams({ from: input.from, to: input.to, personPage: String(input.personPage), typePage: String(input.typePage), ticketPage: String(input.ticketPage) });
  return (await apiRequest<{ accuracy: AccuracyReport }>(read(credentialId, `/reports/accuracy?${query.toString()}`), PERIOD_READ)).accuracy;
}

/** Time → Verify: each ticket I logged time on in the period, its Solidtime total next to Azure (always read fresh). */
export async function getVerification(credentialId: string, input: { from: string; to: string }) {
  const query = new URLSearchParams({ from: input.from, to: input.to, refresh: "true" });
  return (await apiRequest<{ verification: TimeVerification }>(read(credentialId, `/verification?${query.toString()}`), PERIOD_READ)).verification;
}

/** Time per person, day and ticket between two days, with each ticket's estimate figures. */
export const timeCsvUrl = (credentialId: string, from: string, to: string) => read(credentialId, `/reports/time.csv?from=${from}&to=${to}`);

/** The CSV export reads every entry and ticket in the range (contract 3: 150 s). */
export const TIME_CSV_TIMEOUT_MS = 150_000;

type ListKind = "projects" | "tasks" | "tags" | "clients";

export async function listCatalogPage(credentialId: string, kind: ListKind, page: number, signal?: AbortSignal) {
  const response = await apiRequest<Record<ListKind, Page<SolidtimeProject | SolidtimeTask | SolidtimeNamed>>>(read(credentialId, `/${kind}?page=${page}`), { signal });
  return response[kind];
}
