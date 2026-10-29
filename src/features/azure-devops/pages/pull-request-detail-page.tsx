import { Link, useParams } from "react-router-dom";

import { EmptyState, ErrorCard, SectionCard, SectionView, SkeletonRows, StaleDataBanner } from "../components/feedback";
import { StatusBadge } from "../components/status-badge";
import { usePullRequest } from "../hooks/use-pull-requests";
import { formatRelative } from "../utils/format";
import { VOTE_LABELS } from "../utils/labels";

export function PullRequestDetailPage() {
  const { credentialId = "", projectId = "", repositoryId = "", pullRequestId = "" } = useParams();
  const id = Number(pullRequestId);
  const { data: pr, isLoading, isFetching, error, refetch } = usePullRequest(credentialId, projectId, repositoryId, id);

  if (!Number.isInteger(id) || id <= 0) {
    return <EmptyState>“{pullRequestId}” is not a pull request number.</EmptyState>;
  }

  if (isLoading) return <SkeletonRows rows={5} />;
  if (!pr) {
    return <ErrorCard error={error} credentialId={credentialId} onRetry={() => void refetch()} />;
  }

  const base = `/azure/${encodeURIComponent(credentialId)}`;

  return (
    <div className="flex flex-col gap-6">
      {error ? <StaleDataBanner credentialId={credentialId} error={error} onRetry={() => void refetch()} isRetrying={isFetching} /> : null}
      <div>
        <p className="break-words text-sm text-slate-500">
          {pr.projectName} · {pr.repositoryName} · {pr.sourceBranch} → {pr.targetBranch} · by {pr.createdBy.displayName}{" "}
          {formatRelative(pr.creationDate)}
        </p>
        <h2 className="mt-1 break-words text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">
          PR {pr.pullRequestId} {pr.title}
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <StatusBadge tone={pr.status === "completed" ? "success" : pr.status === "active" ? "info" : "neutral"}>{pr.status}</StatusBadge>
          {pr.isDraft ? <StatusBadge tone="neutral">Draft</StatusBadge> : null}
          <StatusBadge tone={pr.mergeStatus === "conflicts" ? "danger" : pr.mergeStatus === "succeeded" ? "success" : "neutral"}>
            merge: {pr.mergeStatus ?? "unknown"}
          </StatusBadge>
          {pr.unresolvedThreads ? <StatusBadge tone="warning">{pr.unresolvedThreads} unresolved</StatusBadge> : null}
          <a href={pr.webUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-indigo-600 hover:text-indigo-500">
            Open in Azure DevOps ↗
          </a>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <SectionCard title="Reviewers">
          {pr.reviewers.length === 0 ? (
            <EmptyState>No reviewers.</EmptyState>
          ) : (
            <ul className="space-y-2">
              {pr.reviewers.map((reviewer) => (
                <li key={reviewer.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-slate-800">
                    {reviewer.displayName}
                    {reviewer.isRequired ? <span className="text-xs text-slate-500"> (required)</span> : null}
                  </span>
                  <StatusBadge tone={VOTE_LABELS[reviewer.voteLabel].tone}>{VOTE_LABELS[reviewer.voteLabel].label}</StatusBadge>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Policies">
          <SectionView section={pr.policies} label="branch policies">
            {(policies) =>
              policies.length === 0 ? (
                <EmptyState>No branch policies.</EmptyState>
              ) : (
                <ul className="space-y-2">
                  {policies.map((policy, index) => (
                    <li key={index} className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-slate-800">
                        {policy.name}
                        {policy.isBlocking ? "" : <span className="text-xs text-slate-500"> (optional)</span>}
                      </span>
                      <StatusBadge tone={policy.status === "approved" ? "success" : policy.status === "rejected" ? "danger" : "info"}>
                        {policy.status}
                      </StatusBadge>
                    </li>
                  ))}
                </ul>
              )
            }
          </SectionView>
        </SectionCard>

        <SectionCard title="Linked work items">
          <SectionView section={pr.linkedWorkItemIds} label="linked work items">
            {(ids) =>
              ids.length === 0 ? (
                <EmptyState>No work items linked.</EmptyState>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {ids.map((id) => (
                    <li key={id}>
                      <Link
                        to={`${base}/projects/${encodeURIComponent(pr.projectName)}/work-items/${id}`}
                        className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
                      >
                        #{id}
                      </Link>
                    </li>
                  ))}
                </ul>
              )
            }
          </SectionView>
        </SectionCard>
      </div>

      <SectionCard title="Review comments" description="Unresolved threads first.">
        <SectionView section={pr.threads} label="review comments">
          {(threads) =>
            threads.length === 0 ? (
              <EmptyState>No review comments.</EmptyState>
            ) : (
              <ul className="space-y-3">
                {[...threads]
                  .sort((a, b) => Number(a.isResolved) - Number(b.isResolved))
                  .map((thread) => (
                    <li key={thread.id} className="rounded-lg border border-slate-200 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs text-slate-500">{thread.filePath ?? "General comment"}</span>
                        <StatusBadge tone={thread.isResolved ? "success" : "warning"}>{thread.status}</StatusBadge>
                      </div>
                      <ul className="mt-2 space-y-2">
                        {thread.comments.map((comment) => (
                          <li key={comment.id} className="text-sm">
                            <span className="font-medium text-slate-900">{comment.author.displayName}: </span>
                            <span className="whitespace-pre-wrap text-slate-700">{comment.content}</span>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
              </ul>
            )
          }
        </SectionView>
      </SectionCard>
    </div>
  );
}
