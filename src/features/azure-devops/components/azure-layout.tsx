import { NavLink, Outlet, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { useCredentials } from "@/features/credentials/hooks/use-credentials";
import { getCredentialDisplayName } from "@/features/credentials/utils/credential-display";
import { cn } from "@/utils/cn";
import { useProjects } from "../hooks/use-projects";

const selectClassName =
  "h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20";

const tabClassName = ({ isActive }: { isActive: boolean }) =>
  cn(
    "rounded-lg px-3 py-1.5 text-sm font-medium transition",
    isActive ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
  );

/** Organization + project selectors shared by every Azure DevOps page. */
export function AzureLayout() {
  const { credentialId = "", projectId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const credentials = useCredentials();
  const projects = useProjects(credentialId);

  const selectedProject = projectId ?? searchParams.get("project") ?? "";
  const base = `/azure/${encodeURIComponent(credentialId)}`;

  function selectProject(value: string) {
    navigate(value ? `${base}/projects/${encodeURIComponent(value)}` : base);
  }

  return (
    <section className="flex w-full flex-col gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">Azure DevOps</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Developer cockpit</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="credential-select">
            Organization
          </label>
          <select
            id="credential-select"
            className={selectClassName}
            value={credentialId}
            onChange={(event) => navigate(`/azure/${encodeURIComponent(event.target.value)}`)}
          >
            {(credentials.data ?? []).map((credential) => (
              <option key={credential.id} value={credential.id}>
                {getCredentialDisplayName(credential)}
              </option>
            ))}
          </select>

          <label className="sr-only" htmlFor="project-select">
            Project
          </label>
          <select
            id="project-select"
            className={selectClassName}
            value={
              projects.data?.projects.find(
                (project) => project.id === selectedProject || project.name === selectedProject
              )?.id ?? ""
            }
            onChange={(event) => selectProject(event.target.value)}
            disabled={projects.isLoading}
          >
            <option value="">{projects.isLoading ? "Loading projects..." : "All projects"}</option>
            {(projects.data?.projects ?? []).map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <nav aria-label="Azure DevOps" className="flex flex-wrap gap-1">
        <NavLink to={base} end className={tabClassName}>
          My work
        </NavLink>
        {selectedProject ? (
          <NavLink to={`${base}/projects/${encodeURIComponent(selectedProject)}`} end className={tabClassName}>
            Project overview
          </NavLink>
        ) : null}
        <NavLink to="/actions" className={tabClassName}>
          Approvals & audit
        </NavLink>
      </nav>

      <Outlet />
    </section>
  );
}
