import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useEffect, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Updating } from "@/components/ui/updating";
import { Pagination } from "@/components/ui/pagination";
import { usePageParam, useSearchParamsUpdate, useSyncServedPage } from "@/hooks/use-page-param";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { SelectField } from "@/components/ui/select-field";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { ErrorCard, StaleDataBanner } from "@/features/azure-devops/components/feedback";
import { StatusBadge } from "@/features/azure-devops/components/status-badge";
import { formatRelative } from "@/features/azure-devops/utils/format";
import { useCredentials } from "@/features/credentials/hooks/use-credentials";
import { getCredentialDisplayName } from "@/features/credentials/utils/credential-display";
import { ApiError } from "@/lib/api-client";
import { errorMessage } from "@/lib/error-text";
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
import { SOP_STAGE_OPTIONS, type AzureSopProject, type ProjectSettings, type ProjectSetUp, type SopStageName } from "../types/sop.types";

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
  if (error instanceof ApiError && error.errors.length) {
    return error.errors.map((item) => `${item.field}: ${item.message}`).join(" · ");
  }

  return errorMessage(error, fallback);
}

/** Why the signed-in user cannot change a set-up (only its creator or an SOP owner can). */
function notYoursText(setUp: ProjectSetUp | undefined): string {
  if (!setUp) return "Only the person who set it up or an SOP owner can change it";
  return setUp.createdBy
    ? `Set up by ${setUp.createdBy}; only they or an SOP owner can change it`
    : "Set up before owners were recorded; only an SOP owner can change it";
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
  const anchor = useRef<HTMLDivElement>(null);
  const loaded = Boolean(suggestion.data);

  // The form opens below the list: bring it (or its loading line) into view, then put the cursor in its first field.
  useEffect(() => {
    const node = anchor.current;
    if (!node) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    node.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
    if (loaded) {
      node.querySelector<HTMLElement>("input, select, textarea, button[role=combobox]")?.focus({ preventScroll: true });
    }
  }, [loaded, project.id]);

  return (
    <div ref={anchor} className="scroll-mt-24">
      {suggestion.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Spinner className="size-4" /> Reading {project.name} from Azure DevOps…
        </p>
      ) : !suggestion.data ? (
        <ErrorCard error={suggestion.error} credentialId={credentialId} onRetry={() => void suggestion.refetch()} isRetrying={suggestion.isFetching} />
      ) : (
        <>
          {suggestion.error ? <StaleDataBanner credentialId={credentialId} error={suggestion.error} onRetry={() => void suggestion.refetch()} isRetrying={suggestion.isFetching} /> : null}
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
        </>
      )}
    </div>
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
                <SelectField
                  aria-label={`Stage for ${state}`}
                  size="sm"
                  className="w-48"
                  value={choice[state] ?? ""}
                  onValueChange={(selected) => setChoice({ ...choice, [state]: selected as SopStageName | "" })}
                >
                  <option value="">Not used</option>
                  {SOP_STAGE_OPTIONS.map((stage) => (
                    <option key={stage} value={stage}>
                      {STAGE_LABELS[stage]}
                    </option>
                  ))}
                </SelectField>
              </label>
            );
          })}
        </div>
        {!hasActive ? <p className="mt-1 text-xs text-amber-700">No state is mapped to Active, so most rules will never apply.</p> : null}
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm text-slate-700">
          Category field
          <SelectField size="sm" value={category} onValueChange={(selected) => setCategory(selected)}>
            <option value="">None</option>
            {categoryOptions.map((field) => (
              <option key={field} value={field}>
                {field}
              </option>
            ))}
          </SelectField>
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-700">
          Target completion field
          <SelectField size="sm" value={target} onValueChange={(selected) => setTarget(selected)}>
            <option value="">None</option>
            {targetOptions.map((field) => (
              <option key={field} value={field}>
                {field}
              </option>
            ))}
          </SelectField>
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
            <SelectField size="sm" value={stageSource} onValueChange={(selected) => setStageSource(selected as ProjectSettings["stageSource"])}>
              <option value="state">Work item state</option>
              <option value="board_column">Board column</option>
            </SelectField>
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
  // Trying again after a failure starts over without data, which clears the error: keep the line, saying so.
  const retrying = history.isPending && history.isFetching && history.errorUpdateCount > 0;

  if (history.error || retrying) {
    return (
      <p role="alert" className="text-xs text-rose-600">
        Could not load the history.{" "}
        <button type="button" className="font-medium underline disabled:opacity-60" onClick={() => void history.refetch()} disabled={retrying}>
          {retrying ? "Retrying…" : "Try again"}
        </button>
      </p>
    );
  }
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
  // The project whose "Remove" waits in the confirm dialog.
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null);
  // Each row's Set up / Edit button, so closing the form puts the focus back where it was opened.
  const setUpButtons = useRef(new Map<string, HTMLButtonElement>());
  const { user } = useAuth();
  const isOwner = user?.isSopAdmin ?? false;

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

  function closeForm() {
    const id = editing?.id;
    setEditing(null);
    if (id) setUpButtons.current.get(id)?.focus();
  }

  function askRemove(name: string) {
    remove.reset();
    setConfirmingRemove(name);
  }

  if (credentials.error && !credentials.data) {
    return <ErrorCard error={credentials.error} onRetry={() => void credentials.refetch()} isRetrying={credentials.isFetching} />;
  }

  if (!credentials.isLoading && azure.length === 0) {
    return <p className="text-sm text-slate-500">Add an Azure DevOps connection to choose SOP projects.</p>;
  }

  const setUpByName = new Map((setUps.data ?? []).map((setUp) => [setUp.projectName.toLowerCase(), setUp]));
  // Only a set-up's creator or an SOP owner may change or remove it (an older server sends no canEdit: owners only).
  const mayChange = (setUp: ProjectSetUp | undefined) => setUp?.canEdit ?? isOwner;
  const elsewhere = projects.data?.elsewhere;

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-sm text-slate-600">
        A project is checked once it is set up. Anyone can set up a project; after that only the person who set it up or an SOP owner
        can change it. Every change is recorded. Untick “Check for me” to stop SOP checks on a project for yourself only; team
        reports always cover every set-up project.
      </p>

      {azure.length > 1 ? (
        <label className="flex max-w-xs flex-col gap-1 text-sm text-slate-700">
          Organization
          <SelectField
            size="sm"
            value={credentialId}
            onValueChange={(selected) => {
              setChosen(selected);
              updateParams({ projectsPage: null, elsewherePage: null }, { replace: true });
            }}
          >
            {azure.map((credential) => (
              <option key={credential.id} value={credential.id}>
                {getCredentialDisplayName(credential)}
              </option>
            ))}
          </SelectField>
        </label>
      ) : null}

      {/* Each failure names its project; a later failure of the other kind does not hide it. */}
      {toggle.error ? (
        <p role="alert" className="text-sm text-rose-600">
          “Check for me” on {toggle.variables?.name ?? "that project"} was not saved: {errorText(toggle.error, "That change could not be saved.")}
        </p>
      ) : null}
      {remove.error ? (
        <p role="alert" className="text-sm text-rose-600">
          {remove.variables ?? "That project"} was not removed: {errorText(remove.error, "That change could not be saved.")}
        </p>
      ) : null}

      {projects.error && projects.data ? (
        <StaleDataBanner credentialId={credentialId} error={projects.error} onRetry={() => void projects.refetch()} isRetrying={projects.isFetching} />
      ) : null}

      {projects.isLoading || setUps.isLoading || credentials.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Spinner className="size-4" /> Loading projects…
        </p>
      ) : !projects.data ? (
        <ErrorCard error={projects.error} credentialId={credentialId} onRetry={() => void projects.refetch()} isRetrying={projects.isFetching} />
      ) : setUps.error && !setUps.data ? (
        // Without the set-ups every project would look "Not set up".
        <ErrorCard error={setUps.error} onRetry={() => void setUps.refetch()} isRetrying={setUps.isFetching} />
      ) : (
        <Updating active={projects.isPlaceholderData}>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-surface shadow-sm">
            <table className="w-full text-left text-sm sm:min-w-[640px]" aria-label="SOP projects">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Project</th>
                  <th className="px-4 py-2.5 font-medium">SOP set-up</th>
                  <th className="px-4 py-2.5 font-medium">Check for me</th>
                  <th className="px-4 py-2.5 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {projects.data.projects.items.map((project) => {
                  const setUp = setUpByName.get(project.name.toLowerCase());
                  const canChange = !project.setUp || mayChange(setUp);
                  const noteId = `sop-check-note-${project.id}`;
                  // Who may change it: beside the buttons on wider screens, on its own line below the row on phones.
                  const ownerNote = canChange ? null : notYoursText(setUp);
                  return (
                    <Fragment key={project.id}>
                      <tr className={ownerNote ? "align-middle max-sm:border-b-0" : "align-middle"}>
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {project.name}
                          {showHistory === project.name ? (
                            <div className="mt-1">
                              <History projectName={project.name} />
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          {setUp ? (
                            <span className="text-xs text-slate-600">
                              <span className="whitespace-nowrap">
                                <StatusBadge tone="success">Set up</StatusBadge>
                              </span>{" "}
                              <span className="hidden sm:inline">
                                {setUp.updatedBy ? `by ${setUp.updatedBy} · ` : ""}
                                {formatRelative(setUp.updatedAt)}
                              </span>
                            </span>
                          ) : (
                            <span className="whitespace-nowrap">
                              <StatusBadge tone="neutral">Not set up</StatusBadge>
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Checkbox
                            className="align-middle"
                            aria-label={`Check ${project.name} for me`}
                            aria-describedby={project.setUp ? undefined : noteId}
                            checked={project.setUp && (pendingChoice[project.name] ?? project.checkedForMe)}
                            disabled={!project.setUp || toggle.isPending}
                            onCheckedChange={(state) => {
                              const checked = state === true;
                              setPendingChoice((current) => ({ ...current, [project.name]: checked }));
                              toggle.mutate({ name: project.name, checked });
                            }}
                          />
                          {project.setUp ? null : (
                            <p id={noteId} className="mt-0.5 text-xs text-slate-500">
                              Set up first
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex flex-wrap items-center justify-end gap-1.5">
                            {canChange ? (
                              <Button
                                ref={(node) => {
                                  if (node) setUpButtons.current.set(project.id, node);
                                  else setUpButtons.current.delete(project.id);
                                }}
                                size="sm"
                                variant="secondary"
                                onClick={() => setEditing(project)}
                              >
                                {project.setUp ? "Edit" : "Set up"}
                              </Button>
                            ) : (
                              <p className="hidden max-w-56 text-right text-xs text-slate-500 sm:block">{ownerNote}</p>
                            )}
                            <Button size="sm" variant="secondary" onClick={() => setShowHistory(showHistory === project.name ? null : project.name)}>
                              History
                            </Button>
                            {project.setUp && canChange ? (
                              <Button
                                size="sm"
                                variant="secondary"
                                className="text-rose-700 hover:bg-rose-50 hover:text-rose-700"
                                disabled={remove.isPending}
                                onClick={() => askRemove(project.name)}
                              >
                                Remove
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                      {ownerNote ? (
                        <tr className="sm:hidden">
                          <td colSpan={4} className="px-4 pb-3 text-xs text-slate-500">
                            {ownerNote}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
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
            {elsewhere.items.map((setUp) => {
              const row = setUpByName.get(setUp.projectName.toLowerCase());
              return (
              <li key={setUp.projectName} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="font-medium text-slate-900">{setUp.projectName}</span>
                <span className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs text-slate-600">
                    <Checkbox
                      aria-label={`Check ${setUp.projectName} for me`}
                      checked={pendingChoice[setUp.projectName] ?? setUp.checkedForMe}
                      disabled={toggle.isPending}
                      onCheckedChange={(state) => {
                        const checked = state === true;
                        setPendingChoice((current) => ({ ...current, [setUp.projectName]: checked }));
                        toggle.mutate({ name: setUp.projectName, checked });
                      }}
                    />
                    Check for me
                  </label>
                  {mayChange(row) ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="text-rose-700 hover:bg-rose-50 hover:text-rose-700"
                      disabled={remove.isPending}
                      onClick={() => askRemove(setUp.projectName)}
                    >
                      Remove
                    </Button>
                  ) : (
                    <span className="text-xs text-slate-500">{notYoursText(row)}</span>
                  )}
                </span>
              </li>
              );
            })}
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

      {editing ? <SetUpForm credentialId={credentialId} project={editing} onDone={closeForm} /> : null}

      <ConfirmDialog
        open={confirmingRemove !== null}
        title={`Stop SOP checks on ${confirmingRemove ?? "this project"} for everyone?`}
        description="The set-up history is kept."
        confirmLabel="Stop checks"
        pendingLabel="Stopping…"
        destructive
        isPending={remove.isPending}
        error={remove.error ? errorText(remove.error, "That change could not be saved.") : null}
        onConfirm={() => {
          if (confirmingRemove) remove.mutate(confirmingRemove, { onSuccess: () => setConfirmingRemove(null) });
        }}
        onOpenChange={(open) => {
          if (!open) setConfirmingRemove(null);
        }}
      />
    </div>
  );
}
