import { Navigate, useParams } from "react-router-dom";

import { ErrorCard, EmptyState, SkeletonRows } from "../components/feedback";
import { useProjects } from "../hooks/use-projects";
import { resolveDefaultProject } from "../utils/last-project";

/**
 * /azure/:credentialId/projects has no page of its own: the header picks
 * the project, so this opens the last viewed (or first) project overview.
 */
export function ProjectsPage() {
  const { credentialId = "" } = useParams();
  const { data, isLoading, isFetching, error, refetch } = useProjects(credentialId);

  if (isLoading) return <SkeletonRows rows={4} />;
  if (error || !data) {
    return <ErrorCard error={error} credentialId={credentialId} onRetry={() => void refetch()} isRetrying={isFetching} />;
  }

  const projectId = resolveDefaultProject(credentialId, "", data.projects);

  if (!projectId) {
    return <EmptyState>This PAT cannot see any projects in the organization.</EmptyState>;
  }

  return (
    <Navigate
      to={`/azure/${encodeURIComponent(credentialId)}/projects/${encodeURIComponent(projectId)}`}
      replace
    />
  );
}
