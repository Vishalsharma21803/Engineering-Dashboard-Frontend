import { Search } from "lucide-react";
import { useEffect } from "react";
import { NavLink, Outlet, useLocation, useMatch, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { ActiveIndicator } from "@/components/ui/active-indicator";
import { Hint } from "@/components/ui/hint";
import { SelectField } from "@/components/ui/select-field";
import { useCredentials } from "@/features/credentials/hooks/use-credentials";
import { getCredentialDisplayName } from "@/features/credentials/utils/credential-display";
import { cn } from "@/utils/cn";
import { CommandPalette } from "./command-palette";
import { useActions } from "../hooks/use-actions";
import { useProjects } from "../hooks/use-projects";
import {
  getSelectedProject,
  resolveDefaultProject,
  saveLastCredential,
  saveSelectedProject,
} from "../utils/last-project";

const tabClassName = ({ isActive }: { isActive: boolean }) =>
  cn(
    "-mb-px inline-flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 py-3 text-sm font-medium transition",
    isActive
      ? "border-transparent text-indigo-700"
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

  const pages = [
    { label: "My work", to: withProject(base), key: "m" },
    { label: "Project overview", to: overviewProject ? `${base}/projects/${encodeURIComponent(overviewProject)}` : `${base}/projects`, key: "o" },
    { label: "Approvals & audit", to: withProject(`${base}/actions`), key: "a" },
    { label: "Time", to: "/time", key: "t" },
    { label: "SOP rules", to: "/sop-rules", key: "s" },
    { label: "Credentials", to: "/credentials", key: "c" },
  ];

  return (
    <section className="flex w-full flex-col gap-6">
      <CommandPalette credentialId={credentialId} pages={pages} />
      <div className="rounded-xl border border-slate-200 bg-surface shadow-sm">
        <h1 className="sr-only">
          Azure DevOps · {credential ? getCredentialDisplayName(credential) : "organization"}
          {project ? ` · ${project.name}` : ""}
        </h1>
        <div className="flex flex-col-reverse gap-x-4 gap-y-2 px-4 pt-2 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
          <nav aria-label="Azure DevOps" className="relative flex gap-6 overflow-x-auto whitespace-nowrap">
            <ActiveIndicator variant="underline" />
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
                <Hint label="Pending approvals could not be loaded">
                  <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-slate-300 px-1.5 text-xs font-semibold text-slate-700">
                    ?<span className="sr-only"> pending approvals could not be loaded</span>
                  </span>
                </Hint>
              ) : null}
            </NavLink>
          </nav>

          <div className="flex min-w-0 flex-wrap items-center gap-2 lg:flex-nowrap">
            <button
              type="button"
              onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }))}
              className="inline-flex h-8 items-center gap-2 rounded-lg border border-slate-200 px-2.5 text-sm text-slate-500 outline-none transition-colors hover:bg-slate-50 hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <Search aria-hidden="true" className="size-4" />
              Search
              <kbd className="rounded border border-slate-200 px-1 text-[11px] text-slate-500">⌘K</kbd>
            </button>
            <label htmlFor="credential-select" className="sr-only">
              Organization
            </label>
            <SelectField
              id="credential-select"
              size="sm"
              className="min-w-0 font-medium sm:w-44"
              value={credentialId}
              onValueChange={(selected) => selectCredential(selected)}
            >
              {credentials.error && !credentials.data ? <option value={credentialId}>Organizations could not be loaded</option> : null}
              {(credentials.data ?? []).map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {getCredentialDisplayName(candidate)}
                </option>
              ))}
            </SelectField>
            <label htmlFor="project-select" className="sr-only">
              Project
            </label>
            <SelectField
              id="project-select"
              size="sm"
              className="min-w-0 font-medium sm:w-44"
              value={project?.id ?? ""}
              onValueChange={(selected) => selectProject(selected)}
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
            </SelectField>
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
      </div>

      <Outlet />
    </section>
  );
}
