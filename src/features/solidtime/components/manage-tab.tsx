import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { ErrorCard, SkeletonRows } from "@/features/azure-devops/components/feedback";
import type { ProposeActionInput } from "@/features/azure-devops/types/action.types";
import { retryUnlessClientError } from "@/features/azure-devops/utils/query-retry";
import { usePageParam, useSyncServedPage } from "@/hooks/use-page-param";
import { listCatalogPage } from "../api/solidtime.api";
import { solidtimeKeys } from "../api/solidtime.keys";
import { useCatalog } from "../hooks/use-solidtime";
import type { SolidtimeConnection, SolidtimeProject, SolidtimeTask } from "../types/solidtime.types";
import { formatDuration } from "../utils/time";

type Kind = "projects" | "tasks" | "tags" | "clients";

const TITLES: Record<Kind, string> = { projects: "Projects", tasks: "Tasks", tags: "Tags", clients: "Clients" };
const CREATE_KIND = { projects: "SOLIDTIME_PROJECT_CREATE", tasks: "SOLIDTIME_TASK_CREATE", tags: "SOLIDTIME_TAG_CREATE", clients: "SOLIDTIME_CLIENT_CREATE" } as const;

function List({ connection, kind, onPropose, isProposing }: { connection: SolidtimeConnection; kind: Kind; onPropose: (input: ProposeActionInput) => void; isProposing: boolean }) {
  const pageParam = usePageParam(`${kind}Page`);
  const catalog = useCatalog(connection.credentialId);
  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState("");
  const list = useQuery({
    queryKey: [...solidtimeKeys.list(connection.credentialId, kind), pageParam.page],
    queryFn: () => listCatalogPage(connection.credentialId, kind, pageParam.page),
    placeholderData: keepPreviousData,
    retry: retryUnlessClientError,
  });
  useSyncServedPage(pageParam, list.data && !list.isPlaceholderData ? list.data.page : undefined);

  function submit(event: FormEvent) {
    event.preventDefault();
    const params = kind === "tasks" ? { name: name.trim(), projectId, estimatedHours: null } : { name: name.trim() };
    onPropose({ credentialId: connection.credentialId, kind: CREATE_KIND[kind], target: {}, params });
    setName("");
  }

  return (
    <section aria-labelledby={`${kind}-title`} className="flex flex-col gap-2">
      <h3 id={`${kind}-title`} className="text-sm font-semibold text-slate-900">
        {TITLES[kind]}
      </h3>
      {list.isLoading ? (
        <SkeletonRows rows={2} />
      ) : list.error || !list.data ? (
        <ErrorCard error={list.error} onRetry={() => void list.refetch()} />
      ) : (
        <>
          <ul aria-label={TITLES[kind]} className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
            {list.data.items.length === 0 ? <li className="px-3 py-2 text-slate-500">None yet.</li> : null}
            {list.data.items.map((item) => (
              <li key={item.id} className="flex justify-between gap-2 px-3 py-2">
                <span className="text-slate-800">{item.name}</span>
                {"spent_time" in item ? <span className="text-xs text-slate-500">{formatDuration((item as SolidtimeProject | SolidtimeTask).spent_time)}</span> : null}
              </li>
            ))}
          </ul>
          <Pagination label={`${TITLES[kind]} pages`} page={list.data.page} totalPages={list.data.totalPages} total={list.data.total} pageSize={list.data.pageSize} disabled={list.isFetching} onChange={(next) => pageParam.setPage(next)} />
        </>
      )}
      <form onSubmit={submit} className="flex flex-wrap gap-2" aria-label={`New ${kind.slice(0, -1)}`}>
        {kind === "tasks" ? (
          <select aria-label="Project for the new task" className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
            <option value="">Choose a project</option>
            {(catalog.data?.projects ?? []).map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        ) : null}
        <Input aria-label={`New ${kind.slice(0, -1)} name`} className="h-9 w-56" value={name} onChange={(event) => setName(event.target.value)} />
        <Button size="sm" type="submit" variant="secondary" disabled={isProposing || !name.trim() || (kind === "tasks" && !projectId)}>
          Create…
        </Button>
      </form>
    </section>
  );
}

/** Solidtime projects, tasks, tags and clients. Creating needs a Manager role in Solidtime (or task rights for employees). */
export function ManageTab({ connection, onPropose, isProposing }: { connection: SolidtimeConnection; onPropose: (input: ProposeActionInput) => void; isProposing: boolean; today?: string }) {
  return (
    <div className="flex flex-col gap-6">
      {!connection.canViewTeam ? <p className="text-sm text-slate-600">Your Solidtime role is {connection.role ?? "unknown"}: creating projects, tags and clients needs a Manager role there.</p> : null}
      <div className="grid gap-6 lg:grid-cols-2">
        {(["projects", "tasks", "tags", "clients"] as const).map((kind) => (
          <List key={kind} connection={connection} kind={kind} onPropose={onPropose} isProposing={isProposing} />
        ))}
      </div>
    </div>
  );
}
