import { Button } from "@/components/ui/button";
import { useBuildTimeline } from "../hooks/use-pipelines";
import type { BuildSummary } from "../types/azure.types";
import { buildLabel, buildTone } from "../utils/labels";
import { ErrorCard, SkeletonRows } from "./feedback";
import { StatusBadge } from "./status-badge";

interface BuildTimelineProps {
  credentialId: string;
  projectId: string;
  build: BuildSummary;
  isProposing: boolean;
  onRetryStage: (stageRefName: string) => void;
}

export function BuildTimeline({ credentialId, projectId, build, isProposing, onRetryStage }: BuildTimelineProps) {
  const { data: timeline, isLoading, error, refetch } = useBuildTimeline(credentialId, projectId, build.id);

  if (isLoading) {
    return <SkeletonRows rows={2} />;
  }

  if (error || !timeline) {
    return <ErrorCard error={error} credentialId={credentialId} onRetry={() => void refetch()} />;
  }

  if (timeline.stages.length === 0) {
    return <p className="text-sm text-slate-500">This run has no stage information yet.</p>;
  }

  return (
    <ol className="space-y-2">
      {timeline.stages.map((stage) => {
        const retryable =
          build.status === "completed" &&
          stage.identifier !== null &&
          (stage.result === "failed" || stage.result === "canceled");

        return (
          <li key={stage.id} className="rounded-lg border border-slate-200 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <StatusBadge tone={buildTone(stage.state === "completed" ? "completed" : stage.state ?? "", stage.result)}>
                  {buildLabel(stage.state === "completed" ? "completed" : stage.state ?? "", stage.result)}
                </StatusBadge>
                <span className="text-sm font-medium text-slate-900">{stage.name}</span>
              </div>
              {retryable ? (
                <Button size="sm" variant="secondary" disabled={isProposing} onClick={() => onRetryStage(stage.identifier ?? "")}>
                  Retry stage…
                </Button>
              ) : null}
            </div>

            {stage.jobs
              .filter((job) => job.failedTasks.length > 0)
              .map((job) => (
                <div key={job.id} className="mt-2 rounded-md bg-rose-50 p-2 text-xs text-rose-800">
                  <p className="font-medium">{job.name}</p>
                  <ul className="mt-1 space-y-1">
                    {job.failedTasks.map((task) => (
                      <li key={task.id}>
                        <span className="font-medium">{task.name}</span>
                        {task.issues.map((issue, index) => (
                          <span key={index} className="block whitespace-pre-wrap text-rose-700">
                            {issue.message}
                          </span>
                        ))}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </li>
        );
      })}
    </ol>
  );
}
