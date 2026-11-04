import { useDeployments } from "../hooks/use-pipelines";
import { formatRelative } from "../utils/format";
import type { Tone } from "../utils/labels";
import { EmptyState, ErrorCard, SectionView, SkeletonRows } from "./feedback";
import { StatusBadge } from "./status-badge";

function resultTone(result: string | null): Tone {
  if (result === "succeeded") return "success";
  if (result === "failed" || result === "rejected") return "danger";
  if (result === "partiallySucceeded") return "warning";
  if (result === "inProgress") return "info";
  return "neutral";
}

export function DeploymentsPanel({ credentialId, projectId }: { credentialId: string; projectId: string }) {
  const { data: deployments, isLoading, isFetching, error, refetch } = useDeployments(credentialId, projectId);

  if (isLoading) return <SkeletonRows rows={2} />;
  if (error || !deployments) {
    return <ErrorCard error={error} credentialId={credentialId} onRetry={() => void refetch()} isRetrying={isFetching} />;
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-900">Environments (YAML)</h3>
        <SectionView section={deployments.environments} label="environments">
          {(environments) =>
            environments.length === 0 ? (
              <EmptyState>No environments.</EmptyState>
            ) : (
              <ul className="space-y-2">
                {environments.map((environment) => {
                  const latest = environment.lastDeployments[0];

                  return (
                    <li key={environment.environmentId} className="rounded-lg border border-slate-200 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-slate-900">{environment.environmentName}</span>
                        {latest ? (
                          <StatusBadge tone={resultTone(latest.result)}>{latest.result ?? "unknown"}</StatusBadge>
                        ) : (
                          <StatusBadge tone="neutral">No deployments</StatusBadge>
                        )}
                      </div>
                      {latest ? (
                        <p className="mt-1 text-xs text-slate-500">
                          {latest.definitionName ?? "Pipeline"} · {latest.stageName ?? "stage"} ·{" "}
                          {formatRelative(latest.finishTime ?? latest.startTime)}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )
          }
        </SectionView>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-900">Classic releases</h3>
        <SectionView section={deployments.releases} label="classic releases">
          {(releases) =>
            releases.length === 0 ? (
              <EmptyState>No classic releases.</EmptyState>
            ) : (
              <ul className="space-y-2">
                {releases.map((release) => (
                  <li key={release.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-900">{release.name}</span>
                      <span className="text-xs text-slate-500">{formatRelative(release.createdOn)}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {release.environments.map((environment) => (
                        <StatusBadge key={environment.name} tone={resultTone(environment.status)}>
                          {environment.name}: {environment.status}
                        </StatusBadge>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )
          }
        </SectionView>
      </div>
    </div>
  );
}
