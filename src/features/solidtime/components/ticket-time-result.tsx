import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StatTile } from "@/features/azure-devops/components/feedback";
import type { ProposeActionInput } from "@/features/azure-devops/types/action.types";
import type { TicketTimeResponse } from "../api/solidtime.api";
import { formatDuration, formatHours } from "../utils/time";

interface TicketTimeResultProps {
  data: TicketTimeResponse;
  /** The Azure organization the ticket lives in; null when the Solidtime connection is not linked to one. */
  azureCredentialId: string | null;
  onPropose: (input: ProposeActionInput) => void;
  isProposing: boolean;
}

/**
 * All the Solidtime time on one ticket next to its Azure fields, with the
 * offer to set Azure's Completed and Remaining Work from it (through approval).
 * Shared by the ticket page and the Time page lookup.
 */
export function TicketTimeResult({ data, azureCredentialId, onPropose, isProposing }: TicketTimeResultProps) {
  const [reason, setReason] = useState("");
  const { time, ticket, comparison } = data;
  const total = time.teamSeconds ?? time.mySeconds;
  const upToDate = comparison !== null && ticket !== null && (ticket.completedWork ?? 0) === comparison.suggested.completedWork;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label={time.teamSeconds === null ? "Total (your time)" : "Total in Solidtime"}
          value={<span className="text-base">{formatDuration(total)}</span>}
          hint={time.running ? "your timer is running" : time.teamSeconds === null ? "your role sees only your time" : `you: ${formatDuration(time.mySeconds)}`}
        />
        <StatTile label="Estimate" value={<span className="text-base">{comparison?.estimateHours == null ? "—" : formatHours(comparison.estimateHours)}</span>} />
        <StatTile label="Azure completed" value={<span className="text-base">{ticket?.completedWork == null ? "—" : formatHours(ticket.completedWork)}</span>} />
        <StatTile label="Azure remaining" value={<span className="text-base">{ticket?.remainingWork == null ? "—" : formatHours(ticket.remainingWork)}</span>} />
      </div>

      {time.people && time.people.length > 0 ? (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-700" aria-label="Time by person">
          {time.people.map((person) => (
            <li key={person.name}>
              {person.name}: {formatDuration(person.seconds)}
            </li>
          ))}
        </ul>
      ) : null}

      {!ticket ? (
        <p className="text-sm text-slate-600">{azureCredentialId ? "This ticket was not found in the linked Azure DevOps organization, so its fields cannot be updated." : "Link this Solidtime connection to an Azure DevOps organization (Credentials) to compare and update the ticket."}</p>
      ) : comparison && azureCredentialId ? (
        <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          {/* Completed Work decides: when Azure already has the Solidtime total, there is nothing to update. */}
          {upToDate ? (
            <p className="text-sm text-emerald-700">Azure Completed Work already matches Solidtime ({formatHours(comparison.suggested.completedWork)}).</p>
          ) : (
            <p className="text-sm text-slate-700">
              Set Azure to <strong>Completed {formatHours(comparison.suggested.completedWork)}</strong>
              {comparison.suggested.remainingWork === null ? "" : ` · Remaining ${formatHours(comparison.suggested.remainingWork)}`}
              {ticket.completedWork !== null ? <span className="text-slate-500"> (now {formatHours(ticket.completedWork)} completed)</span> : null}
            </p>
          )}
          {comparison.basis === "mine" && !upToDate ? (
            <p role="note" className="text-xs text-amber-700">
              Based on your own time only: your Solidtime role cannot see teammates' time. Updating replaces any hours others logged in Azure.
            </p>
          ) : null}
          <div>
            <Button
              size="sm"
              disabled={isProposing || upToDate}
              onClick={() =>
                onPropose({
                  credentialId: azureCredentialId,
                  kind: "WORK_ITEM_UPDATE_FIELDS",
                  source: "USER",
                  target: { projectId: ticket.projectName, workItemId: ticket.id },
                  params: {
                    completedWork: comparison.suggested.completedWork,
                    ...(comparison.suggested.remainingWork === null ? {} : { remainingWork: comparison.suggested.remainingWork }),
                  },
                })
              }
            >
              {upToDate ? "Azure already up to date" : `Update Azure to ${formatHours(comparison.suggested.completedWork)}…`}
            </Button>
          </div>
        </div>
      ) : null}

      {comparison?.overEstimate && ticket && azureCredentialId ? (
        <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm text-amber-800">
            Tracked time ({formatHours(comparison.trackedHours)}) is over the estimate ({formatHours(comparison.estimateHours ?? 0)}). The SOP asks for a comment explaining why (DEV-02).
          </p>
          <label className="text-xs font-medium text-amber-900" htmlFor={`over-estimate-${ticket.id}`}>
            Why did it take longer?
          </label>
          <Textarea
            id={`over-estimate-${ticket.id}`}
            value={reason}
            rows={2}
            onChange={(event) => setReason(event.target.value)}
            className="min-h-0 border-amber-300 px-2 py-1.5"
          />
          <div>
            <Button
              size="sm"
              disabled={isProposing || reason.trim() === ""}
              onClick={() =>
                onPropose({
                  credentialId: azureCredentialId,
                  kind: "WORK_ITEM_COMMENT",
                  source: "USER",
                  target: { projectId: ticket.projectName, workItemId: ticket.id },
                  params: {
                    text: `Time tracked so far is ${formatHours(comparison.trackedHours)} against an estimate of ${formatHours(comparison.estimateHours ?? 0)}. Reason: ${reason.trim()}`,
                  },
                })
              }
            >
              Propose comment…
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
