import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";

import { Pagination } from "@/components/ui/pagination";
import { Updating } from "@/components/ui/updating";
import { usePageParam, useSyncServedPage } from "@/hooks/use-page-param";
import { cn } from "@/utils/cn";
import { listDashboardPipelineRuns } from "../api/azure.api";
import { azureKeys } from "../api/azure.keys";
import type { DashboardTriage } from "../hooks/use-triage";
import type { BuildSummary } from "../types/azure.types";
import { formatRelative, stripRef } from "../utils/format";
import { buildLabel, buildTone } from "../utils/labels";
import { retryUnlessClientError } from "../utils/query-retry";
import { movedByPendingMark, pipelineKey } from "../utils/triage";
import { EmptyState, ErrorCard, SkeletonRows, StaleDataBanner } from "./feedback";
import { FilterBar } from "./filter-bar";
import { StatusBadge } from "./status-badge";
import { HiddenToggle, TriageBadge, TriageMenu } from "./triage-menu";

interface PipelineRunListProps {
  credentialId: string;
  projectId: string | undefined;
  /** Changes whenever the dashboard reloads, so the page reloads with it. */
  dashboardToken: string;
  triage: DashboardTriage;
}

/** My recent pipeline runs, 10 per page, filtered by the server. The page lives in the URL (?runPage=). */
export function PipelineRunList({ credentialId, projectId, dashboardToken, triage }: PipelineRunListProps) {
  const pageParam = usePageParam("runPage");
  const { page, setPage } = pageParam;
  const [result, setResult] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const query = useQuery({
    queryKey: [...azureKeys.dashboardRuns(credentialId, projectId), { page, result, showHidden, token: dashboardToken, triage: triage.savedVersion }],
    queryFn: () => listDashboardPipelineRuns(credentialId, projectId, { page, hidden: showHidden, result }),
    placeholderData: keepPreviousData,
    retry: retryUnlessClientError,
  });
  useSyncServedPage(pageParam, query.isPlaceholderData ? undefined : query.data?.page);

  if (query.isLoading) {
    return <SkeletonRows rows={3} />;
  }

  if (!query.data) {
    return <ErrorCard error={query.error} credentialId={credentialId} onRetry={() => void query.refetch()} />;
  }

  const stale = query.error ? <StaleDataBanner credentialId={credentialId} error={query.error} onRetry={() => void query.refetch()} isRetrying={query.isFetching} /> : null;
  const data = query.data;

  if (data.poolTotal === 0 && data.hiddenCount === 0) {
    return (
      <>
        {stale}
        <EmptyState>No pipeline runs requested by you in the last week.</EmptyState>
      </>
    );
  }

  const triageOf = (build: BuildSummary) => triage.resolve(pipelineKey(build), build.projectName);

  return (
    <>
      {stale}
      <div className="space-y-3">
        {/* Filters only help once there is more than one page to look through. */}
        {(data.facets.results.length > 1 && data.poolTotal > data.pageSize) || result ? (
          <FilterBar
            filters={[
              {
                id: "result",
                label: "Result",
                value: result,
                options: data.facets.results,
                onChange: (value) => {
                  setResult(value);
                  setPage(1, { replace: true });
                },
              },
            ]}
            shown={data.total}
            total={data.poolTotal}
            onClear={() => {
              setResult("");
              setPage(1, { replace: true });
            }}
          />
        ) : null}
        <Updating active={query.isPlaceholderData}>
          {data.hiddenCount > 0 ? (
            <div className="flex justify-end">
              <HiddenToggle
                count={data.hiddenCount}
                shown={data.showingHidden}
                onToggle={() => {
                  setShowHidden(!data.showingHidden);
                  setPage(1, { replace: true });
                }}
              />
            </div>
          ) : null}
          {data.total === 0 ? (
            <EmptyState>
              {data.poolTotal === 0 && !data.showingHidden ? "All your recent pipeline runs are snoozed or abandoned." : "No pipeline runs match this filter."}
            </EmptyState>
          ) : null}
          <ul className="divide-y divide-slate-100">
            {data.items.filter((build) => !movedByPendingMark(triageOf(build), data.showingHidden)).map((build) => (
              <li key={build.id} className={cn("flex items-center justify-between gap-2 py-2.5", triageOf(build).state !== "active" && "opacity-75")}>
                <Link
                  to={`/azure/${encodeURIComponent(credentialId)}/projects/${encodeURIComponent(build.projectName ?? "")}?build=${build.id}`}
                  className="min-w-0 truncate text-sm text-slate-800 hover:text-indigo-600"
                >
                  <span className="font-medium">{build.definitionName}</span> #{build.buildNumber} · {stripRef(build.sourceBranch)} · {formatRelative(build.queueTime)}
                </Link>
                <span className="flex shrink-0 items-center gap-1.5">
                  <TriageBadge resolved={triageOf(build)} />
                  <StatusBadge tone={buildTone(build.status, build.result)}>{buildLabel(build.status, build.result)}</StatusBadge>
                  <TriageMenu
                    triage={triage}
                    itemKey={pipelineKey(build)}
                    projectName={build.projectName}
                    label={`${build.definitionName} on ${stripRef(build.sourceBranch)}`}
                    resolved={triageOf(build)}
                  />
                </span>
              </li>
            ))}
          </ul>
        </Updating>
        <Pagination
          label="Pipeline run pages"
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
