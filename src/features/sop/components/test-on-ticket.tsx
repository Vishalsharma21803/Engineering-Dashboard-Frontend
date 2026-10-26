import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useProjects } from "@/features/azure-devops/hooks/use-projects";
import { getLastCredential, resolveDefaultProject } from "@/features/azure-devops/utils/last-project";
import { useCredentials } from "@/features/credentials/hooks/use-credentials";
import { getCredentialDisplayName } from "@/features/credentials/utils/credential-display";
import { ApiError } from "@/lib/api-client";
import { testRulesOnTicket } from "../api/sop.api";
import type { RulebookScope } from "../types/sop.types";
import { SopResultPanel } from "./sop-result-panel";

const SELECT_CLASS = "h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm";

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

  if (!credentials.isLoading && azure.length === 0) {
    return <p className="text-sm text-slate-500">Add an Azure DevOps connection to try rules on a real ticket.</p>;
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    run.mutate();
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">Test on a ticket</h2>
        <p className="text-xs text-slate-500">Runs the code rules on one ticket. It only reads from Azure DevOps and saves nothing.</p>
      </div>
      <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
        {azure.length > 1 ? (
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            Organization
            <select
              className={SELECT_CLASS}
              value={credentialId}
              onChange={(event) => {
                setChosenCredential(event.target.value);
                setChosenProject(null);
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
        <label className="flex flex-col gap-1 text-xs text-slate-600">
          Project
          <select className={SELECT_CLASS} value={projectId} onChange={(event) => setChosenProject(event.target.value)}>
            {(projects.data?.projects ?? []).map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-600">
          Ticket #
          <Input
            className="h-9 w-28"
            type="number"
            min={1}
            value={ticket}
            onChange={(event) => setTicket(event.target.value)}
            aria-label="Ticket number"
          />
        </label>
        {allowDraft ? (
          <label className="flex h-9 items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={useDraft} onChange={(event) => setUseDraft(event.target.checked)} />
            Use the rules in the editor (unsaved)
          </label>
        ) : null}
        <Button type="submit" size="sm" className="h-9" disabled={!projectId || !(Number(ticket) > 0) || run.isPending}>
          {run.isPending ? <Spinner className="size-4" /> : null}
          Run rules
        </Button>
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
