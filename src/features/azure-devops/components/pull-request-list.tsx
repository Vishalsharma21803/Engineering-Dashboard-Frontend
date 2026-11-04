import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { Pagination } from "@/components/ui/pagination";
import { Updating } from "@/components/ui/updating";
import { usePageParam, useSyncServedPage } from "@/hooks/use-page-param";
import { cn } from "@/utils/cn";

import { listDashboardPullRequests, listProjectPullRequests } from "../api/azure.api";
import { azureKeys } from "../api/azure.keys";
import type { DashboardTriage } from "../hooks/use-triage";
import type { PullRequestListFilters, PullRequestSummary } from "../types/azure.types";
import { formatRelative } from "../utils/format";
import { voteFromValue } from "../utils/labels";
import { retryUnlessClientError } from "../utils/query-retry";
import { UNTRIAGED, movedByPendingMark, pullRequestKey } from "../utils/triage";
import { EmptyState, ErrorCard, PartialReadNotice, SkeletonRows, StaleDataBanner } from "./feedback";
import { FilterBar } from "./filter-bar";
import { StatusBadge } from "./status-badge";
import { HiddenToggle, TriageBadge, TriageMenu } from "./triage-menu";

const EMPTY_FILTERS: PullRequestListFilters = { search: "", person: "", review: "", repository: "" };
const SEARCH_DELAY_MS = 300;

type PullRequestListProps =
  | {
      /** My pull requests and reviews on the dashboard, with snooze / acknowledge / abandon. */
      scope: "mine";
      credentialId: string;
      projectId: string | undefined;
      /** Changes whenever the dashboard reloads, so the page reloads with it. */
      dashboardToken: string;
      triage: DashboardTriage;
    }
  | {
      /** Every active pull request in one project. */
      scope: "team";
      credentialId: string;
      projectId: string;
    };

function mergeBadge(pr: PullRequestSummary) {
  if (pr.isDraft) return <StatusBadge tone="neutral">Draft</StatusBadge>;
  if (pr.mergeStatus === "conflicts") return <StatusBadge tone="danger">Conflicts</StatusBadge>;
  if (pr.rejections > 0) return <StatusBadge tone="warning">Changes requested</StatusBadge>;
  if (pr.approvals > 0) return <StatusBadge tone="success">{pr.approvals} {pr.approvals === 1 ? "approval" : "approvals"}</StatusBadge>;
  return <StatusBadge tone="info">Awaiting review</StatusBadge>;
}

/** Pull requests, 10 per page, filtered by the server. The page lives in the URL (?prPage=). */
export function PullRequestList(props: PullRequestListProps) {
  const { credentialId, scope } = props;
  const team = scope === "team";
  const triage = scope === "mine" ? props.triage : undefined;
  const pageParam = usePageParam("prPage");
  const { page, setPage } = pageParam;
  const toFirstPage = () => setPage(1, { replace: true });
  const [filters, setFilters] = useState<PullRequestListFilters>(EMPTY_FILTERS);
  const [searchInput, setSearchInput] = useState("");
  const [showHidden, setShowHidden] = useState(false);

  // The search box waits for typing to pause before asking the server.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFilters((current) => (current.search === searchInput.trim() ? current : { ...current, search: searchInput.trim() }));
    }, SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const query = useQuery({
    queryKey:
      props.scope === "mine"
        ? [...azureKeys.dashboardPullRequests(credentialId, props.projectId), { page, filters, showHidden, token: props.dashboardToken, triage: props.triage.savedVersion }]
        : [...azureKeys.projectPullRequests(credentialId, props.projectId), { page, filters }],
    queryFn: () =>
      props.scope === "mine"
        ? listDashboardPullRequests(credentialId, props.projectId, { page, hidden: showHidden, filters })
        : listProjectPullRequests(credentialId, props.projectId, { page, filters }),
    placeholderData: keepPreviousData,
    retry: retryUnlessClientError,
  });
  useSyncServedPage(pageParam, query.isPlaceholderData ? undefined : query.data?.page);

  if (query.isLoading) {
    return <SkeletonRows rows={3} />;
  }

  if (!query.data) {
    return <ErrorCard error={query.error} credentialId={credentialId} onRetry={() => void query.refetch()} isRetrying={query.isFetching} />;
  }

  const stale = query.error ? <StaleDataBanner credentialId={credentialId} error={query.error} onRetry={() => void query.refetch()} isRetrying={query.isFetching} /> : null;
  const data = query.data;
  const hiddenCount = data.hiddenCount ?? 0;
  const partial = <PartialReadNotice className="mb-3" messages={[data.completeness?.note]} />;

  if (data.poolTotal === 0 && hiddenCount === 0) {
    return (
      <>
        {stale}
        {partial}
        <EmptyState>{team ? "No active pull requests in this project." : "No active pull requests authored by you or awaiting your review."}</EmptyState>
      </>
    );
  }

  const set = (key: keyof PullRequestListFilters) => (value: string) => {
    setFilters({ ...filters, [key]: value });
    toFirstPage();
  };
  const triageOf = (pr: PullRequestSummary) => (triage ? triage.resolve(pullRequestKey(pr.repositoryId, pr.pullRequestId), pr.projectName) : UNTRIAGED);

  return (
    <>
      {stale}
      {partial}
      <div className="space-y-3">
        {/* Filters only help once there is more than one page to look through. */}
        {data.poolTotal > data.pageSize || searchInput || Object.values(filters).some(Boolean) ? (
          <FilterBar
            search={{
              value: searchInput,
              onChange: (value) => {
                setSearchInput(value);
                toFirstPage();
              },
              placeholder: "Search PR, title or branch",
            }}
            filters={[
              { id: "person", label: team ? "Author" : "Role", value: filters.person, options: data.facets.person, onChange: set("person") },
              { id: "review", label: "Review", value: filters.review, options: data.facets.review, onChange: set("review") },
              ...(data.facets.repositories.length > 1
                ? [{ id: "repository", label: "Repo", value: filters.repository, options: data.facets.repositories, onChange: set("repository") }]
                : []),
            ]}
            shown={data.total}
            total={data.poolTotal}
            onClear={() => {
              setFilters(EMPTY_FILTERS);
              setSearchInput("");
              toFirstPage();
            }}
          />
        ) : null}
        <Updating active={query.isPlaceholderData}>
          {hiddenCount > 0 ? (
            <div className="flex justify-end">
              <HiddenToggle
                count={hiddenCount}
                shown={data.showingHidden ?? false}
                onToggle={() => {
                  setShowHidden(!data.showingHidden);
                  toFirstPage();
                }}
              />
            </div>
          ) : null}
          <ul className="divide-y divide-slate-100">
            {data.items.filter((pr) => !movedByPendingMark(triageOf(pr), data.showingHidden ?? false)).map((pr) => (
              <li
                key={`${pr.repositoryId}:${pr.pullRequestId}`}
                className={cn("flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between", triageOf(pr).state !== "active" && "opacity-75")}
              >
                <div className="min-w-0">
                  <Link
                    to={`/azure/${encodeURIComponent(credentialId)}/projects/${encodeURIComponent(pr.projectId)}/repos/${encodeURIComponent(pr.repositoryId)}/pull-requests/${pr.pullRequestId}`}
                    className="break-words font-medium text-slate-950 hover:text-indigo-600"
                  >
                    PR {pr.pullRequestId} {pr.title}
                  </Link>
                  <p className="mt-0.5 break-words text-xs text-slate-500">
                    {pr.repositoryName} · {pr.sourceBranch} → {pr.targetBranch} · {pr.myRole === "author" ? "You authored" : `by ${pr.createdBy.displayName}`} · {formatRelative(pr.creationDate)}
                    {pr.myRole === "reviewer" ? " · you're a reviewer" : ""}
                  </p>
                  {pr.myRole === "reviewer" && pr.myVote !== null ? <p className="mt-1 text-xs text-slate-600">Your vote: {voteFromValue(pr.myVote).label}</p> : null}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  <TriageBadge resolved={triageOf(pr)} />
                  {mergeBadge(pr)}
                  {pr.unresolvedThreads ? <StatusBadge tone="warning">{pr.unresolvedThreads} unresolved</StatusBadge> : null}
                  {triage ? (
                    <TriageMenu triage={triage} itemKey={pullRequestKey(pr.repositoryId, pr.pullRequestId)} projectName={pr.projectName} label={`PR ${pr.pullRequestId} ${pr.title}`} resolved={triageOf(pr)} />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          {data.total === 0 ? (
            <EmptyState>{data.poolTotal === 0 && !data.showingHidden ? "All your pull requests are snoozed or abandoned." : "No pull requests match these filters."}</EmptyState>
          ) : null}
        </Updating>
        <Pagination
          label="Pull request pages"
          page={data.page}
          totalPages={data.totalPages}
          total={data.total}
          pageSize={data.pageSize}
          disabled={query.isFetching}
          onChange={(next) => setPage(next)}
        />
      </div>
    </>
  );
}
