import type { Page } from "@/features/azure-devops/types/azure.types";

export interface SolidtimeConnection {
  credentialId: string;
  baseUrl: string;
  label: string | null;
  lastValidatedAt: string | null;
  lastValidationStatus: "VALID" | "INVALID" | "ERROR" | null;
  organizationId: string | null;
  organizationName: string | null;
  memberId: string | null;
  role: string | null;
  /** Manager, Admin or Owner: can see everyone's time. */
  canViewTeam: boolean;
  azureCredentialId: string | null;
  /** Azure project name (lower-cased) -> Solidtime project id. */
  projectMap: Record<string, string>;
  dailyTargetHours: number;
  timerAlertHours: number;
}

export interface SolidtimeMembership {
  id: string;
  organization: { id: string; name: string; currency: string };
  role: string;
}

export interface SolidtimeEntry {
  id: string;
  start: string;
  end: string | null;
  duration: number | null;
  description: string | null;
  task_id: string | null;
  project_id: string | null;
  organization_id: string;
  user_id: string;
  tags: string[];
  billable: boolean;
}

export interface SolidtimeProject {
  id: string;
  name: string;
  color: string;
  client_id: string | null;
  is_archived: boolean;
  is_billable: boolean;
  estimated_time: number | null;
  spent_time: number;
}

export interface SolidtimeTask {
  id: string;
  name: string;
  is_done: boolean;
  project_id: string;
  estimated_time: number | null;
  spent_time: number;
}

export interface SolidtimeNamed {
  id: string;
  name: string;
}

export interface Catalog {
  projects: SolidtimeProject[];
  tasks: SolidtimeTask[];
  tags: SolidtimeNamed[];
}

export interface TicketRef {
  id: number;
  title: string;
  projectName: string;
}

export interface Timer {
  entry: SolidtimeEntry;
  inThisOrganization: boolean;
  tickets: TicketRef[];
}

export interface TimesheetEntry {
  id: string;
  start: string;
  end: string | null;
  seconds: number;
  running: boolean;
  description: string | null;
  projectId: string | null;
  projectName: string | null;
  taskId: string | null;
  tags: string[];
  billable: boolean;
  tickets: TicketRef[];
}

export interface Timesheet {
  from: string;
  to: string;
  timeZone: string;
  totalSeconds: number;
  days: Array<{ day: string; seconds: number }>;
  byTicket: Page<{ ticketId: number; title: string; seconds: number }>;
  unlinkedSeconds: number;
  entries: Page<TimesheetEntry>;
  ticketsChecked: boolean;
  truncated: boolean;
}

export interface TicketTime {
  ticketId: number;
  mySeconds: number;
  teamSeconds: number | null;
  people: Array<{ name: string; seconds: number }> | null;
  running: boolean;
}

export interface TicketInfo {
  id: number;
  title: string;
  type: string;
  state: string;
  projectName: string;
  originalEstimate: number | null;
  completedWork: number | null;
  remainingWork: number | null;
}

export interface TimeVsEstimate {
  trackedHours: number;
  estimateHours: number | null;
  overEstimate: boolean;
  suggested: { completedWork: number; remainingWork: number | null };
  /** Azure's Completed Work is the tracked time, within a minute. */
  completedInSync: boolean;
  /** Azure's Remaining Work follows from it (or there is no estimate to follow). */
  remainingInSync: boolean;
  inSync: boolean;
  /** "team": everyone's time; "mine": only my own (my Solidtime role cannot read others'). */
  basis: "team" | "mine";
}

export type ProjectSource = "mapping" | "ticket" | "azure-project" | "name";

export interface DraftRow {
  ticketId: number;
  title: string;
  projectName: string;
  type: string;
  state: string;
  originalEstimate: number | null;
  completedWork: number | null;
  remainingWork: number | null;
  activity: Array<{ at: string; what: string }>;
  completedWorkAdded: number;
  completedWorkRemoved: number;
  alreadyTrackedHours: number;
  hours: number | null;
  hoursSource: "completed-work" | null;
  /** Where an entry would preferably end: my last Completed Work increase, else my last activity. */
  anchor: string;
  start: string | null;
  end: string | null;
  description: string;
  solidtimeProjectId: string | null;
  projectSource: ProjectSource | null;
  /** Several Solidtime projects match the Azure project's name, so none was chosen. */
  projectMatches: string[];
  note: string | null;
}

export interface DayDraft {
  day: string;
  timeZone: string;
  targetHours: number;
  trackedHours: number;
  busy: Array<{ start: string; end: string }>;
  rows: DraftRow[];
  truncated: boolean;
}

export interface HoursEstimate {
  ticketId: number;
  hours: number;
  confidence: "low" | "medium" | "high";
  reason: string;
  start: string | null;
  end: string | null;
}

export interface DraftEstimate {
  day: string;
  availableHours: number;
  estimates: HoursEstimate[];
  model: string | null;
  costUsd: number;
}

export interface AccuracyRow {
  key: string;
  label: string;
  tickets: number;
  trackedHours: number;
  estimateHours: number;
  ratio: number | null;
  overEstimate: number;
}

export interface AccuracyTicket {
  ticketId: number;
  title: string;
  type: string;
  projectName: string;
  trackedHours: number;
  estimateHours: number;
  ratio: number;
}

export interface AccuracyReport {
  from: string;
  to: string;
  team: boolean;
  totals: { tickets: number; trackedHours: number; estimateHours: number; ratio: number | null; overEstimate: number };
  byTicket: Page<AccuracyTicket>;
  byPerson: Page<AccuracyRow>;
  byType: Page<AccuracyRow>;
  ticketsWithoutEstimate: number;
}

/**
 * Time → Verify, per ticket, Completed Work in Azure against the Solidtime total:
 * matched · missing (no Completed Work in Azure) · mismatch (Azure has less) · azure-higher (never lowered) ·
 * remaining (Completed Work equal, only Remaining Work out of date) · running (my timer is on it) ·
 * cannot-update (the type has no Completed Work).
 */
export type VerificationStatus = "missing" | "mismatch" | "azure-higher" | "remaining" | "running" | "cannot-update" | "matched";

export interface VerificationItem {
  ticketId: number;
  title: string;
  type: string;
  state: string;
  projectName: string;
  /** My hours on it in the chosen period. */
  periodHours: number;
  /** Solidtime total over all time (the team's when visible, else mine). */
  trackedHours: number;
  azure: { completedWork: number | null; remainingWork: number | null; originalEstimate: number | null };
  suggested: { completedWork: number; remainingWork: number | null };
  status: VerificationStatus;
  /** Resolved, closed or removed: the work is done. */
  finished: boolean;
}

export interface TimeVerification {
  from: string;
  to: string;
  basis: "team" | "mine";
  items: VerificationItem[];
  notFound: Array<{ ticketId: number; periodHours: number }>;
  unlinkedHours: number;
  counts: Record<VerificationStatus, number>;
}
