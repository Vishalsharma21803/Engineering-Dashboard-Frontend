import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Updating } from "@/components/ui/updating";
import { Pagination } from "@/components/ui/pagination";
import { usePageParam, useSearchParamsUpdate, useSyncServedPage } from "@/hooks/use-page-param";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { ErrorCard } from "@/features/azure-devops/components/feedback";
import { StatusBadge } from "@/features/azure-devops/components/status-badge";
import { formatRelative } from "@/features/azure-devops/utils/format";
import { useCredentials } from "@/features/credentials/hooks/use-credentials";
import { getCredentialDisplayName } from "@/features/credentials/utils/credential-display";
import { ApiError } from "@/lib/api-client";
import {
  getProjectSuggestion,
  listAzureProjectsForSop,
  listProjectChanges,
  listSopProjects,
  removeProjectSetUp,
  saveProjectSetUp,
  setProjectChecked,
} from "../api/sop.api";
import { sopKeys } from "../api/sop.keys";
import { SOP_STAGE_OPTIONS, type AzureSopProject, type ProjectSettings, type SopStageName } from "../types/sop.types";

const SELECT = "h-9 w-full rounded-lg border border-slate-300 bg-surface px-2 text-sm";

const STAGE_LABELS: Record<SopStageName, string> = {
  ready: "Ready (new, not started)",
  estimation: "Estimation",
  active: "Active (work started)",
  review: "Review",
  testing: "Testing",
  qa: "QA",
  uat: "UAT",
  done: "Done",
};

const ITEM_KINDS = ["story", "task", "bug", "feature", "epic", "impediment"] as const;
const ROLE_LABELS = { tl: "Team leads", qa: "QA", po: "Product owners" } as const;
const listText = (values: string[]) => values.join(", ");
const listFrom = (text: string) => [...new Set(text.split(",").map((value) => value.trim()).filter(Boolean))];

const KIND_LABELS = { CREATED: "Set up", UPDATED: "Changed", REMOVED: "Removed", IMPORTED: "Moved from the rulebook" } as const;

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function errorText(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    return error.errors.length ? error.errors.map((item) => `${item.field}: ${item.message}`).join(" · ") : error.message;
  }

  return fallback;
}

/** stage → states, from a state → stage choice per row. */
function stagesFrom(choice: Record<string, SopStageName | "">): ProjectSettings["stages"] {
  const stages: ProjectSettings["stages"] = {};

  for (const [state, stage] of Object.entries(choice)) {
    if (stage) {
      stages[stage] = [...(stages[stage] ?? []), state];
    }
  }

  return stages;
}

interface SetUpFormProps {
  credentialId: string;
  project: AzureSopProject;
  onDone: () => void;
}

/** Pre-filled from Azure (or the existing set-up); saves the shared set-up for everyone. */
function SetUpForm({ credentialId, project, onDone }: SetUpFormProps) {
  const queryClient = useQueryClient();
  const suggestion = useQuery({
    queryKey: sopKeys.projectSuggestion(credentialId, project.id),
    queryFn: () => getProjectSuggestion(credentialId, project.id),
    staleTime: 0,
  });

  if (suggestion.isLoading) {
    return (
      <p className="flex items-center gap-2 text-sm text-slate-500">
        <Spinner className="size-4" /> Reading {project.name} from Azure DevOps…
      </p>
    );
  }

  if (suggestion.error || !suggestion.data) {
    return <ErrorCard error={suggestion.error} credentialId={credentialId} onRetry={() => void suggestion.refetch()} />;
  }

  return (
    <SetUpFields
      key={project.id}
      projectName={suggestion.data.projectName}
      initial={suggestion.data.settings}
      isNew={!suggestion.data.setUp}
      states={suggestion.data.states}
      fieldCandidates={suggestion.data.fieldCandidates}
      onSaved={() => {
        void queryClient.invalidateQueries({ queryKey: sopKeys.all });
        // SOP results everywhere depend on the project set-up.
        void queryClient.invalidateQueries({ queryKey: ["azure"] });
        onDone();
      }}
      onCancel={onDone}
    />
  );
}

interface SetUpFieldsProps {
  projectName: string;
  initial: ProjectSettings;
  isNew: boolean;
  states: Array<{ name: string; category: string; types: string[] }>;
  fieldCandidates: { category: string[]; targetCompletion: string[] };
  onSaved: () => void;
  onCancel: () => void;
}

function SetUpFields({ projectName, initial, isNew, states, fieldCandidates, onSaved, onCancel }: SetUpFieldsProps) {
  const stageOf = (state: string): SopStageName | "" =>
    SOP_STAGE_OPTIONS.find((stage) => initial.stages[stage]?.some((name) => name.toLowerCase() === state.toLowerCase())) ?? "";
  // States from Azure, plus any the set-up mentions that Azure no longer lists (kept unless changed).
  const allStates = [
    ...states.map((state) => state.name),
    ...Object.values(initial.stages)
      .flat()
      .filter((name) => !states.some((state) => state.name.toLowerCase() === name.toLowerCase())),
  ];
  const [choice, setChoice] = useState<Record<string, SopStageName | "">>(() => Object.fromEntries(allStates.map((state) => [state, stageOf(state)])));
  const [category, setCategory] = useState(initial.fields.category ?? "");
  const [target, setTarget] = useState(initial.fields.targetCompletion ?? "");
  const [categories, setCategories] = useState(() => Object.entries(initial.categories).map(([name, meaning]) => ({ name, meaning })));
  const [branch, setBranch] = useState(initial.prTargetBranch ?? "");
  const [timeZone, setTimeZone] = useState(isNew ? browserTimeZone() : initial.timeZone);
  const [stageSource, setStageSource] = useState(initial.stageSource);
  const [roles, setRoles] = useState({ tl: listText(initial.roles.tl), qa: listText(initial.roles.qa), po: listText(initial.roles.po) });
  const [tags, setTags] = useState(listText(initial.tagVocabulary));
  const [types, setTypes] = useState(() => Object.fromEntries(ITEM_KINDS.map((kind) => [kind, listText(initial.workItemTypes[kind] ?? [])])) as Record<string, string>);
  const [branchPattern, setBranchPattern] = useState(initial.branchPattern ?? "");
  const { user } = useAuth();
  const isOwner = user?.isSopAdmin ?? false;

  const save = useMutation({
    mutationFn: () =>
      saveProjectSetUp(projectName, {
        ...initial,
        stages: stagesFrom(choice),
        fields: { category: category || null, targetCompletion: target || null },
        // Categories only mean something with a category field; without one none are kept (and none reach the AI).
        categories: category
          ? Object.fromEntries(categories.filter((entry) => entry.name.trim()).map((entry) => [entry.name.trim(), entry.meaning.trim()]))
          : {},
        stageSource,
        roles: { tl: listFrom(roles.tl), qa: listFrom(roles.qa), po: listFrom(roles.po) },
        tagVocabulary: listFrom(tags),
        // Empty = the default type names for that kind.
        workItemTypes: Object.fromEntries(Object.entries(types).filter(([, value]) => listFrom(value).length > 0).map(([kind, value]) => [kind, listFrom(value)])),
        // Only SOP owners may change it; the server keeps the current one for everyone else.
        branchPattern: branchPattern.trim() || null,
        prTargetBranch: branch.trim() || null,
        timeZone: timeZone.trim(),
      }),
    onSuccess: onSaved,
  });

  const categoryOptions = [...new Set([...fieldCandidates.category, ...(initial.fields.category ? [initial.fields.category] : [])])];
  const targetOptions = [...new Set([...fieldCandidates.targetCompletion, ...(initial.fields.targetCompletion ? [initial.fields.targetCompletion] : [])])];
  const hasActive = Object.values(choice).includes("active");

  function submit(event: FormEvent) {
    event.preventDefault();
    save.mutate();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-lg border border-indigo-200 bg-indigo-50/40 p-4" aria-label={`Set up ${projectName}`}>
      <div>
        <h3 className="text-base font-semibold text-slate-950">
          {isNew ? "Set up" : "Edit"} {projectName}
        </h3>
        <p className="text-xs text-slate-500">
          Pre-filled from Azure DevOps. Shared with everyone; each change is recorded. New tickets are never flagged: rules start
          applying at Estimation or Active.
        </p>
      </div>

      <fieldset>
        <legend className="text-sm font-medium text-slate-800">Which SOP stage is each state?</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {allStates.map((state) => {
            const info = states.find((entry) => entry.name === state);
            return (
              <label key={state} className="flex items-center justify-between gap-3 rounded-md bg-surface px-3 py-2 text-sm">
                <span>
                  <span className="font-medium text-slate-900">{state}</span>
                  {info ? <span className="block text-xs text-slate-500">{info.types.join(", ")}</span> : <span className="block text-xs text-amber-600">not in Azure any more</span>}
                </span>
                <select
                  aria-label={`Stage for ${state}`}
                  className="h-9 w-48 rounded-lg border border-slate-300 bg-surface px-2 text-sm"
                  value={choice[state] ?? ""}
                  onChange={(event) => setChoice({ ...choice, [state]: event.target.value as SopStageName | "" })}
                >
                  <option value="">Not used</option>
                  {SOP_STAGE_OPTIONS.map((stage) => (
                    <option key={stage} value={stage}>
                      {STAGE_LABELS[stage]}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
        </div>
        {!hasActive ? <p className="mt-1 text-xs text-amber-700">No state is mapped to Active, so most rules will never apply.</p> : null}
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm text-slate-700">
          Category field
          <select className={SELECT} value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">None</option>
            {categoryOptions.map((field) => (
              <option key={field} value={field}>
                {field}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-700">
          Target completion field
          <select className={SELECT} value={target} onChange={(event) => setTarget(event.target.value)}>
            <option value="">None</option>
            {targetOptions.map((field) => (
              <option key={field} value={field}>
                {field}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-700">
          Pull requests go into branch
          <Input value={branch} onChange={(event) => setBranch(event.target.value)} placeholder="develop" className="h-9" />
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-700">
          Team time zone
          <Input value={timeZone} onChange={(event) => setTimeZone(event.target.value)} placeholder="Asia/Kolkata" className="h-9" />
        </label>
      </div>

      {category ? (
        <fieldset>
          <legend className="text-sm font-medium text-slate-800">Categories (used by the AI to suggest a category)</legend>
          <div className="mt-2 flex flex-col gap-2">
            {categories.map((entry, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  aria-label={`Category ${index + 1} name`}
                  value={entry.name}
                  onChange={(event) => setCategories(categories.map((item, at) => (at === index ? { ...item, name: event.target.value } : item)))}
                  className="h-9 w-40"
                />
                <Input
                  aria-label={`Category ${index + 1} meaning`}
                  value={entry.meaning}
                  onChange={(event) => setCategories(categories.map((item, at) => (at === index ? { ...item, meaning: event.target.value } : item)))}
                  className="h-9 flex-1"
                />
                <Button type="button" size="sm" variant="ghost" onClick={() => setCategories(categories.filter((_, at) => at !== index))}>
                  Remove
                </Button>
              </div>
            ))}
            <div>
              <Button type="button" size="sm" variant="secondary" onClick={() => setCategories([...categories, { name: "", meaning: "" }])}>
                Add category
              </Button>
            </div>
          </div>
        </fieldset>
      ) : null}

      <details className="rounded-md bg-surface p-3">
        <summary className="cursor-pointer text-sm font-medium text-slate-800">Advanced: roles, tags, work item types, branch names</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm text-slate-700">
            Stages come from
            <select className={SELECT} value={stageSource} onChange={(event) => setStageSource(event.target.value as ProjectSettings["stageSource"])}>
              <option value="state">Work item state</option>
              <option value="board_column">Board column</option>
            </select>
          </label>
          {(["tl", "qa", "po"] as const).map((role) => (
            <label key={role} className="flex flex-col gap-1 text-sm text-slate-700">
              {ROLE_LABELS[role]} (comma-separated emails or names)
              <Input value={roles[role]} onChange={(event) => setRoles({ ...roles, [role]: event.target.value })} className="h-9" />
            </label>
          ))}
          <label className="flex flex-col gap-1 text-sm text-slate-700 sm:col-span-2">
            Allowed tags (comma-separated; empty = any tag)
            <Input value={tags} onChange={(event) => setTags(event.target.value)} className="h-9" />
          </label>
          {ITEM_KINDS.map((kind) => (
            <label key={kind} className="flex flex-col gap-1 text-sm text-slate-700">
              Type names for {kind} (comma-separated; empty = defaults)
              <Input value={types[kind] ?? ""} onChange={(event) => setTypes({ ...types, [kind]: event.target.value })} className="h-9" />
            </label>
          ))}
          <label className="flex flex-col gap-1 text-sm text-slate-700 sm:col-span-2">
            Branch name pattern (regular expression; {"{id}"} = ticket number){isOwner ? "" : " · only SOP owners can change it"}
            <Input
              value={branchPattern}
              onChange={(event) => setBranchPattern(event.target.value)}
              readOnly={!isOwner}
              className="h-9 font-mono text-xs"
            />
          </label>
        </div>
      </details>

      {save.error ? (
        <p role="alert" className="text-sm text-rose-600">
          {errorText(save.error, "Could not save the set-up.")}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? <Spinner className="size-4" /> : null}
          {isNew ? "Set up project" : "Save changes"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function History({ projectName }: { projectName: string }) {
  const history = useQuery({ queryKey: sopKeys.projectHistory(projectName), queryFn: () => listProjectChanges(projectName) });

  if (history.isLoading) return <Spinner className="size-4" />;
  if (!history.data?.length) return <p className="text-xs text-slate-500">No changes recorded.</p>;

  return (
    <ul className="space-y-0.5 text-xs text-slate-600">
      {history.data.map((change, index) => (
        <li key={index}>
          {KIND_LABELS[change.kind]} by {change.changedBy} · {formatRelative(change.createdAt)}
        </li>
      ))}
    </ul>
  );
}

/** Which Azure DevOps projects get SOP checks: shared set-ups, and each user's own on/off choice. */
export function ProjectsTab() {
  const queryClient = useQueryClient();
  const credentials = useCredentials();
  const azure = (credentials.data ?? []).filter((credential) => credential.platform === "AZURE");
  const [chosen, setChosen] = useState<string | null>(null);
  const credentialId = chosen ?? azure[0]?.id ?? "";
  const [editing, setEditing] = useState<AzureSopProject | null>(null);
  const [showHistory, setShowHistory] = useState<string | null>(null);

  const projectsPage = usePageParam("projectsPage");
  const elsewherePage = usePageParam("elsewherePage");
  const updateParams = useSearchParamsUpdate();
  const projects = useQuery({
    queryKey: [...sopKeys.azureProjects(credentialId), projectsPage.page, elsewherePage.page],
    queryFn: () => listAzureProjectsForSop(credentialId, { page: projectsPage.page, elsewherePage: elsewherePage.page }),
    enabled: credentialId !== "",
    placeholderData: keepPreviousData,
  });
  const served = projects.data && !projects.isPlaceholderData ? projects.data : undefined;
  useSyncServedPage(projectsPage, served?.projects.page);
  useSyncServedPage(elsewherePage, served?.elsewhere.page);
  const setUps = useQuery({ queryKey: sopKeys.projects, queryFn: listSopProjects });
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: sopKeys.all });
    // Results everywhere change with the project list.
    void queryClient.invalidateQueries({ queryKey: ["azure"] });
  };

  const toggle = useMutation({
    mutationFn: ({ name, checked }: { name: string; checked: boolean }) => setProjectChecked(name, checked),
    onSettled: async (_data, _error, { name }) => {
      await queryClient.invalidateQueries({ queryKey: sopKeys.all });
      void queryClient.invalidateQueries({ queryKey: ["azure"] });
      // The fresh list (or the failure) now decides the checkbox.
      setPendingChoice((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== name)));
    },
  });
  // The checkbox follows the click at once; if saving fails it returns to the saved value.
  const [pendingChoice, setPendingChoice] = useState<Record<string, boolean>>({});
  const remove = useMutation({ mutationFn: (name: string) => removeProjectSetUp(name), onSettled: invalidate });

  if (!credentials.isLoading && azure.length === 0) {
    return <p className="text-sm text-slate-500">Add an Azure DevOps connection to choose SOP projects.</p>;
  }

  const setUpByName = new Map((setUps.data ?? []).map((setUp) => [setUp.projectName.toLowerCase(), setUp]));
  const elsewhere = projects.data?.elsewhere;
  const error = toggle.error ?? remove.error;

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-sm text-slate-600">
        A project is checked once it is set up (anyone can do this; every change is recorded). Untick “Check for me” to stop SOP
        checks on a project for yourself only; team reports always cover every set-up project.
      </p>

      {azure.length > 1 ? (
        <label className="flex max-w-xs flex-col gap-1 text-sm text-slate-700">
          Organization
          <select
            className={SELECT}
            value={credentialId}
            onChange={(event) => {
              setChosen(event.target.value);
              updateParams({ projectsPage: null, elsewherePage: null }, { replace: true });
            }}
          >
            {azure.map((credential) => (
              <option key={credential.id} value={credential.id}>
                {getCredentialDisplayName(credential)}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-rose-600">
          {errorText(error, "That change could not be saved.")}
        </p>
      ) : null}

      {projects.isLoading || setUps.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Spinner className="size-4" /> Loading projects…
        </p>
      ) : projects.error || !projects.data ? (
        <ErrorCard error={projects.error} credentialId={credentialId} onRetry={() => void projects.refetch()} />
      ) : (
        <Updating active={projects.isPlaceholderData}>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-sm sm:min-w-[640px]" aria-label="SOP projects">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Project</th>
                  <th className="px-3 py-2 font-medium">SOP set-up</th>
                  <th className="px-3 py-2 font-medium">Check for me</th>
                  <th className="px-3 py-2 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {projects.data.projects.items.map((project) => {
                  const setUp = setUpByName.get(project.name.toLowerCase());
                  return (
                    <tr key={project.id} className="align-top">
                      <td className="px-3 py-3.5 font-medium text-slate-900">
                        {project.name}
                        {showHistory === project.name ? (
                          <div className="mt-1">
                            <History projectName={project.name} />
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-3.5">
                        {setUp ? (
                          <span className="text-xs text-slate-600">
                            <StatusBadge tone="success">Set up</StatusBadge>{" "}
                            <span className="hidden sm:inline">
                              {setUp.updatedBy ? `by ${setUp.updatedBy} · ` : ""}
                              {formatRelative(setUp.updatedAt)}
                            </span>
                          </span>
                        ) : (
                          <StatusBadge tone="neutral">Not set up</StatusBadge>
                        )}
                      </td>
                      <td
                        className="px-3 py-3.5"
                        title={project.setUp ? undefined : "Set this project up first; only set-up projects can be checked."}
                      >
                        <input
                          type="checkbox"
                          className="size-4 align-middle"
                          aria-label={`Check ${project.name} for me`}
                          checked={project.setUp && (pendingChoice[project.name] ?? project.checkedForMe)}
                          disabled={!project.setUp || toggle.isPending}
                          onChange={(event) => {
                            const checked = event.target.checked;
                            setPendingChoice((current) => ({ ...current, [project.name]: checked }));
                            toggle.mutate({ name: project.name, checked });
                          }}
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          <Button size="sm" variant="secondary" onClick={() => setEditing(project)}>
                            {project.setUp ? "Edit" : "Set up"}
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => setShowHistory(showHistory === project.name ? null : project.name)}>
                            History
                          </Button>
                          {project.setUp ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              className="text-rose-700 hover:bg-rose-50 hover:text-rose-700"
                              disabled={remove.isPending}
                              onClick={() => {
                                if (window.confirm(`Stop SOP checks on ${project.name} for everyone? The set-up history is kept.`)) {
                                  remove.mutate(project.name);
                                }
                              }}
                            >
                              Remove
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Updating>
      )}

      {projects.data ? (
        <Pagination
          label="SOP project pages"
          page={projects.data.projects.page}
          totalPages={projects.data.projects.totalPages}
          total={projects.data.projects.total}
          pageSize={projects.data.projects.pageSize}
          disabled={projects.isFetching}
          onChange={(next) => projectsPage.setPage(next)}
        />
      ) : null}

      {elsewhere && elsewhere.total > 0 ? (
        <div className="rounded-lg border border-slate-200 p-3">
          <h3 className="text-sm font-medium text-slate-800">Set up, but not in this organization</h3>
          <p className="text-xs text-slate-500">
            From another organization, renamed, or moved from the old rulebook. Edit them from an organization that has the project.
          </p>
          <ul className="mt-2 divide-y divide-slate-100 text-sm">
            {elsewhere.items.map((setUp) => (
              <li key={setUp.projectName} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="font-medium text-slate-900">{setUp.projectName}</span>
                <span className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      aria-label={`Check ${setUp.projectName} for me`}
                      checked={pendingChoice[setUp.projectName] ?? setUp.checkedForMe}
                      disabled={toggle.isPending}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setPendingChoice((current) => ({ ...current, [setUp.projectName]: checked }));
                        toggle.mutate({ name: setUp.projectName, checked });
                      }}
                    />
                    Check for me
                  </label>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="text-rose-700 hover:bg-rose-50 hover:text-rose-700"
                    disabled={remove.isPending}
                    onClick={() => {
                      if (window.confirm(`Stop SOP checks on ${setUp.projectName} for everyone? The set-up history is kept.`)) {
                        remove.mutate(setUp.projectName);
                      }
                    }}
                  >
                    Remove
                  </Button>
                </span>
              </li>
            ))}
          </ul>
          <Pagination
            label="Set-ups elsewhere pages"
            page={elsewhere.page}
            totalPages={elsewhere.totalPages}
            total={elsewhere.total}
            pageSize={elsewhere.pageSize}
            disabled={projects.isFetching}
            onChange={(next) => elsewherePage.setPage(next)}
          />
        </div>
      ) : null}

      {editing ? <SetUpForm credentialId={credentialId} project={editing} onDone={() => setEditing(null)} /> : null}
    </div>
  );
}
