import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { ErrorCard, SectionCard, SkeletonRows, StatTile } from "@/features/azure-devops/components/feedback";
import type { ProposeActionInput } from "@/features/azure-devops/types/action.types";
import { retryUnlessClientError } from "@/features/azure-devops/utils/query-retry";
import { getTicketTime } from "../api/solidtime.api";
import { solidtimeKeys } from "../api/solidtime.keys";
import { useLinkedSolidtime } from "../hooks/use-solidtime";
import { formatDuration, formatHours } from "../utils/time";
import { TicketTimerButton } from "./ticket-timer-button";

interface TicketTimePanelProps {
  azureCredentialId: string;
  ticket: { id: number; title: string; projectName: string };
  onPropose: (input: ProposeActionInput) => void;
  isProposing: boolean;
}

/**
 * Time tracked on this ticket in Solidtime (mine, and the team's when my role
 * allows), against its Azure estimate. Solidtime is the source of truth for
 * hours: Azure's time fields can be updated from it, through approval.
 */
export function TicketTimePanel({ azureCredentialId, ticket, onPropose, isProposing }: TicketTimePanelProps) {
  const { connection, isLoading } = useLinkedSolidtime(azureCredentialId);
  const [reason, setReason] = useState("");
  const time = useQuery({
    queryKey: solidtimeKeys.ticketTime(connection?.credentialId ?? "", ticket.id),
    queryFn: () => getTicketTime(connection?.credentialId ?? "", ticket.id),
    enabled: connection !== null,
    retry: retryUnlessClientError,
  });

  const description = "From Solidtime, matched by the ticket number in each entry's description.";

  if (isLoading) {
    return (
      <SectionCard title="Time" description={description}>
        <SkeletonRows rows={2} />
      </SectionCard>
    );
  }

  if (!connection) {
    return (
      <SectionCard title="Time" description={description}>
        <p className="text-sm text-slate-600">
          Connect Solidtime and link it to this organization to track and see time here.{" "}
          <Link to="/credentials" className="font-medium text-indigo-700 hover:underline">
            Credentials
          </Link>
        </p>
      </SectionCard>
    );
  }

  const data = time.data;
  const comparison = data?.comparison ?? null;

  return (
    <SectionCard
      title="Time"
      description={description}
      actions={<TicketTimerButton connection={connection} ticket={ticket} onPropose={onPropose} disabled={isProposing} />}
    >
      {time.isLoading ? (
        <SkeletonRows rows={2} />
      ) : time.error || !data ? (
        <ErrorCard error={time.error} onRetry={() => void time.refetch()} />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="You" value={<span className="text-base">{formatDuration(data.time.mySeconds)}</span>} hint={data.time.running ? "timer running" : undefined} />
            <StatTile label="Team" value={<span className="text-base">{data.time.teamSeconds === null ? "—" : formatDuration(data.time.teamSeconds)}</span>} hint={data.time.teamSeconds === null ? "needs a Manager role" : undefined} />
            <StatTile label="Estimate" value={<span className="text-base">{comparison?.estimateHours === null || !comparison ? "—" : formatHours(comparison.estimateHours)}</span>} />
            <StatTile
              label="Azure completed"
              value={<span className="text-base">{data.ticket?.completedWork === null || !data.ticket ? "—" : formatHours(data.ticket.completedWork)}</span>}
              hint={comparison ? (comparison.inSync ? "matches Solidtime" : `Solidtime: ${formatHours(comparison.suggested.completedWork)}`) : undefined}
            />
          </div>

          {data.time.people && data.time.people.length > 0 ? (
            <ul className="text-sm text-slate-700" aria-label="Time by person">
              {data.time.people.map((person) => (
                <li key={person.name}>
                  {person.name}: {formatDuration(person.seconds)}
                </li>
              ))}
            </ul>
          ) : null}

          {comparison && data.ticket && !comparison.inSync ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={isProposing}
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
                Update Azure time fields from Solidtime…
              </Button>
              <span className="text-xs text-slate-500">
                Completed {formatHours(comparison.suggested.completedWork)}
                {comparison.suggested.remainingWork === null ? "" : ` · Remaining ${formatHours(comparison.suggested.remainingWork)}`}
              </span>
            </div>
          ) : null}

          {comparison?.overEstimate ? (
            <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm text-amber-800">
                Tracked time ({formatHours(comparison.trackedHours)}) is over the estimate ({formatHours(comparison.estimateHours ?? 0)}). The SOP asks for a comment explaining why (DEV-02).
              </p>
              <label className="text-xs font-medium text-amber-900" htmlFor={`over-estimate-${ticket.id}`}>
                Why did it take longer?
              </label>
              <textarea
                id={`over-estimate-${ticket.id}`}
                value={reason}
                rows={2}
                onChange={(event) => setReason(event.target.value)}
                className="w-full rounded-md border border-amber-300 bg-white px-2 py-1.5 text-sm"
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
      )}
    </SectionCard>
  );
}
