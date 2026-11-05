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
/** The server reuses Solidtime answers for 30 s; until this time a connection's reads skip that (refresh=1). */
const freshUntil = new Map<string, number>();
/** Covers the reloads a refresh or a timer change starts at once, not later reads. */
const FRESH_WINDOW_MS = 5_000;

/** The reads of this connection started in the next few seconds ask Solidtime itself, not the server's short-lived copy. */
export function readFreshSoon(credentialId: string): void {
  freshUntil.set(credentialId, Date.now() + FRESH_WINDOW_MS);
}

/** Exposed for tests: no fresh window carried over from an earlier test. */
export function forgetFreshReads(): void {
  freshUntil.clear();
}

const read = (credentialId: string, path: string, fresh = false) => {
  const url = `${base}/${encodeURIComponent(credentialId)}${path}`;
  return fresh && !/[?&]refresh=/.test(url) ? `${url}${url.includes("?") ? "&" : "?"}refresh=1` : url;
};
/**
 * Plain reads, fresh inside the window above. Not the draft: its refresh=true is Rebuild (it re-reads Azure and
 * replaces my edits), so it only ever comes from the Rebuild button.
 */
const readLive = (credentialId: string, path: string) => read(credentialId, path, (freshUntil.get(credentialId) ?? 0) > Date.now());

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
  return (await apiRequest<{ profile: { name: string; timeZone: string } }>(readLive(credentialId, "/profile"), { signal })).profile;
}

export async function getTimer(credentialId: string, signal?: AbortSignal) {
  // The timer is what the time views are checked against, so it is always read from Solidtime itself.
  return (await apiRequest<{ timer: Timer | null }>(read(credentialId, "/timer", true), { signal })).timer;
}

export async function getCatalog(credentialId: string, signal?: AbortSignal) {
  return apiRequest<Catalog>(readLive(credentialId, "/catalog"), { signal });
}

/** `day`: list only that day's entries; totals still cover from–to. */
export async function getTimesheet(credentialId: string, input: { from: string; to: string; day?: string; page: number; ticketPage: number }) {
  const query = new URLSearchParams({ from: input.from, to: input.to, ...(input.day ? { day: input.day } : {}), page: String(input.page), ticketPage: String(input.ticketPage) });
  return (await apiRequest<{ timesheet: Timesheet }>(readLive(credentialId, `/timesheet?${query.toString()}`), SLOW_READ)).timesheet;
}

export async function getUnlinked(credentialId: string, input: { from: string; to: string; page: number }) {
  const query = new URLSearchParams({ from: input.from, to: input.to, page: String(input.page) });
  return (await apiRequest<{ entries: Page<TimesheetEntry> & { ticketsChecked: boolean } }>(readLive(credentialId, `/unlinked?${query.toString()}`), SLOW_READ)).entries;
}

export type TicketTimeResponse = { time: TicketTime; ticket: TicketInfo | null; comparison: TimeVsEstimate | null };

/** All the time ever tracked on a ticket, with its Azure fields; `refresh` reads both fresh. */
export async function getTicketTime(credentialId: string, ticketId: number, options: { refresh?: boolean } = {}) {
  return apiRequest<TicketTimeResponse>(readLive(credentialId, `/tickets/${ticketId}/time${options.refresh ? "?refresh=true" : ""}`), SLOW_READ);
}

export async function getTicketTimes(credentialId: string, ids: number[]) {
  return (await apiRequest<{ times: TicketTime[] }>(readLive(credentialId, `/ticket-times?ids=${ids.join(",")}`), SLOW_READ)).times;
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
  return (await apiRequest<{ accuracy: AccuracyReport }>(readLive(credentialId, `/reports/accuracy?${query.toString()}`), PERIOD_READ)).accuracy;
}

/** Time → Verify: each ticket I logged time on in the period, its Solidtime total next to Azure (always read fresh). */
export async function getVerification(credentialId: string, input: { from: string; to: string }) {
  const query = new URLSearchParams({ from: input.from, to: input.to, refresh: "true" });
  return (await apiRequest<{ verification: TimeVerification }>(readLive(credentialId, `/verification?${query.toString()}`), PERIOD_READ)).verification;
}

/** Time per person, day and ticket between two days, with each ticket's estimate figures. */
export const timeCsvUrl = (credentialId: string, from: string, to: string) => read(credentialId, `/reports/time.csv?from=${from}&to=${to}`);

/** The CSV export reads every entry and ticket in the range (contract 3: 150 s). */
export const TIME_CSV_TIMEOUT_MS = 150_000;

type ListKind = "projects" | "tasks" | "tags" | "clients";

export async function listCatalogPage(credentialId: string, kind: ListKind, page: number, signal?: AbortSignal) {
  const response = await apiRequest<Record<ListKind, Page<SolidtimeProject | SolidtimeTask | SolidtimeNamed>>>(readLive(credentialId, `/${kind}?page=${page}`), { signal });
  return response[kind];
}
