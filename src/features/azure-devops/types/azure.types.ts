/** Mirrors backend/src/types/azure.types.ts (responses of /api/azure/*). */

export interface IdentityRef {
  id: string | null;
  displayName: string;
  uniqueName: string | null;
}

export interface AzureIdentity {
  id: string;
  displayName: string;
  email: string | null;
}

export type ScopeStatus = "granted" | "missing" | "unknown";

export type ScopeArea =
  | "project"
  | "work"
  | "code"
  | "build"
  | "release"
  | "environment";

export type WriteScopeArea = "work" | "build";

export interface Capabilities {
  identity: AzureIdentity;
  scopes: Record<ScopeArea, ScopeStatus>;
  writeScopes: Record<WriteScopeArea, ScopeStatus>;
}

export interface ProjectSummary {
  id: string;
  name: string;
  description: string | null;
  state: string;
  visibility: string;
  lastUpdateTime: string | null;
  url: string;
}

export interface IterationSummary {
  id: string;
  name: string;
  path: string;
  startDate: string | null;
  finishDate: string | null;
}

export type SectionStatus = "ok" | "forbidden" | "error";

/** How complete a list read was. `note` is a ready-to-show sentence (null when nothing was cut or failed). */
export interface ReadCompleteness {
  /** More existed than was read (a cap was hit). */
  truncated: boolean;
  /** The cap that applied (items listed at most). */
  cap: number | null;
  /** Projects whose part of the list could not be read (names). */
  failedProjects: string[];
  note: string | null;
}

export interface Section<T> {
  status: SectionStatus;
  data: T | null;
  reason: string | null;
}

export interface ProjectOverview extends ProjectSummary {
  processTemplate: string | null;
  sourceControlType: string | null;
  defaultTeam: { id: string; name: string } | null;
  currentIteration: Section<IterationSummary | null>;
  counts: {
    repositories: Section<number>;
    myOpenWorkItems: Section<number>;
    activePullRequests: Section<number>;
    failingPipelines: Section<number>;
  };
  /** `counts.myOpenWorkItems` hit the list cap: show it as "n+". */
  myOpenWorkItemsTruncated?: boolean;
  /** `counts.activePullRequests` hit its cap: show it as "n+". */
  activePullRequestsTruncated?: boolean;
  /** More pipelines than were read: show `counts.failingPipelines` as "n+". */
  failingPipelinesTruncated?: boolean;
}

export type StateCategory =
  | "Proposed"
  | "InProgress"
  | "Resolved"
  | "Completed"
  | "Removed"
  | "Unknown";

export interface WorkItemSummary {
  id: number;
  rev: number;
  projectName: string;
  type: string;
  title: string;
  state: string;
  stateCategory: StateCategory;
  /** "guessed": the type's states could not be read, so open/closed comes from the state name. */
  stateCategorySource?: "azure" | "guessed";
  reason: string | null;
  priority: number | null;
  assignedTo: IdentityRef | null;
  iterationPath: string | null;
  areaPath: string | null;
  tags: string[];
  originalEstimate: number | null;
  remainingWork: number | null;
  completedWork: number | null;
  storyPoints: number | null;
  effort: number | null;
  dueDate: string | null;
  blocked: boolean;
  createdDate: string | null;
  changedDate: string | null;
  stateChangeDate: string | null;
  closedDate: string | null;
  commentCount: number;
  links: WorkItemLinks;
  webUrl: string;
}

export interface WorkItemLinks {
  pullRequests: Array<{
    projectId: string;
    repositoryId: string;
    pullRequestId: number;
  }>;
  commits: Array<{ repositoryId: string; commitId: string }>;
  branches: Array<{ repositoryId: string; refName: string }>;
  builds: number[];
  parentId: number | null;
  childIds: number[];
}

export interface WorkItemComment {
  id: number;
  text: string;
  createdBy: IdentityRef;
  createdDate: string;
  modifiedDate: string | null;
}

export interface WorkFieldChange {
  revisedDate: string;
  revisedBy: IdentityRef | null;
  field: "OriginalEstimate" | "RemainingWork" | "CompletedWork" | "State";
  oldValue: string | number | null;
  newValue: string | number | null;
}

export interface LinkedPullRequest {
  projectId: string;
  repositoryId: string;
  repositoryName: string | null;
  pullRequestId: number;
  title: string | null;
  status: string;
  closedDate: string | null;
  webUrl: string | null;
}

export interface WorkItemDetail extends WorkItemSummary {
  description: string;
  acceptanceCriteria: string;
  reproSteps: string;
  comments: Section<WorkItemComment[]>;
  history: Section<WorkFieldChange[]>;
  /** Part of the middle of a very long history was not read. */
  historyTruncated?: boolean;
  linkedPullRequests: Section<LinkedPullRequest[]>;
  allowedStates: Array<{ name: string; category: StateCategory }>;
  supportedFields: SupportedWorkFields;
  compliance: ComplianceResult;
  /** False when the project's SOP has a Testing stage after merge. */
  closeAfterMergeAllowed: boolean;
  /** Its parent (whoever it belongs to) and children (mine listed, others counted). */
  family: Section<WorkItemFamily>;
}

export interface WorkItemFamily {
  parent: GroupHeading | null;
  parentIsMine: boolean;
  myChildren: GroupHeading[];
  otherChildren: number;
}

export interface SupportedWorkFields {
  originalEstimate: boolean;
  remainingWork: boolean;
  completedWork: boolean;
  storyPoints: boolean;
  effort: boolean;
  priority: boolean;
}

export interface PullRequestReviewer {
  id: string;
  displayName: string;
  vote: number;
  voteLabel:
    | "approved"
    | "approvedWithSuggestions"
    | "noVote"
    | "waitingForAuthor"
    | "rejected";
  isRequired: boolean;
  hasDeclined: boolean;
}

export interface PullRequestSummary {
  projectId: string;
  projectName: string;
  repositoryId: string;
  repositoryName: string;
  pullRequestId: number;
  title: string;
  status: string;
  isDraft: boolean;
  mergeStatus: string | null;
  createdBy: IdentityRef;
  creationDate: string;
  closedDate: string | null;
  sourceBranch: string;
  targetBranch: string;
  reviewers: PullRequestReviewer[];
  approvals: number;
  rejections: number;
  unresolvedThreads: number | null;
  myRole: "author" | "reviewer" | "other";
  myVote: number | null;
  webUrl: string;
}

export interface PullRequestThread {
  id: number;
  status: string;
  filePath: string | null;
  isResolved: boolean;
  comments: Array<{
    id: number;
    author: IdentityRef;
    content: string;
    publishedDate: string | null;
  }>;
}

export interface PolicyEvaluation {
  name: string;
  status: string;
  isBlocking: boolean;
}

export interface PullRequestDetail extends PullRequestSummary {
  description: string;
  threads: Section<PullRequestThread[]>;
  policies: Section<PolicyEvaluation[]>;
  linkedWorkItemIds: Section<number[]>;
  /** Titles of the linked tickets; absent when they could not be read. Ids missing here show as "#id". */
  linkedWorkItems?: Array<{ id: number; title: string; state: string; type: string }>;
}

export interface BuildSummary {
  id: number;
  buildNumber: string;
  definitionId: number;
  definitionName: string;
  projectName: string | null;
  status: string;
  result: string | null;
  sourceBranch: string | null;
  sourceVersion: string | null;
  reason: string | null;
  requestedFor: IdentityRef | null;
  queueTime: string | null;
  startTime: string | null;
  finishTime: string | null;
  webUrl: string | null;
}

export interface PipelineSummary {
  id: number;
  name: string;
  path: string;
  queueStatus: string | null;
  latestBuild: BuildSummary | null;
  latestCompletedBuild: BuildSummary | null;
  health: "succeeded" | "failed" | "partiallySucceeded" | "canceled" | "running" | "never";
  webUrl: string | null;
}

export interface TimelineIssue {
  type: string;
  message: string;
}

export interface TimelineNode {
  id: string;
  type: string;
  name: string;
  identifier: string | null;
  state: string | null;
  result: string | null;
  startTime: string | null;
  finishTime: string | null;
  errorCount: number;
  issues: TimelineIssue[];
  logId: number | null;
}

export interface StageResult extends TimelineNode {
  jobs: Array<TimelineNode & { failedTasks: TimelineNode[] }>;
}

export interface BuildTimeline {
  buildId: number;
  stages: StageResult[];
  failedStages: string[];
}

export interface EnvironmentDeployment {
  environmentId: number;
  environmentName: string;
  lastDeployments: Array<{
    id: number;
    definitionName: string | null;
    stageName: string | null;
    result: string | null;
    startTime: string | null;
    finishTime: string | null;
    buildId: number | null;
  }>;
}

export interface ReleaseSummary {
  id: number;
  name: string;
  status: string;
  definitionName: string | null;
  createdOn: string | null;
  environments: Array<{ name: string; status: string }>;
  webUrl: string | null;
}

export interface Deployments {
  environments: Section<EnvironmentDeployment[]>;
  releases: Section<ReleaseSummary[]>;
}

export interface RepositorySummary {
  id: string;
  name: string;
  defaultBranch: string | null;
  size: number | null;
  isDisabled: boolean;
  webUrl: string | null;
}

export interface BranchSummary {
  name: string;
  objectId: string;
  creator: IdentityRef | null;
}

export interface CommitSummary {
  commitId: string;
  author: { name: string; email: string | null; date: string | null };
  comment: string;
  webUrl: string | null;
}

/** A rule card id from the SOP rulebook, e.g. "STR-05". */
export type ComplianceRuleId = string;

export type Severity = "high" | "medium" | "low";

export interface SuggestedAction {
  kind: string;
  target: Record<string, string | number>;
  params: Record<string, unknown>;
  /** True when the user must fill in values (e.g. comment text, estimate). */
  requiresInput: boolean;
}

export interface ComplianceViolation {
  ruleId: ComplianceRuleId;
  ruleTitle: string;
  checker: "code" | "ai";
  /** "fail" rules are high, "warn" rules medium, "notice" rules low. */
  severity: Severity;
  message: string;
  evidence: string[];
  suggestedAction: SuggestedAction | null;
  /** "earlier": the rule belongs to a stage the ticket has already moved past. */
  phase: "now" | "earlier";
}

export interface ComplianceRuleRef {
  ruleId: ComplianceRuleId;
  ruleTitle: string;
}

export interface ComplianceResult {
  workItemId: number;
  projectName: string;
  title: string;
  type: string;
  state: string;
  stateCategory: StateCategory;
  /** False when the project is not set up for SOP checks, or the user switched it off. */
  configured: boolean;
  /** Why a project is or is not checked. */
  sopProject: "checked" | "not-set-up" | "switched-off";
  /** -1 marks an unsaved draft (rule testing). */
  rulebook: { defaultVersion: number; personalVersion: number };
  /** SOP gaps (missed in a stage the ticket moved past, or due now): counted in badges, filters and reports. */
  violations: ComplianceViolation[];
  /** Shown on the ticket only; never counted as gaps. */
  notices: ComplianceViolation[];
  /** Needed in the ticket's current stage; not gaps yet. */
  todos: ComplianceViolation[];
  passedRules: ComplianceRuleRef[];
  skippedRules: Array<ComplianceRuleRef & { reason: string }>;
  /** Rules only AI can judge; judged on the ticket page. */
  aiRules: Array<ComplianceRuleRef & { due: boolean; phase: "now" | "earlier" }>;
  /** Code findings the user's AI review showed to be met. */
  cleared: Array<ComplianceRuleRef & { reason: string; quotes: string[] }>;
  /** The user's last AI review of this ticket (saved; the dashboard never calls the AI). */
  aiReview: ComplianceAiReview | null;
  /** Part of the ticket's very long history (middle revisions or oldest comments) was not read; results are unchanged. */
  historyTruncated?: boolean;
}

export interface ComplianceAiReview {
  status: "QUEUED" | "RUNNING" | "DONE" | "FAILED" | "SKIPPED";
  checkedAt: string | null;
  /** The ticket changed since: its clears no longer apply until it is reviewed again. */
  outdated: boolean;
}

export type RecommendationCategory =
  | "BLOCKER"
  | "FAILED_PIPELINE"
  | "REVIEW"
  | "SOP"
  | "STALE"
  /** Time-tracking nudges from the linked Solidtime connection. */
  | "TIME";

export interface Recommendation {
  id: string;
  score: number;
  category: RecommendationCategory;
  title: string;
  reasons: string[];
  /** Stable reason codes (unlike display text); a new code resurfaces a triaged item. */
  signals: string[];
  target: {
    type: "workItem" | "pullRequest" | "build" | "time";
    projectName: string;
    id: number;
    repositoryId?: string;
    /** Time nudges: the triage key and the Solidtime connection to open. */
    key?: string;
    solidtimeCredentialId?: string;
    webUrl: string | null;
  };
  suggestedAction: SuggestedAction | null;
}

export interface Dashboard {
  identity: AzureIdentity;
  generatedAt: string;
  /** The project the dashboard is narrowed to, by name; null for all projects. */
  projectName?: string | null;
  projectsScanned: number;
  projectsTruncated: boolean;
  sections: {
    workItems: Section<WorkItemSummary[]>;
    pullRequests: Section<PullRequestSummary[]>;
    pipelines: Section<BuildSummary[]>;
    compliance: Section<ComplianceResult[]>;
  };
  recommendations: Recommendation[];
  /** "Bug in Alpha" pairs whose states could not be read (their tickets' open/closed is guessed). */
  stateLookupFailed?: string[];
  /** The ticket list was cut at `cap` (most recently changed kept). */
  workItemsTruncated?: { cap: number } | null;
  /** Null when that section could not be read at all. */
  completeness?: { pullRequests: ReadCompleteness | null; pipelines: ReadCompleteness | null };
}

/** One page of a server-paged list (10 rows; the server clamps the page). */
export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface FacetOption {
  value: string;
  label: string;
  count: number;
}

export interface WorkItemListFilters {
  search: string;
  type: string;
  stateCategory: string;
  priority: string;
  sop: string;
  assignee: string;
}

/** The ticket heading a group: a story (or feature, PBI…), possibly someone else's. */
export interface GroupHeading {
  id: number;
  title: string;
  type: string;
  state: string;
  stateCategory: StateCategory;
  projectName: string;
  assignedTo: IdentityRef | null;
  changedDate: string | null;
  /** False when Azure could not return it: only its number is known. */
  readable: boolean;
}

/** A story with the listed tickets under it (heading null: a ticket under no story). */
export interface WorkItemGroup<T> {
  heading: GroupHeading | null;
  /** The heading's own row when it is one of the listed tickets. */
  headingRow: T | null;
  rows: T[];
  /** The newest change in the group (what the list is sorted by). */
  latest: string | null;
}

/** Why a ticket needs me, and the change that fixes it (proposed for approval). */
export interface Attention {
  category: RecommendationCategory;
  reasons: string[];
  suggestedAction: SuggestedAction | null;
}

export interface MyWorkRow {
  workItem: WorkItemSummary;
  compliance: ComplianceResult | null;
  attention: Attention | null;
}

export type WorkSection = "inProgress" | "todo" | "resolved" | "done";

export interface StoryProgress {
  done: number;
  total: number;
  remainingHours: number;
}

export interface MyWorkGroup extends WorkItemGroup<MyWorkRow> {
  /** Null when grouped by story only. */
  section: WorkSection | null;
  /** My tickets under the heading, every section included. */
  progress: StoryProgress | null;
}

export interface MyWorkOverview {
  sprint: { name: string; startDate: string | null; finishDate: string | null } | null;
  counts: Record<WorkSection, number>;
  remainingHours: number;
}

/** 10 groups per page: status sections, newest change first inside. */
export interface MyWorkPage extends Page<MyWorkGroup> {
  groupBy: "status" | "story";
  sections: Array<{ key: WorkSection; count: number }>;
  overview: MyWorkOverview;
  ticketCount: number;
  poolTotal: number;
  hiddenCount: number;
  showingHidden: boolean;
  /** `unreadable`: projects whose current sprint could not be read (their tickets show in every view). */
  sprint: { mode: "current" | "all"; inSprint: number; names: string[]; unreadable?: string[] };
  closed: { included: boolean; count: number };
  attention: { only: boolean; count: number };
  facets: { types: FacetOption[]; states: FacetOption[]; priorities: FacetOption[]; sop: FacetOption[] };
  /** The ticket list was cut at `cap` (most recently changed kept). */
  workItemsTruncated?: { cap: number } | null;
  /** "Bug in Alpha" pairs whose states could not be read (open/closed guessed). */
  stateLookupFailed?: string[];
}

/** Filters for pull request lists; the server applies them before paging. */
export interface PullRequestListFilters {
  search: string;
  /** Mine: "author" | "reviewer"; team: the creator's display name. */
  person: string;
  review: string;
  repository: string;
}

export interface PullRequestPage extends Page<PullRequestSummary> {
  poolTotal: number;
  /** Dashboard only: snoozed or abandoned pull requests, listed only with `hidden`. */
  hiddenCount?: number;
  showingHidden?: boolean;
  facets: { person: FacetOption[]; review: FacetOption[]; repositories: FacetOption[] };
  /** What the read left out (pull requests past the cap, projects that could not be read). */
  completeness?: ReadCompleteness;
}

export interface PipelineRunPage extends Page<BuildSummary> {
  poolTotal: number;
  hiddenCount: number;
  showingHidden: boolean;
  facets: { results: FacetOption[] };
  /** What the read left out (runs past the cap, projects that could not be read). */
  completeness?: ReadCompleteness;
}

export interface TeamWorkPage extends Page<WorkItemGroup<WorkItemSummary>> {
  ticketCount: number;
  poolTotal: number;
  facets: { types: FacetOption[]; states: FacetOption[]; priorities: FacetOption[]; assignees: FacetOption[] };
  /** The ticket list was cut at `cap` (most recently changed kept). */
  workItemsTruncated?: { cap: number } | null;
}
