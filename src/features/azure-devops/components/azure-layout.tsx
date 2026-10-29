import { useEffect } from "react";
import { NavLink, Outlet, useLocation, useMatch, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { useCredentials } from "@/features/credentials/hooks/use-credentials";
import { getCredentialDisplayName } from "@/features/credentials/utils/credential-display";
import { cn } from "@/utils/cn";
import { useActions } from "../hooks/use-actions";
import { useProjects } from "../hooks/use-projects";
import {
  getSelectedProject,
  resolveDefaultProject,
  saveLastCredential,
  saveSelectedProject,
} from "../utils/last-project";

const selectClassName =
  "h-9 w-full min-w-0 rounded-lg border border-slate-300 bg-surface px-2.5 text-sm font-medium text-slate-900 shadow-sm transition hover:border-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-50 sm:h-10 sm:min-w-44 sm:px-3";

const tabClassName = ({ isActive }: { isActive: boolean }) =>
  cn(
    "-mb-px inline-flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-2.5 py-3 text-sm font-medium transition sm:px-3",
    isActive
      ? "border-indigo-600 text-indigo-700"
      : "border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-950"
  );

function savedIsValidFor(
  projectList: Array<{ id: string; name: string }> | undefined,
  saved: string | null
): saved is string {
  return Boolean(saved) && (projectList ?? []).some((candidate) => candidate.id === saved || candidate.name === saved);
}

/** Organization + project selectors and tabs shared by every Azure DevOps page. */
export function AzureLayout() {
  const { credentialId = "", projectId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const credentials = useCredentials();
  const projects = useProjects(credentialId);
  const pending = useActions({ status: "PENDING", credentialId });
  const location = useLocation();
  const onMyWork = useMatch("/azure/:credentialId") !== null;
  const onApprovals = useMatch("/azure/:credentialId/actions") !== null;
  const onOverview = useMatch("/azure/:credentialId/projects/:projectId") !== null;
  const onProjectsIndex = useMatch("/azure/:credentialId/projects") !== null;
  // Work item and PR pages also live under /projects; they are reached from any tab, so no tab is highlighted there.
  const onProjectPage = useMatch("/azure/:credentialId/projects/*") !== null;

  // The URL wins; otherwise fall back to what was chosen last for this organization.
  const urlProject = projectId ?? searchParams.get("project");
  const savedProject = getSelectedProject(credentialId);
  // A remembered project only counts once it is confirmed to exist in this organization.
  const savedIsValid = savedIsValidFor(projects.data?.projects, savedProject);
  const selectedProject = urlProject ?? (savedIsValid ? savedProject : "");
  const base = `/azure/${encodeURIComponent(credentialId)}`;
  const withProject = (path: string, value = selectedProject) =>
    value ? `${path}?project=${encodeURIComponent(value)}` : path;

  useEffect(() => {
    saveLastCredential(credentialId);
  }, [credentialId]);

  useEffect(() => {
    const listTab = onMyWork || onApprovals;

    if (listTab && urlProject === null && savedIsValid && savedProject) {
      // Re-apply the remembered project when a tab is opened without one, unless the
      // user picked a project (or "All") since this render: their choice wins.
      const chosenMeanwhile =
        new URLSearchParams(window.location.search).has("project") ||
        getSelectedProject(credentialId) !== savedProject;

      if (!chosenMeanwhile) {
        navigate(withProject(location.pathname, savedProject), { replace: true });
      }
      return;
    }

    if ((listTab || onOverview) && urlProject !== null) {
      saveSelectedProject(credentialId, urlProject);
    }
  }, [credentialId, urlProject, savedProject, savedIsValid, onMyWork, onApprovals, onOverview, location.pathname, navigate]);

  const credential = credentials.data?.find((candidate) => candidate.id === credentialId);
  const project = projects.data?.projects.find(
    (candidate) => candidate.id === selectedProject || candidate.name === selectedProject
  );
  const pendingCount = pending.data?.total ?? 0;
  const overviewProject = resolveDefaultProject(credentialId, selectedProject, projects.data?.projects ?? []);

  /** Switching organization keeps the current tab; that organization's own project selection applies. */
  function selectCredential(nextCredentialId: string) {
    const nextBase = `/azure/${encodeURIComponent(nextCredentialId)}`;

    if (onApprovals) {
      navigate(`${nextBase}/actions`);
    } else if (onProjectPage) {
      // Projects differ per organization: open that organization's remembered (or first) project.
      navigate(`${nextBase}/projects`);
    } else {
      navigate(nextBase);
    }
  }

  function selectProject(value: string) {
    if (onProjectPage && !value) {
      return;
    }

    saveSelectedProject(credentialId, value);

    if (onMyWork || onApprovals) {
      // List tabs narrow to the project instead of leaving the tab.
      navigate(withProject(location.pathname, value));
      return;
    }

    navigate(value ? `${base}/projects/${encodeURIComponent(value)}` : base);
  }

  return (
    <section className="flex w-full flex-col gap-6">
      <div className="rounded-xl border border-slate-200 bg-surface shadow-sm">
        <div className="flex flex-col gap-3 p-4 sm:gap-5 sm:p-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-indigo-600 to-sky-500 text-white shadow-sm sm:size-12">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" className="size-5 sm:size-6">
                <path d="M4 5h7v7H4zM13 5h7v4h-7zM13 11h7v8h-7zM4 14h7v5H4z" strokeLinejoin="round" />
              </svg>
            </span>
            <div className="min-w-0">
              <p className="hidden text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600 sm:block">Azure DevOps</p>
              <h1 className="text-xl font-semibold tracking-tight text-slate-950 sm:text-3xl">Developer cockpit</h1>
              <p className="mt-0.5 truncate text-xs text-slate-500 sm:text-sm">
                {credential?.organizationUrl ?? (credentials.error ? "Organization could not be loaded" : "Loading organization...")}
                {project ? ` · ${project.name}` : " · all projects"}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <div className="min-w-0 space-y-1">
              <label htmlFor="credential-select" className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                Organization
              </label>
              <select
                id="credential-select"
                className={selectClassName}
                value={credentialId}
                onChange={(event) => selectCredential(event.target.value)}
              >
                {credentials.error && !credentials.data ? <option value={credentialId}>Organizations could not be loaded</option> : null}
                {(credentials.data ?? []).map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {getCredentialDisplayName(candidate)}
                  </option>
                ))}
              </select>
            </div>

            <div className="min-w-0 space-y-1">
              <label htmlFor="project-select" className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                Project
              </label>
              <select
                id="project-select"
                className={selectClassName}
                value={project?.id ?? ""}
                onChange={(event) => selectProject(event.target.value)}
                disabled={projects.isLoading}
              >
                {/* Project pages need a single project, so "All projects" is only offered on My work and Approvals. */}
                <option value="" disabled={onProjectPage && !projects.isLoading}>
                  {projects.isLoading
                    ? "Loading projects..."
                    : projects.error && !projects.data
                      ? "Projects could not be loaded"
                      : onProjectPage
                      ? "All projects (My work & Approvals only)"
                      : "All projects"}
                </option>
                {(projects.data?.projects ?? []).map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {(projects.error && !projects.data) || (credentials.error && !credentials.data) ? (
          <div role="alert" className="flex flex-wrap items-center gap-2 border-t border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 sm:px-5">
            Could not load your {credentials.error && !credentials.data ? "organizations" : "projects"} from {credentials.error && !credentials.data ? "Cockpit" : "Azure DevOps"}.
            <button
              type="button"
              className="font-medium underline"
              onClick={() => void (credentials.error ? credentials.refetch() : projects.refetch())}
            >
              Try again
            </button>
          </div>
        ) : null}

        <nav aria-label="Azure DevOps" className="flex gap-1 overflow-x-auto whitespace-nowrap border-t border-slate-200 px-2 sm:px-3">
          <NavLink to={withProject(base)} end className={tabClassName}>
            My work
          </NavLink>
          <NavLink
            to={overviewProject ? `${base}/projects/${encodeURIComponent(overviewProject)}` : `${base}/projects`}
            end
            className={() => tabClassName({ isActive: onOverview || onProjectsIndex })}
          >
            Project overview
          </NavLink>
          <NavLink to={withProject(`${base}/actions`)} className={tabClassName}>
            <span>
              Approvals<span className="sr-only sm:not-sr-only"> & audit</span>
            </span>
            {pendingCount > 0 ? (
              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-xs font-semibold text-white">
                {pendingCount}
              </span>
            ) : pending.error && !pending.data ? (
              <span title="Pending approvals could not be loaded" className="inline-flex min-w-5 items-center justify-center rounded-full bg-slate-300 px-1.5 text-xs font-semibold text-slate-700">
                ?<span className="sr-only"> pending approvals could not be loaded</span>
              </span>
            ) : null}
          </NavLink>
        </nav>
      </div>

      <Outlet />
    </section>
  );
}
