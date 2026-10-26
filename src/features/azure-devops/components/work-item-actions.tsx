import { useState, type FormEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRepositories } from "../hooks/use-projects";
import type { ProposeActionInput } from "../types/action.types";
import type { SupportedWorkFields, WorkItemDetail } from "../types/azure.types";

interface WorkItemActionsProps {
  credentialId: string;
  workItem: WorkItemDetail;
  isProposing: boolean;
  onPropose: (input: ProposeActionInput, onProposed?: () => void) => void;
}

type FieldKey = keyof SupportedWorkFields;

const FIELD_LABELS: Record<FieldKey, string> = {
  originalEstimate: "Original estimate (h)",
  remainingWork: "Remaining work (h)",
  completedWork: "Completed work (h)",
  storyPoints: "Story points",
  effort: "Effort",
  priority: "Priority (1–4)",
};

const textareaClassName =
  "block min-h-24 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20";

const selectClassName =
  "block h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20";

function ActionBlock({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <p className="mt-0.5 text-xs text-slate-500">{hint}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

/** Each form only proposes; the review dialog asks for approval. */
export function WorkItemActions({ credentialId, workItem, isProposing, onPropose }: WorkItemActionsProps) {
  const target = { projectId: workItem.projectName, workItemId: workItem.id };
  const supportedFields = (Object.keys(FIELD_LABELS) as FieldKey[]).filter((key) => workItem.supportedFields[key]);

  const [comment, setComment] = useState("");
  const [fields, setFields] = useState<Partial<Record<FieldKey, string>>>(() =>
    Object.fromEntries(supportedFields.map((key) => [key, workItem[key] === null ? "" : String(workItem[key])]))
  );
  const [state, setState] = useState("");
  const [repositoryId, setRepositoryId] = useState("");
  const [pullRequestId, setPullRequestId] = useState("");
  const repositories = useRepositories(credentialId, workItem.projectName);

  function submitComment(event: FormEvent) {
    event.preventDefault();
    onPropose(
      { credentialId, kind: "WORK_ITEM_COMMENT", target, params: { text: comment } },
      () => setComment("")
    );
  }

  const changedFields: Record<string, number> = {};

  for (const key of supportedFields) {
    const raw = fields[key]?.trim() ?? "";

    if (raw !== "" && Number.isFinite(Number(raw)) && Number(raw) !== workItem[key]) {
      changedFields[key] = Number(raw);
    }
  }

  const changedCount = Object.keys(changedFields).length;

  function submitFields(event: FormEvent) {
    event.preventDefault();
    onPropose({ credentialId, kind: "WORK_ITEM_UPDATE_FIELDS", target, params: changedFields });
  }

  const transitions = workItem.allowedStates.filter((candidate) => candidate.name !== workItem.state);
  const canCloseAfterMerge =
    workItem.closeAfterMergeAllowed &&
    workItem.links.pullRequests.length > 0 &&
    workItem.stateCategory !== "Completed" &&
    workItem.stateCategory !== "Removed";

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <ActionBlock title="Add comment" hint="Progress update, or the reason for a state, estimate or due date change.">
        <form onSubmit={submitComment} className="space-y-2">
          <Label htmlFor="action-comment" className="sr-only">
            Comment
          </Label>
          <textarea
            id="action-comment"
            className={textareaClassName}
            value={comment}
            maxLength={10_000}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Approach: ..."
          />
          <Button type="submit" size="sm" disabled={isProposing || comment.trim() === ""}>
            Review comment…
          </Button>
        </form>
      </ActionBlock>

      {supportedFields.length > 0 ? (
        <ActionBlock title="Estimates & work log" hint="Only changed values are proposed.">
          <form onSubmit={submitFields} className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              {supportedFields.map((key) => (
                <div key={key} className="space-y-1">
                  <Label htmlFor={`field-${key}`} className="text-xs">
                    {FIELD_LABELS[key]}
                  </Label>
                  <Input
                    id={`field-${key}`}
                    type="number"
                    min={key === "priority" ? 1 : 0}
                    max={key === "priority" ? 4 : undefined}
                    step={key === "priority" ? 1 : 0.25}
                    value={fields[key] ?? ""}
                    onChange={(event) => setFields({ ...fields, [key]: event.target.value })}
                  />
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" size="sm" disabled={isProposing || changedCount === 0}>
                Review {changedCount > 0 ? `${changedCount} change${changedCount > 1 ? "s" : ""}` : "changes"}…
              </Button>
              {changedCount === 0 ? <span className="text-xs text-slate-500">Edit a value to enable.</span> : null}
            </div>
          </form>
        </ActionBlock>
      ) : null}

      {transitions.length > 0 ? (
        <ActionBlock title="Change state" hint={`Currently ${workItem.state}.`}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              onPropose({ credentialId, kind: "WORK_ITEM_TRANSITION_STATE", target, params: { state } });
            }}
            className="flex gap-2"
          >
            <Label htmlFor="action-state" className="sr-only">
              New state
            </Label>
            <select id="action-state" className={selectClassName} value={state} onChange={(event) => setState(event.target.value)}>
              <option value="">Choose a state</option>
              {transitions.map((candidate) => (
                <option key={candidate.name} value={candidate.name}>
                  {candidate.name}
                </option>
              ))}
            </select>
            <Button type="submit" size="sm" className="h-10" disabled={isProposing || state === ""}>
              Review…
            </Button>
          </form>
        </ActionBlock>
      ) : null}

      <ActionBlock title="Link pull request" hint="Adds a PR reference to this ticket.">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onPropose({
              credentialId,
              kind: "WORK_ITEM_LINK_PR",
              target,
              params: { repositoryId, pullRequestId: Number(pullRequestId) },
            });
          }}
          className="grid grid-cols-[1fr_7rem_auto] gap-2"
        >
          <Label htmlFor="action-repo" className="sr-only">
            Repository
          </Label>
          <select
            id="action-repo"
            className={selectClassName}
            value={repositoryId}
            onChange={(event) => setRepositoryId(event.target.value)}
          >
            <option value="">{repositories.isLoading ? "Loading..." : "Repository"}</option>
            {(repositories.data ?? []).map((repository) => (
              <option key={repository.id} value={repository.id}>
                {repository.name}
              </option>
            ))}
          </select>
          <Label htmlFor="action-pr" className="sr-only">
            Pull request number
          </Label>
          <Input
            id="action-pr"
            type="number"
            min={1}
            placeholder="PR #"
            value={pullRequestId}
            onChange={(event) => setPullRequestId(event.target.value)}
          />
          <Button
            type="submit"
            size="sm"
            className="h-10"
            disabled={isProposing || repositoryId === "" || !(Number(pullRequestId) > 0)}
          >
            Review…
          </Button>
        </form>
      </ActionBlock>

      {canCloseAfterMerge ? (
        <ActionBlock title="Close after merge" hint="Allowed once every linked pull request has been completed.">
          <Button
            size="sm"
            disabled={isProposing}
            onClick={() => onPropose({ credentialId, kind: "WORK_ITEM_CLOSE_AFTER_MERGE", target, params: {} })}
          >
            Review closing…
          </Button>
        </ActionBlock>
      ) : null}
    </div>
  );
}
