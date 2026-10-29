import { useMutation, useQueryClient } from "@tanstack/react-query";

import { EmptyState, ErrorCard, SkeletonRows, StaleDataBanner } from "@/features/azure-devops/components/feedback";
import { useProjects } from "@/features/azure-devops/hooks/use-projects";
import { updateConnection } from "../api/solidtime.api";
import { solidtimeKeys } from "../api/solidtime.keys";
import { useCatalog } from "../hooks/use-solidtime";
import { sameNameProjects } from "../utils/project-map";
import type { SolidtimeConnection } from "../types/solidtime.types";

/** Which Solidtime project a ticket's time goes to, per Azure project (same name is used when not set). */
export function ProjectMapping({ connection }: { connection: SolidtimeConnection }) {
  if (!connection.azureCredentialId) {
    return <p className="text-sm text-slate-600">Link an Azure DevOps organization on the Credentials page to map its projects.</p>;
  }

  // Only mounted with a linked organization, so Azure projects are never read for "".
  return <MappingList connection={connection} azureCredentialId={connection.azureCredentialId} />;
}

function MappingList({ connection, azureCredentialId }: { connection: SolidtimeConnection; azureCredentialId: string }) {
  const queryClient = useQueryClient();
  const azure = useProjects(azureCredentialId);
  const catalog = useCatalog(connection.credentialId);
  const save = useMutation({
    mutationFn: (projectMap: Record<string, string>) => updateConnection(connection.credentialId, { projectMap }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: solidtimeKeys.all }),
  });

  const projects = catalog.data?.projects ?? [];

  return (
    <section aria-labelledby="mapping-title" className="flex flex-col gap-2">
      <h3 id="mapping-title" className="text-sm font-semibold text-slate-900">
        Azure project → Solidtime project
      </h3>
      <p className="text-xs text-slate-500">Used for timers and drafted entries. Without a choice, a Solidtime project with the same name is used.</p>
      {azure.error && azure.data ? <StaleDataBanner error={azure.error} onRetry={() => void azure.refetch()} isRetrying={azure.isFetching} /> : null}
      {catalog.error && catalog.data ? <StaleDataBanner error={catalog.error} onRetry={() => void catalog.refetch()} isRetrying={catalog.isFetching} /> : null}
      {azure.isLoading || catalog.isLoading ? (
        <SkeletonRows rows={2} />
      ) : !azure.data ? (
        // Unknown is not "no projects": a failed read never shows an empty mapping.
        <ErrorCard error={azure.error} credentialId={azureCredentialId} onRetry={() => void azure.refetch()} isRetrying={azure.isFetching} />
      ) : !catalog.data ? (
        <ErrorCard error={catalog.error} onRetry={() => void catalog.refetch()} isRetrying={catalog.isFetching} />
      ) : azure.data.projects.length === 0 ? (
        <EmptyState>The linked Azure DevOps organization has no projects to map.</EmptyState>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
          {azure.data.projects.map((project) => {
            const key = project.name.toLowerCase();
            const sameName = sameNameProjects(project.name, projects);

            return (
              <li key={project.id} className="grid items-center gap-2 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_18rem]">
                <span className="font-medium text-slate-800">{project.name}</span>
                <select
                  aria-label={`Solidtime project for ${project.name}`}
                  className="h-9 w-full rounded-lg border border-slate-300 bg-surface px-2.5 text-sm"
                  value={connection.projectMap[key] ?? ""}
                  disabled={save.isPending}
                  onChange={(event) => {
                    const next = { ...connection.projectMap };
                    if (event.target.value) next[key] = event.target.value;
                    else delete next[key];
                    save.mutate(next);
                  }}
                >
                  <option value="">{sameName.length === 1 ? `Same name (${sameName[0]!.name})` : sameName.length > 1 ? `None (${sameName.length} projects match: choose one)` : "None"}</option>
                  {projects.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name}
                    </option>
                  ))}
                </select>
              </li>
            );
          })}
        </ul>
      )}
      {save.error ? <p role="alert" className="text-sm text-rose-600">The mapping could not be saved.</p> : null}
    </section>
  );
}
