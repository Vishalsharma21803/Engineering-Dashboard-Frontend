import { ArrowRightLeft, CheckCircle2, Clock, GitPullRequest, MessageSquare } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import { Textarea } from "@/components/ui/textarea";
import { useRepositories } from "../hooks/use-projects";
import type { ProposeActionInput } from "../types/action.types";
import type { SupportedWorkFields, WorkItemDetail } from "../types/azure.types";
import type { ActionPanel } from "../utils/action-panels";

interface WorkItemActionsProps {
  credentialId: string;
  workItem: WorkItemDetail;
  isProposing: boolean;
  onPropose: (input: ProposeActionInput, onProposed?: () => void) => void;
  /** The open form (controlled, so SOP fixes on the page can open one). */
  open: ActionPanel | null;
  onOpenChange: (panel: ActionPanel | null) => void;
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

function ActionDialog({ title, hint, open, onClose, children }: { title: string; hint: string; open: boolean; onClose: () => void; children: ReactNode }) {
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{hint} Nothing is written to Azure DevOps until you approve it.</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

/** Buttons for each change; each opens a form that only proposes (the review dialog asks for approval). */
export function WorkItemActions({ credentialId, workItem, isProposing, onPropose, open, onOpenChange }: WorkItemActionsProps) {
  const target = { projectId: workItem.projectName, workItemId: workItem.id };
  const supportedFields = (Object.keys(FIELD_LABELS) as FieldKey[]).filter((key) => workItem.supportedFields[key]);

  const [comment, setComment] = useState("");
  const current = Object.fromEntries(supportedFields.map((key) => [key, workItem[key] === null ? "" : String(workItem[key])])) as Partial<Record<FieldKey, string>>;
  const [fields, setFields] = useState<Partial<Record<FieldKey, string>>>(current);
  /** The ticket's values the inputs were last filled from. */
  const [seeded, setSeeded] = useState({ rev: workItem.rev, values: current });
  const [state, setState] = useState("");

  // The ticket changed (in Azure, or by an approved change): untouched inputs take the new values, typed ones are kept.
  if (seeded.rev !== workItem.rev) {
    setSeeded({ rev: workItem.rev, values: current });
    setFields(Object.fromEntries(supportedFields.map((key) => [key, fields[key] === seeded.values[key] ? current[key] : fields[key]])));

    if (state !== "" && !workItem.allowedStates.some((candidate) => candidate.name === state && candidate.name !== workItem.state)) {
      setState("");
    }
  }
  const [repositoryId, setRepositoryId] = useState("");
  const [pullRequestId, setPullRequestId] = useState("");
  const repositories = useRepositories(credentialId, workItem.projectName);

  const close = () => onOpenChange(null);
  /** Proposing hands over to the review dialog; the form closes. */
  const propose = (input: ProposeActionInput, onProposed?: () => void) => {
    onPropose(input, onProposed);
    close();
  };

  function submitComment(event: FormEvent) {
    event.preventDefault();
    propose(
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
    propose({ credentialId, kind: "WORK_ITEM_UPDATE_FIELDS", target, params: changedFields });
  }

  const transitions = workItem.allowedStates.filter((candidate) => candidate.name !== workItem.state);
  const canCloseAfterMerge =
    workItem.closeAfterMergeAllowed &&
    workItem.links.pullRequests.length > 0 &&
    workItem.stateCategory !== "Completed" &&
    workItem.stateCategory !== "Removed";

  const actionButton = (panel: ActionPanel, label: string, icon: ReactNode) => (
    <Button size="sm" variant="secondary" onClick={() => onOpenChange(panel)} aria-haspopup="dialog">
      {icon}
      {label}
    </Button>
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      {actionButton("comment", "Comment", <MessageSquare aria-hidden="true" className="size-4" />)}
      {transitions.length > 0 ? actionButton("state", "Change state", <ArrowRightLeft aria-hidden="true" className="size-4" />) : null}
      {supportedFields.length > 0 ? actionButton("fields", "Estimates & work", <Clock aria-hidden="true" className="size-4" />) : null}
      {actionButton("pr", "Link pull request", <GitPullRequest aria-hidden="true" className="size-4" />)}
      {canCloseAfterMerge ? (
        <Button size="sm" variant="secondary" disabled={isProposing} onClick={() => onPropose({ credentialId, kind: "WORK_ITEM_CLOSE_AFTER_MERGE", target, params: {} })}>
          <CheckCircle2 aria-hidden="true" className="size-4" />
          Close after merge…
        </Button>
      ) : null}

      <ActionDialog title="Add comment" hint="Progress update, or the reason for a state, estimate or due date change." open={open === "comment"} onClose={close}>
        <form onSubmit={submitComment} className="space-y-3">
          <Label htmlFor="action-comment" className="sr-only">
            Comment
          </Label>
          <Textarea
            id="action-comment"
            className="min-h-32"
            value={comment}
            maxLength={10_000}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Approach: ..."
          />
          <Button type="submit" size="sm" disabled={isProposing || comment.trim() === ""}>
            Review comment…
          </Button>
        </form>
      </ActionDialog>

      {supportedFields.length > 0 ? (
        <ActionDialog title="Estimates & work log" hint="Only changed values are proposed." open={open === "fields"} onClose={close}>
          <form onSubmit={submitFields} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
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
        </ActionDialog>
      ) : null}

      {transitions.length > 0 ? (
        <ActionDialog title="Change state" hint={`Currently ${workItem.state}.`} open={open === "state"} onClose={close}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              propose({ credentialId, kind: "WORK_ITEM_TRANSITION_STATE", target, params: { state } });
            }}
            className="flex gap-2"
          >
            <Label htmlFor="action-state" className="sr-only">
              New state
            </Label>
            <SelectField id="action-state" value={state} onValueChange={(selected) => setState(selected)}>
              <option value="">Choose a state</option>
              {transitions.map((candidate) => (
                <option key={candidate.name} value={candidate.name}>
                  {candidate.name}
                </option>
              ))}
            </SelectField>
            <Button type="submit" size="sm" className="h-10" disabled={isProposing || state === ""}>
              Review…
            </Button>
          </form>
        </ActionDialog>
      ) : null}

      <ActionDialog title="Link pull request" hint="Adds a pull request reference to this ticket." open={open === "pr"} onClose={close}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            propose({
              credentialId,
              kind: "WORK_ITEM_LINK_PR",
              target,
              params: { repositoryId, pullRequestId: Number(pullRequestId) },
            });
          }}
          className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_7rem_auto]"
        >
          <Label htmlFor="action-repo" className="sr-only">
            Repository
          </Label>
          <SelectField
            id="action-repo"
            className="col-span-2 sm:col-span-1"
            value={repositoryId}
            onValueChange={(selected) => setRepositoryId(selected)}
          >
            <option value="">{repositories.isLoading ? "Loading..." : repositories.error && !repositories.data ? "Repositories could not be loaded" : "Repository"}</option>
            {(repositories.data ?? []).map((repository) => (
              <option key={repository.id} value={repository.id}>
                {repository.name}
              </option>
            ))}
          </SelectField>
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
      </ActionDialog>
    </div>
  );
}
