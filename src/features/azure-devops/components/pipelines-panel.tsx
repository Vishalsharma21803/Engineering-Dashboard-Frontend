import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Updating } from "@/components/ui/updating";
import { Pagination } from "@/components/ui/pagination";
import { usePageParam, useSyncServedPage } from "@/hooks/use-page-param";
import { usePipelineRuns, usePipelines } from "../hooks/use-pipelines";
import type { ProposeActionInput } from "../types/action.types";
import type { BuildSummary, PipelineSummary } from "../types/azure.types";
import { formatRelative, stripRef } from "../utils/format";
import { buildLabel, buildTone, type Tone } from "../utils/labels";
import { BuildTimeline } from "./build-timeline";
import { EmptyState, ErrorCard, SkeletonRows, StaleDataBanner } from "./feedback";
import { StatusBadge } from "./status-badge";

const HEALTH_TONES: Record<PipelineSummary["health"], Tone> = {
  succeeded: "success",
  failed: "danger",
  partiallySucceeded: "warning",
  canceled: "neutral",
  running: "info",
  never: "neutral",
};

/** Health in words; a running pipeline also says how its previous run ended. */
function healthLabel(pipeline: PipelineSummary): string {
  if (pipeline.health === "running") {
    return pipeline.latestCompletedBuild
      ? `Running · previous run ${pipeline.latestCompletedBuild.result ?? "completed"}`
      : "Running";
  }

  return pipeline.health === "never" ? "never run" : pipeline.health;
}

interface PipelinesPanelProps {
  credentialId: string;
  projectId: string;
  /** Build to expand initially (e.g. from a recommendation link). */
  focusBuildId: number | null;
  isProposing: boolean;
  onPropose: (input: ProposeActionInput) => void;
}

export function RunRow({
  run,
  expanded,
  onToggle,
  actions,
}: {
  run: BuildSummary;
  expanded: boolean;
  onToggle: () => void;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <button
        type="button"
        onClick={onToggle}
        className="flex min-w-0 items-center gap-2 rounded-md text-left hover:text-indigo-600"
        aria-expanded={expanded}
        title={expanded ? "Hide stages" : "Show stages and errors"}
      >
        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className={`size-3.5 shrink-0 text-slate-400 transition ${expanded ? "rotate-90" : ""}`}>
          <path d="M7.5 5 13 10l-5.5 5V5Z" />
        </svg>
        <StatusBadge tone={buildTone(run.status, run.result)}>{buildLabel(run.status, run.result)}</StatusBadge>
        <span className="truncate text-sm text-slate-800">
          #{run.buildNumber} · {stripRef(run.sourceBranch)} · {run.requestedFor?.displayName ?? "unknown"} ·{" "}
          {formatRelative(run.queueTime)}
        </span>
      </button>
      {actions}
    </div>
  );
}

function PipelineRuns({
  credentialId,
  projectId,
  pipeline,
  focusBuildId,
  isProposing,
  onPropose,
}: PipelinesPanelProps & { pipeline: PipelineSummary }) {
  const { data: runs, isLoading, isFetching, error, refetch } = usePipelineRuns(credentialId, projectId, pipeline.id);
  const [expandedBuild, setExpandedBuild] = useState<number | null>(focusBuildId);

  if (isLoading) return <SkeletonRows rows={2} />;
  if (!runs) return <ErrorCard error={error} credentialId={credentialId} onRetry={() => void refetch()} isRetrying={isFetching} />;
  const stale = error ? <StaleDataBanner credentialId={credentialId} error={error} onRetry={() => void refetch()} isRetrying={isFetching} /> : null;

  if (runs.length === 0) {
    return (
      <>
        {stale}
        <p className="text-sm text-slate-500">No runs yet.</p>
      </>
    );
  }

  return (
    <>
      {stale}
      <ul className="space-y-2">
        {runs.map((run) => {
          const running = run.status === "inProgress" || run.status === "notStarted";

          return (
            <li key={run.id} className="rounded-lg border border-slate-100 p-2">
              <RunRow
                run={run}
                expanded={expandedBuild === run.id}
                onToggle={() => setExpandedBuild(expandedBuild === run.id ? null : run.id)}
                actions={
                  running ? (
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={isProposing}
                      onClick={() =>
                        onPropose({ credentialId, kind: "BUILD_CANCEL", target: { projectId, buildId: run.id }, params: {} })
                      }
                    >
                      Cancel run…
                    </Button>
                  ) : null
                }
              />
              {expandedBuild === run.id ? (
                <div className="mt-2">
                  <BuildTimeline
                    credentialId={credentialId}
                    projectId={projectId}
                    build={run}
                    isProposing={isProposing}
                    onRetryStage={(stageRefName) =>
                      onPropose({
                        credentialId,
                        kind: "BUILD_RETRY_STAGE",
                        target: { projectId, buildId: run.id },
                        params: { stageRefName },
                      })
                    }
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </>
  );
}

export function PipelinesPanel(props: PipelinesPanelProps) {
  const { credentialId, projectId, focusBuildId, isProposing, onPropose } = props;
  const pageParam = usePageParam("pipelinePage");
  // Until a page is chosen, a linked run opens the page holding its pipeline.
  const query = usePipelines(credentialId, projectId, {
    page: pageParam.raw === null ? undefined : pageParam.page,
    build: pageParam.raw === null ? (focusBuildId ?? undefined) : undefined,
  });
  useSyncServedPage(pageParam, query.isPlaceholderData ? undefined : query.data?.page);
  // null = follow focusBuildId; -1 = user collapsed everything.
  const [expanded, setExpanded] = useState<number | null>(null);

  if (query.isLoading) return <SkeletonRows />;
  if (!query.data) {
    return <ErrorCard error={query.error} credentialId={credentialId} onRetry={() => void query.refetch()} />;
  }
  const stale = query.error ? <StaleDataBanner credentialId={credentialId} error={query.error} onRetry={() => void query.refetch()} isRetrying={query.isFetching} /> : null;
  if (query.data.total === 0) {
    return (
      <>
        {stale}
        <EmptyState>This project has no pipelines.</EmptyState>
      </>
    );
  }

  const pipelines = query.data.items;

  const focusedPipeline =
    focusBuildId === null
      ? null
      : pipelines.find(
          (pipeline) =>
            pipeline.latestBuild?.id === focusBuildId || pipeline.latestCompletedBuild?.id === focusBuildId
        )?.id ?? null;
  const open = expanded ?? focusedPipeline;

  return (
    <>
      {stale}
      <div>
        <Updating active={query.isPlaceholderData}>
          <ul className="divide-y divide-slate-100">
            {pipelines.map((pipeline) => (
              <li key={pipeline.id} className="py-3">
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    className="-my-1 flex min-h-11 min-w-0 flex-1 items-start gap-2 rounded-md py-1 text-left hover:text-indigo-600"
                    aria-expanded={open === pipeline.id}
                    onClick={() => setExpanded(open === pipeline.id ? -1 : pipeline.id)}
                  >
                    <svg
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      aria-hidden="true"
                      className={`mt-0.5 size-4 shrink-0 text-slate-400 transition ${open === pipeline.id ? "rotate-90" : ""}`}
                    >
                      <path d="M7.5 5 13 10l-5.5 5V5Z" />
                    </svg>
                    <span className="min-w-0 flex-1">
                      <span className="block break-words font-medium text-slate-950">{pipeline.name}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5">
                        <StatusBadge
                          tone={HEALTH_TONES[pipeline.health]}
                          title={pipeline.health === "running" ? "A run is in progress; the result of the run before it is shown too" : undefined}
                        >
                          {healthLabel(pipeline)}
                        </StatusBadge>
                        <span className="text-xs text-slate-500">last run {formatRelative(pipeline.latestBuild?.queueTime)}</span>
                      </span>
                    </span>
                  </button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="shrink-0"
                    disabled={isProposing}
                    onClick={() =>
                      onPropose({ credentialId, kind: "PIPELINE_QUEUE_RUN", target: { projectId, definitionId: pipeline.id }, params: {} })
                    }
                  >
                    Queue run…
                  </Button>
                </div>
                {open === pipeline.id ? (
                  <div className="mt-3">
                    <PipelineRuns {...props} pipeline={pipeline} focusBuildId={focusBuildId} />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </Updating>
        <Pagination
          label="Pipeline pages"
          page={query.data.page}
          totalPages={query.data.totalPages}
          total={query.data.total}
          pageSize={query.data.pageSize}
          disabled={query.isFetching}
          onChange={(next) => pageParam.setPage(next)}
        />
      </div>
    </>
  );
}
