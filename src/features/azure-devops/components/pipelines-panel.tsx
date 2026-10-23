import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { usePipelineRuns, usePipelines } from "../hooks/use-pipelines";
import type { ProposeActionInput } from "../types/action.types";
import type { BuildSummary, PipelineSummary } from "../types/azure.types";
import { formatRelative, stripRef } from "../utils/format";
import { buildLabel, buildTone, type Tone } from "../utils/labels";
import { BuildTimeline } from "./build-timeline";
import { EmptyState, ErrorCard, SkeletonRows } from "./feedback";
import { StatusBadge } from "./status-badge";

const HEALTH_TONES: Record<PipelineSummary["health"], Tone> = {
  succeeded: "success",
  failed: "danger",
  partiallySucceeded: "warning",
  canceled: "neutral",
  running: "info",
  never: "neutral",
};

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
      <button type="button" onClick={onToggle} className="flex min-w-0 items-center gap-2 text-left" aria-expanded={expanded}>
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
  const { data: runs, isLoading, error } = usePipelineRuns(credentialId, projectId, pipeline.id);
  const [expandedBuild, setExpandedBuild] = useState<number | null>(focusBuildId);

  if (isLoading) return <SkeletonRows rows={2} />;
  if (error || !runs) return <ErrorCard error={error} credentialId={credentialId} />;
  if (runs.length === 0) return <p className="text-sm text-slate-500">No runs yet.</p>;

  return (
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
                    variant="secondary"
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
  );
}

export function PipelinesPanel(props: PipelinesPanelProps) {
  const { credentialId, projectId, focusBuildId, isProposing, onPropose } = props;
  const { data: pipelines, isLoading, error, refetch } = usePipelines(credentialId, projectId);
  // null = follow focusBuildId; -1 = user collapsed everything.
  const [expanded, setExpanded] = useState<number | null>(null);

  if (isLoading) return <SkeletonRows />;
  if (error || !pipelines) {
    return <ErrorCard error={error} credentialId={credentialId} onRetry={() => void refetch()} />;
  }
  if (pipelines.length === 0) return <EmptyState>This project has no pipelines.</EmptyState>;

  const focusedPipeline =
    focusBuildId === null
      ? null
      : pipelines.find(
          (pipeline) =>
            pipeline.latestBuild?.id === focusBuildId || pipeline.latestCompletedBuild?.id === focusBuildId
        )?.id ?? null;
  const open = expanded ?? focusedPipeline;

  return (
    <ul className="divide-y divide-slate-100">
      {pipelines.map((pipeline) => (
        <li key={pipeline.id} className="py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              className="flex items-center gap-2 text-left"
              aria-expanded={open === pipeline.id}
              onClick={() => setExpanded(open === pipeline.id ? -1 : pipeline.id)}
            >
              <StatusBadge tone={HEALTH_TONES[pipeline.health]}>{pipeline.health}</StatusBadge>
              <span className="font-medium text-slate-950">{pipeline.name}</span>
              <span className="text-xs text-slate-500">
                last run {formatRelative(pipeline.latestBuild?.queueTime)}
              </span>
            </button>
            <Button
              size="sm"
              variant="secondary"
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
  );
}
