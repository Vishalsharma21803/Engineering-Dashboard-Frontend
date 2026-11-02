import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { SopReportCard } from "@/features/sop/components/sop-report-card";
import { ArrowRightIcon } from "@/components/ui/icons";
import { Pagination } from "@/components/ui/pagination";
import { Updating } from "@/components/ui/updating";
import { usePageParam, useSyncServedPage } from "@/hooks/use-page-param";
import { cn } from "@/utils/cn";

import { ActionReviewDialog } from "../components/action-review-dialog";
import { DeploymentsPanel } from "../components/deployments-panel";
import { EmptyState, ErrorCard, ErrorToast, SectionCard, SectionView, SkeletonRows, StaleDataBanner, StatTile } from "../components/feedback";
import { PipelinesPanel } from "../components/pipelines-panel";
import { PullRequestList } from "../components/pull-request-list";
import { TeamWorkTable } from "../components/work-item-table";
import { useActionReview } from "../hooks/use-action-review";
import { listRepositoryPage, listTeams } from "../api/azure.api";
import { azureKeys } from "../api/azure.keys";
import { useCapabilities, useProjectOverview } from "../hooks/use-projects";
import type { Page, Section } from "../types/azure.types";
import { retryUnlessClientError } from "../utils/query-retry";
import { formatDateTime } from "../utils/format";

function countValue(section: Section<number>) {
  if (section.status === "forbidden") return <span className="text-base text-amber-600">No access</span>;
  if (section.status === "error" || section.data === null) return "—";
  return section.data;
}

/** A small list paged on the server (10 per page), its page kept in the URL as ?{param}=. */
function PagedList<T>({
  credentialId,
  param,
  label,
  empty,
  load,
  queryKey,
  render,
}: {
  credentialId: string;
  param: string;
  label: string;
  empty: string;
  queryKey: readonly unknown[];
  load: (page: number) => Promise<Page<T>>;
  render: (item: T) => ReactNode;
}) {
  const pageParam = usePageParam(param);
  const query = useQuery({
    queryKey: [...queryKey, pageParam.page],
    queryFn: () => load(pageParam.page),
    placeholderData: keepPreviousData,
    retry: retryUnlessClientError,
  });
  useSyncServedPage(pageParam, query.isPlaceholderData ? undefined : query.data?.page);

  if (query.isLoading) return <SkeletonRows rows={2} />;
  if (!query.data) return <ErrorCard error={query.error} credentialId={credentialId} onRetry={() => void query.refetch()} />;
  const stale = query.error ? <StaleDataBanner credentialId={credentialId} error={query.error} onRetry={() => void query.refetch()} isRetrying={query.isFetching} /> : null;
  if (query.data.total === 0) {
    return (
      <>
        {stale}
        <EmptyState>{empty}</EmptyState>
      </>
    );
  }

  return (
    <>
      {stale}
      <Updating active={query.isPlaceholderData}>
        <ul className="divide-y divide-slate-100">{query.data.items.map(render)}</ul>
      </Updating>
      <Pagination
        label={label}
        page={query.data.page}
        totalPages={query.data.totalPages}
        total={query.data.total}
        pageSize={query.data.pageSize}
        disabled={query.isFetching}
        onChange={(next) => pageParam.setPage(next)}
      />
    </>
  );
}

function RepositoriesList({ credentialId, projectId }: { credentialId: string; projectId: string }) {
  return (
    <PagedList
      credentialId={credentialId}
      param="repoPage"
      label="Repository pages"
      empty="No repositories."
      queryKey={azureKeys.repositoryPage(credentialId, projectId)}
      load={(page) => listRepositoryPage(credentialId, projectId, page)}
      render={(repository) => (
        <li key={repository.id} className="flex items-center justify-between gap-2 py-2 text-sm">
          <span className="font-medium text-slate-900">{repository.name}</span>
          <span className="text-xs text-slate-500">
            default: {repository.defaultBranch ?? "—"}
            {repository.isDisabled ? " · disabled" : ""}
          </span>
        </li>
      )}
    />
  );
}

function TeamsList({ credentialId, projectId }: { credentialId: string; projectId: string }) {
  return (
    <PagedList
      credentialId={credentialId}
      param="teamPage"
      label="Team pages"
      empty="No teams."
      queryKey={azureKeys.teams(credentialId, projectId)}
      load={(page) => listTeams(credentialId, projectId, page)}
      render={(team) => (
        <li key={team.id} className="py-1.5 text-sm text-slate-700">
          {team.name}
        </li>
      )}
    />
  );
}

function ProjectWorkItems({ credentialId, projectId }: { credentialId: string; projectId: string }) {
  const [state, setState] = useState<"open" | "all">("open");
  const { setPage } = usePageParam("page");
  const identity = useCapabilities(credentialId).data?.identity ?? null;

  return (
    <SectionCard
      title="Team work items"
      description="Everyone's work items in this project, most recently changed first (up to 200, 10 per page)."
      actions={
        <div className="flex shrink-0 items-center gap-2">
          <span aria-hidden="true" className="text-xs font-medium text-slate-500">Show:</span>
          <div role="group" aria-label="State" className="inline-flex rounded-lg border border-slate-200 p-0.5">
            {(["open", "all"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={state === value}
                onClick={() => {
                  setState(value);
                  setPage(1, { replace: true });
                }}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium transition",
                  state === value ? "bg-inverse text-on-inverse" : "text-slate-600 hover:text-slate-950"
                )}
              >
                {value === "open" ? "Open" : "Changed in last 90 days"}
              </button>
            ))}
          </div>
        </div>
      }
    >
      <TeamWorkTable credentialId={credentialId} projectId={projectId} scope={state} myId={identity?.id ?? null} />
    </SectionCard>
  );
}

function ProjectPullRequests({ credentialId, projectId }: { credentialId: string; projectId: string }) {
  return (
    <SectionCard title="Active pull requests" description="Every open pull request in this project, 10 per page.">
      <PullRequestList scope="team" credentialId={credentialId} projectId={projectId} />
    </SectionCard>
  );
}

export function ProjectOverviewPage() {
  const { credentialId = "", projectId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const buildParam = Number(searchParams.get("build"));
  const focusBuildId = Number.isInteger(buildParam) && buildParam > 0 ? buildParam : null;
  const { data: project, isLoading, isFetching, error, refetch } = useProjectOverview(credentialId, projectId);
  const review = useActionReview();

  if (isLoading) return <SkeletonRows rows={5} />;
  if (!project) {
    return <ErrorCard error={error} credentialId={credentialId} onRetry={() => void refetch()} />;
  }

  return (
    // Keyed on the project: lists, filters and open panels of another project must not carry over.
    <div key={project.id} className="flex flex-col gap-6">
      {error ? <StaleDataBanner credentialId={credentialId} error={error} onRetry={() => void refetch()} isRetrying={isFetching} /> : null}
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
          className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-500"
        >
          My work in this project
          <ArrowRightIcon />
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
          <TeamsList credentialId={credentialId} projectId={project.id} />
        </SectionCard>
      </div>

      <ActionReviewDialog action={review.reviewing} onClose={review.closeReview} />
      <ErrorToast message={review.proposeError} onDismiss={review.clearProposeError} />
    </div>
  );
}
