import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { SopReportCard } from "@/features/sop/components/sop-report-card";
import { cn } from "@/utils/cn";

import { ActionReviewDialog } from "../components/action-review-dialog";
import { DeploymentsPanel } from "../components/deployments-panel";
import { EmptyState, ErrorCard, ErrorToast, SectionCard, SectionView, SkeletonRows, StatTile } from "../components/feedback";
import { PipelinesPanel } from "../components/pipelines-panel";
import { PullRequestList } from "../components/pull-request-list";
import { WorkItemTable } from "../components/work-item-table";
import { useActionReview } from "../hooks/use-action-review";
import {
  useCapabilities,
  useProjectOverview,
  useProjectPullRequests,
  useProjectWorkItems,
  useRepositories,
} from "../hooks/use-projects";
import type { Section } from "../types/azure.types";
import { formatDateTime } from "../utils/format";

function countValue(section: Section<number>) {
  if (section.status === "forbidden") return <span className="text-base text-amber-600">No access</span>;
  if (section.status === "error" || section.data === null) return "—";
  return section.data;
}

function RepositoriesList({ credentialId, projectId }: { credentialId: string; projectId: string }) {
  const { data: repositories, isLoading, error } = useRepositories(credentialId, projectId);

  if (isLoading) return <SkeletonRows rows={2} />;
  if (error || !repositories) return <ErrorCard error={error} credentialId={credentialId} />;
  if (repositories.length === 0) return <EmptyState>No repositories.</EmptyState>;

  return (
    <ul className="divide-y divide-slate-100">
      {repositories.map((repository) => (
        <li key={repository.id} className="flex items-center justify-between gap-2 py-2 text-sm">
          <span className="font-medium text-slate-900">{repository.name}</span>
          <span className="text-xs text-slate-500">
            default: {repository.defaultBranch ?? "—"}
            {repository.isDisabled ? " · disabled" : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ProjectWorkItems({ credentialId, projectId }: { credentialId: string; projectId: string }) {
  const [state, setState] = useState<"open" | "all">("open");
  const { data: workItems, isLoading, error, refetch } = useProjectWorkItems(credentialId, projectId, state);
  const identity = useCapabilities(credentialId).data?.identity ?? null;

  return (
    <SectionCard
      title="Team work items"
      description="Everyone's work items in this project, most recently changed first (up to 200)."
      actions={
        <div role="group" aria-label="State" className="inline-flex rounded-lg border border-slate-200 p-0.5">
          {(["open", "all"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={state === value}
              onClick={() => setState(value)}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition",
                state === value ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-950"
              )}
            >
              {value === "open" ? "Open" : "Last 90 days"}
            </button>
          ))}
        </div>
      }
    >
      {isLoading ? (
        <SkeletonRows rows={4} />
      ) : error || !workItems ? (
        <ErrorCard error={error} credentialId={credentialId} onRetry={() => void refetch()} />
      ) : (
        <WorkItemTable credentialId={credentialId} workItems={workItems} mode="team" myId={identity?.id ?? null} />
      )}
    </SectionCard>
  );
}

function ProjectPullRequests({ credentialId, projectId }: { credentialId: string; projectId: string }) {
  const { data: pullRequests, isLoading, error, refetch } = useProjectPullRequests(credentialId, projectId);

  return (
    <SectionCard title="Active pull requests" description="Every open pull request in this project.">
      {isLoading ? (
        <SkeletonRows rows={3} />
      ) : error || !pullRequests ? (
        <ErrorCard error={error} credentialId={credentialId} onRetry={() => void refetch()} />
      ) : (
        <PullRequestList
          credentialId={credentialId}
          pullRequests={pullRequests}
          emptyMessage="No active pull requests in this project."
          scope="team"
        />
      )}
    </SectionCard>
  );
}

export function ProjectOverviewPage() {
  const { credentialId = "", projectId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const buildParam = Number(searchParams.get("build"));
  const focusBuildId = Number.isInteger(buildParam) && buildParam > 0 ? buildParam : null;
  const { data: project, isLoading, error, refetch } = useProjectOverview(credentialId, projectId);
  const review = useActionReview();

  if (isLoading) return <SkeletonRows rows={5} />;
  if (error || !project) {
    return <ErrorCard error={error} credentialId={credentialId} onRetry={() => void refetch()} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950">{project.name}</h2>
          <p className="mt-1 text-sm text-slate-600">
            {project.processTemplate ?? "Unknown"} process · {project.visibility}
            {project.description ? ` · ${project.description}` : ""}
          </p>
        </div>
        <Link
          to={`/azure/${encodeURIComponent(credentialId)}?project=${encodeURIComponent(project.id)}`}
          className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
        >
          My work in this project →
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile label="My open items" value={countValue(project.counts.myOpenWorkItems)} hint="assigned to you" />
        <StatTile label="Active PRs" value={countValue(project.counts.activePullRequests)} hint="whole project" />
        <StatTile label="Failing pipelines" value={countValue(project.counts.failingPipelines)} />
        <StatTile label="Repositories" value={countValue(project.counts.repositories)} />
        <StatTile
          label="Current iteration"
          value={
            <SectionView section={project.currentIteration} label="iterations">
              {(iteration) => <span className="text-base">{iteration?.name ?? "None"}</span>}
            </SectionView>
          }
          hint={project.currentIteration.data?.finishDate ? `ends ${formatDateTime(project.currentIteration.data.finishDate)}` : undefined}
        />
      </div>

      <ProjectWorkItems credentialId={credentialId} projectId={project.id} />

      <SopReportCard credentialId={credentialId} projectId={project.id} />

      <ProjectPullRequests credentialId={credentialId} projectId={project.id} />

      <SectionCard title="Pipeline health" description="Expand a pipeline for recent runs, failed stages and errors.">
        <PipelinesPanel
          credentialId={credentialId}
          projectId={project.id}
          focusBuildId={focusBuildId}
          isProposing={review.isProposing}
          onPropose={(input) => review.propose(input)}
        />
      </SectionCard>

      <SectionCard title="Deployments" description="YAML environments and classic releases, where the PAT allows.">
        <DeploymentsPanel credentialId={credentialId} projectId={project.id} />
      </SectionCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Repositories">
          <RepositoriesList credentialId={credentialId} projectId={project.id} />
        </SectionCard>
        <SectionCard title="Teams">
          <SectionView section={project.teams} label="teams">
            {(teams) =>
              teams.length === 0 ? (
                <EmptyState>No teams.</EmptyState>
              ) : (
                <ul className="space-y-1 text-sm text-slate-700">
                  {teams.map((team) => (
                    <li key={team.id}>{team.name}</li>
                  ))}
                </ul>
              )
            }
          </SectionView>
        </SectionCard>
      </div>

      <ActionReviewDialog action={review.reviewing} onClose={review.closeReview} />
      <ErrorToast message={review.proposeError} onDismiss={review.clearProposeError} />
    </div>
  );
}
