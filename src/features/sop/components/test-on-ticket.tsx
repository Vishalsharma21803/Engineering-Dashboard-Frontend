import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { SelectField } from "@/components/ui/select-field";
import { Checkbox } from "@/components/ui/checkbox";
import { ErrorCard } from "@/features/azure-devops/components/feedback";
import { useProjects } from "@/features/azure-devops/hooks/use-projects";
import { getLastCredential, resolveDefaultProject } from "@/features/azure-devops/utils/last-project";
import { useCredentials } from "@/features/credentials/hooks/use-credentials";
import { getCredentialDisplayName } from "@/features/credentials/utils/credential-display";
import { ApiError } from "@/lib/api-client";
import { testRulesOnTicket } from "../api/sop.api";
import type { RulebookScope } from "../types/sop.types";
import { SopResultPanel } from "./sop-result-panel";

/** Tries the rules in the editor (or the saved ones) on one real ticket. Reads only. */
export function TestOnTicket({ scope, content, allowDraft }: { scope: RulebookScope; content: string; allowDraft: boolean }) {
  const credentials = useCredentials();
  const azure = (credentials.data ?? []).filter((credential) => credential.platform === "AZURE");
  const [chosenCredential, setChosenCredential] = useState<string | null>(null);
  const credentialId =
    chosenCredential ?? azure.find((credential) => credential.id === getLastCredential())?.id ?? azure[0]?.id ?? "";
  const projects = useProjects(credentialId);
  const [chosenProject, setChosenProject] = useState<string | null>(null);
  const projectId = chosenProject ?? resolveDefaultProject(credentialId, "", projects.data?.projects ?? []) ?? "";
  const [ticket, setTicket] = useState("");
  const [useDraft, setUseDraft] = useState(true);

  const run = useMutation({
    mutationFn: () =>
      testRulesOnTicket(credentialId, {
        projectId,
        workItemId: Number(ticket),
        ...(useDraft && allowDraft ? { draft: { scope, content } } : {}),
      }),
  });

  if (credentials.error && !credentials.data) {
    return <ErrorCard error={credentials.error} onRetry={() => void credentials.refetch()} />;
  }

  if (!credentials.isLoading && azure.length === 0) {
    return <p className="text-sm text-slate-500">Add an Azure DevOps connection to try rules on a real ticket.</p>;
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    run.mutate();
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-surface p-5 shadow-sm">
      <div>
        <h2 className="text-base font-semibold text-slate-950">Test on a ticket</h2>
        <p className="mt-0.5 text-sm text-slate-600">Runs the code rules on one ticket. It only reads from Azure DevOps and saves nothing.</p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-3">
          {azure.length > 1 ? (
            <label className="flex w-full flex-col gap-1.5 text-sm font-medium text-slate-700 sm:w-56">
              Organization
              <SelectField
                value={credentialId}
                onValueChange={(selected) => {
                  setChosenCredential(selected);
                  setChosenProject(null);
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
          <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm font-medium text-slate-700 sm:w-56 sm:flex-none">
            Project
            <SelectField value={projectId} onValueChange={(selected) => setChosenProject(selected)}>
              {projects.isLoading ? <option value="">Loading projects…</option> : null}
              {projects.error && !projects.data ? <option value="">Projects could not be loaded</option> : null}
              {(projects.data?.projects ?? []).map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </SelectField>
          </label>
          <label className="flex w-32 flex-col gap-1.5 text-sm font-medium text-slate-700">
            Ticket #
            <Input
              className="h-10 w-32"
              type="number"
              min={1}
              value={ticket}
              onChange={(event) => setTicket(event.target.value)}
              aria-label="Ticket number"
            />
          </label>
          <Button type="submit" className="h-10" disabled={!projectId || !(Number(ticket) > 0) || run.isPending}>
            {run.isPending ? <Spinner className="size-4" /> : null}
            Run rules
          </Button>
        </div>
        {allowDraft ? (
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <Checkbox checked={useDraft} onCheckedChange={(state) => setUseDraft(state === true)} />
            Use the rules in the editor (unsaved)
          </label>
        ) : null}
      </form>

      {run.error ? (
        <p role="alert" className="text-sm text-rose-600">
          {run.error instanceof ApiError ? run.error.message : "Could not test the rules."}
        </p>
      ) : null}
      {run.data && run.data.errors.length > 0 ? (
        <p role="alert" className="text-sm text-rose-600">
          Fix the {run.data.errors.length} problem(s) in the editor first.
        </p>
      ) : null}
      {run.data?.result ? (
        <div>
          <p className="mb-2 text-sm text-slate-700">
            #{run.data.result.workItemId} {run.data.result.title} · {run.data.result.type} · {run.data.result.state}
          </p>
          <SopResultPanel result={run.data.result} />
        </div>
      ) : null}
    </div>
  );
}
