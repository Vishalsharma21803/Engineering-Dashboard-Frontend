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

export async function listConnections() {
  return (await apiRequest<{ connections: SolidtimeConnection[] }>(`${base}/connections`)).connections;
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

export async function listMemberships(credentialId: string) {
  return (await apiRequest<{ memberships: SolidtimeMembership[] }>(`${base}/connections/${encodeURIComponent(credentialId)}/memberships`)).memberships;
}

export async function getProfile(credentialId: string) {
  return (await apiRequest<{ profile: { name: string; timeZone: string } }>(read(credentialId, "/profile"))).profile;
}

export async function getTimer(credentialId: string) {
  return (await apiRequest<{ timer: Timer | null }>(read(credentialId, "/timer"))).timer;
}

export async function getCatalog(credentialId: string) {
  return apiRequest<Catalog>(read(credentialId, "/catalog"));
}

/** `day`: list only that day's entries; totals still cover from–to. */
export async function getTimesheet(credentialId: string, input: { from: string; to: string; day?: string; page: number; ticketPage: number }) {
  const query = new URLSearchParams({ from: input.from, to: input.to, ...(input.day ? { day: input.day } : {}), page: String(input.page), ticketPage: String(input.ticketPage) });
  return (await apiRequest<{ timesheet: Timesheet }>(read(credentialId, `/timesheet?${query.toString()}`))).timesheet;
}

export async function getUnlinked(credentialId: string, input: { from: string; to: string; page: number }) {
  const query = new URLSearchParams({ from: input.from, to: input.to, page: String(input.page) });
  return (await apiRequest<{ entries: Page<TimesheetEntry> & { ticketsChecked: boolean } }>(read(credentialId, `/unlinked?${query.toString()}`))).entries;
}

export type TicketTimeResponse = { time: TicketTime; ticket: TicketInfo | null; comparison: TimeVsEstimate | null };

/** All the time ever tracked on a ticket, with its Azure fields; `refresh` reads both fresh. */
export async function getTicketTime(credentialId: string, ticketId: number, options: { refresh?: boolean } = {}) {
  return apiRequest<TicketTimeResponse>(read(credentialId, `/tickets/${ticketId}/time${options.refresh ? "?refresh=true" : ""}`));
}

export async function getTicketTimes(credentialId: string, ids: number[]) {
  return (await apiRequest<{ times: TicketTime[] }>(read(credentialId, `/ticket-times?ids=${ids.join(",")}`))).times;
}

/** `refresh` asks the backend to read Azure DevOps and Solidtime fresh instead of from its cache. */
export async function getDraft(credentialId: string, day: string, options: { refresh?: boolean } = {}) {
  return (await apiRequest<{ draft: DayDraft }>(read(credentialId, `/draft?day=${day}${options.refresh ? "&refresh=true" : ""}`))).draft;
}

/** Asks the user's AI model for hours on drafted rows. Writes nothing; spends AI credit. */
export async function estimateDraft(credentialId: string, input: { day: string; ticketIds: number[]; plannedHours: number; planned: Array<{ start: string; end: string }> }) {
  return (await apiRequest<{ estimate: DraftEstimate }>(read(credentialId, "/draft/estimate"), { method: "POST", body: input })).estimate;
}

export async function getAccuracy(credentialId: string, input: { from: string; to: string; personPage: number; typePage: number; ticketPage: number }) {
  const query = new URLSearchParams({ from: input.from, to: input.to, personPage: String(input.personPage), typePage: String(input.typePage), ticketPage: String(input.ticketPage) });
  return (await apiRequest<{ accuracy: AccuracyReport }>(read(credentialId, `/reports/accuracy?${query.toString()}`))).accuracy;
}

/** Time → Verify: each ticket I logged time on in the period, its Solidtime total next to Azure (always read fresh). */
export async function getVerification(credentialId: string, input: { from: string; to: string }) {
  const query = new URLSearchParams({ from: input.from, to: input.to, refresh: "true" });
  return (await apiRequest<{ verification: TimeVerification }>(read(credentialId, `/verification?${query.toString()}`))).verification;
}

export const weeklyCsvUrl = (credentialId: string, week: string) => read(credentialId, `/reports/weekly.csv?week=${week}`);

type ListKind = "projects" | "tasks" | "tags" | "clients";

export async function listCatalogPage(credentialId: string, kind: ListKind, page: number) {
  const response = await apiRequest<Record<ListKind, Page<SolidtimeProject | SolidtimeTask | SolidtimeNamed>>>(read(credentialId, `/${kind}?page=${page}`));
  return response[kind];
}
