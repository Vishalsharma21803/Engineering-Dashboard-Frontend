import type { FilterOption } from "../components/filter-bar";
import type { PullRequestSummary } from "../types/azure.types";

export interface PullRequestFilters {
  search: string;
  /** mine: "author" | "reviewer"; team: creator display name. */
  person: string;
  review: string;
  repository: string;
}

export const EMPTY_PR_FILTERS: PullRequestFilters = { search: "", person: "", review: "", repository: "" };

export type ReviewState = "draft" | "conflicts" | "changes" | "approved" | "waiting";

const REVIEW_LABELS: Record<ReviewState, string> = {
  draft: "Draft",
  conflicts: "Merge conflicts",
  changes: "Changes requested",
  approved: "Approved",
  waiting: "Awaiting review",
};

/** Same precedence as the badge shown on each row. */
export function reviewState(pr: PullRequestSummary): ReviewState {
  if (pr.isDraft) return "draft";
  if (pr.mergeStatus === "conflicts") return "conflicts";
  if (pr.rejections > 0) return "changes";
  if (pr.approvals > 0) return "approved";
  return "waiting";
}

export function matchesPullRequest(pr: PullRequestSummary, filters: PullRequestFilters, team: boolean): boolean {
  const search = filters.search.trim().toLowerCase();

  if (search && !`!${pr.pullRequestId} ${pr.title} ${pr.sourceBranch}`.toLowerCase().includes(search)) return false;
  if (filters.repository && pr.repositoryName !== filters.repository) return false;
  if (filters.review === "unresolved" ? !pr.unresolvedThreads : filters.review && reviewState(pr) !== filters.review) {
    return false;
  }
  if (filters.person && (team ? pr.createdBy.displayName !== filters.person : pr.myRole !== filters.person)) return false;

  return true;
}

export function pullRequestFilterOptions(pullRequests: PullRequestSummary[], team: boolean) {
  const count = (predicate: (pr: PullRequestSummary) => boolean) => pullRequests.filter(predicate).length;

  const review: FilterOption[] = [
    ...(Object.keys(REVIEW_LABELS) as ReviewState[]).map((value) => ({
      value,
      label: REVIEW_LABELS[value],
      count: count((pr) => reviewState(pr) === value),
    })),
    { value: "unresolved", label: "Unresolved comments", count: count((pr) => Boolean(pr.unresolvedThreads)) },
  ].filter((option) => option.count > 0);

  const person: FilterOption[] = team
    ? [...new Set(pullRequests.map((pr) => pr.createdBy.displayName))]
        .sort()
        .map((name) => ({ value: name, label: name, count: count((pr) => pr.createdBy.displayName === name) }))
    : [
        { value: "author", label: "Authored by me", count: count((pr) => pr.myRole === "author") },
        { value: "reviewer", label: "Reviewing", count: count((pr) => pr.myRole === "reviewer") },
      ];

  const repositories: FilterOption[] = [...new Set(pullRequests.map((pr) => pr.repositoryName))]
    .sort()
    .map((name) => ({ value: name, label: name, count: count((pr) => pr.repositoryName === name) }));

  return { review, person, repositories };
}
