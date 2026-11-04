import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { SopReportCard } from "@/features/sop/components/sop-report-card";
import { ActiveIndicator } from "@/components/ui/active-indicator";
import { ArrowRightIcon } from "@/components/ui/icons";
import { Pagination } from "@/components/ui/pagination";
import { Segmented } from "@/components/ui/segmented";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Updating } from "@/components/ui/updating";
import { usePageParam, useSearchParamsUpdate, useSyncServedPage } from "@/hooks/use-page-param";
import { useUrlTab } from "@/hooks/use-url-tab";

import { ActionReviewDialog } from "../components/action-review-dialog";
import { DeploymentsPanel } from "../components/deployments-panel";
import { EmptyState, ErrorCard, ErrorToast, SectionCard, SkeletonRows, StaleDataBanner } from "../components/feedback";
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

/** One figure of the summary line; "no access" or "—" when the PAT or Azure did not allow it; "n+" when the read hit its cap. */
function Count({ section, one, many, truncated = false }: { section: Section<number>; one: string; many: string; truncated?: boolean | undefined }) {
  const value = section.status === "forbidden" ? null : section.status === "error" ? null : section.data;
  return (
    <span className="whitespace-nowrap">
      {section.status === "forbidden" ? (
        <span className="text-amber-700">No access to {many}</span>
      ) : (
        <>
          <span className="font-semibold text-slate-950 tabular-nums">{value === null ? "—" : truncated ? `${value}+` : value}</span>{" "}
          <span className="text-slate-600">{value === 1 && !truncated ? one : many}</span>
        </>
      )}
    </span>
  );
}

const TABS = [
  { id: "work", label: "Work items" },
  { id: "delivery", label: "PRs & pipelines" },
  { id: "sop", label: "SOP report" },
  { id: "repos", label: "Repos & teams" },
] as const;
type TabId = (typeof TABS)[number]["id"];
const isTab = (value: string | null): value is TabId => TABS.some((tab) => tab.id === value);

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
  if (!query.data) return <ErrorCard error={query.error} credentialId={credentialId} onRetry={() => void query.refetch()} isRetrying={query.isFetching} />;
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
  const [searchParams] = useSearchParams();
  const updateParams = useSearchParamsUpdate();
  // Kept in the URL (?show=recent), so a reload or a shared link keeps the choice.
  const show = searchParams.get("show") === "recent" ? "recent" : "open";
  const identity = useCapabilities(credentialId).data?.identity ?? null;

  return (
    <SectionCard
      title="Team work items"
      help="Everyone's work items in this project under their user story, most recently changed first. Open: not done. Recently changed: anything changed in the last 90 days. Up to 1000 items."
      actions={
        <div className="flex shrink-0 items-center gap-2">
          <span aria-hidden="true" className="text-xs font-medium text-slate-500">Show:</span>
          <Segmented
            label="State"
            size="sm"
            value={show}
            options={[
              { value: "open", label: "Open" },
              { value: "recent", label: "Recently changed" },
            ]}
            onChange={(value) => updateParams({ show: value === "open" ? null : value, page: null }, { replace: true })}
          />
        </div>
      }
    >
      <TeamWorkTable credentialId={credentialId} projectId={projectId} scope={show === "recent" ? "all" : "open"} myId={identity?.id ?? null} />
    </SectionCard>
  );
}

function ProjectPullRequests({ credentialId, projectId }: { credentialId: string; projectId: string }) {
  return (
    <SectionCard title="Active pull requests" help="Every open pull request in this project.">
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
  // A link to a pipeline run opens the pipelines tab.
  const [tab, setTab] = useUrlTab(isTab, focusBuildId !== null ? "delivery" : "work");

  if (isLoading) return <SkeletonRows rows={5} />;
  if (!project) {
    return <ErrorCard error={error} credentialId={credentialId} onRetry={() => void refetch()} isRetrying={isFetching} />;
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

      <div role="group" aria-label="Summary" className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl border border-slate-200 bg-surface px-4 py-2.5 text-sm shadow-sm">
        <Count section={project.counts.myOpenWorkItems} one="open item of yours" many="open items of yours" truncated={project.myOpenWorkItemsTruncated} />
        <Count section={project.counts.activePullRequests} one="active pull request" many="active pull requests" truncated={project.activePullRequestsTruncated} />
        <Count section={project.counts.failingPipelines} one="failing pipeline" many="failing pipelines" truncated={project.failingPipelinesTruncated} />
        <Count section={project.counts.repositories} one="repository" many="repositories" />
        {project.currentIteration.status === "ok" && project.currentIteration.data ? (
          <span className="whitespace-nowrap text-slate-600">
            <span className="font-semibold text-slate-950">{project.currentIteration.data.name}</span>
            {project.currentIteration.data.finishDate ? ` · ends ${formatDateTime(project.currentIteration.data.finishDate)}` : ""}
          </span>
        ) : null}
      </div>

      <Tabs value={tab} onValueChange={(value) => isTab(value) && setTab(value)} className="gap-6">
        <TabsList variant="line" aria-label="Sections" className="-mx-4 px-4 sm:mx-0 sm:px-0">
          <ActiveIndicator variant="underline" />
          {TABS.map((item) => (
            <TabsTrigger key={item.id} value={item.id}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="work" className="flex flex-col gap-6">
          <ProjectWorkItems credentialId={credentialId} projectId={project.id} />
        </TabsContent>

        <TabsContent value="delivery" className="flex flex-col gap-6">
          <ProjectPullRequests credentialId={credentialId} projectId={project.id} />
          <SectionCard title="Pipeline health" help="Expand a pipeline for recent runs, failed stages and errors.">
            <PipelinesPanel
              credentialId={credentialId}
              projectId={project.id}
              focusBuildId={focusBuildId}
              isProposing={review.isProposing}
              onPropose={(input) => review.propose(input)}
            />
          </SectionCard>
          <SectionCard title="Deployments" help="YAML environments and classic releases, where the PAT allows.">
            <DeploymentsPanel credentialId={credentialId} projectId={project.id} />
          </SectionCard>
        </TabsContent>

        <TabsContent value="sop" className="flex flex-col gap-6">
          <SopReportCard credentialId={credentialId} projectId={project.id} />
        </TabsContent>

        <TabsContent value="repos">
          <div className="grid gap-6 lg:grid-cols-2">
            <SectionCard title="Repositories">
              <RepositoriesList credentialId={credentialId} projectId={project.id} />
            </SectionCard>
            <SectionCard title="Teams">
              <TeamsList credentialId={credentialId} projectId={project.id} />
            </SectionCard>
          </div>
        </TabsContent>
      </Tabs>

      <ActionReviewDialog action={review.reviewing} onClose={review.closeReview} />
      <ErrorToast message={review.proposeError} onDismiss={review.clearProposeError} />
    </div>
  );
}
