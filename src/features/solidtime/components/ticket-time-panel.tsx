import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ErrorCard, SectionCard, SkeletonRows } from "@/features/azure-devops/components/feedback";
import type { ProposeActionInput } from "@/features/azure-devops/types/action.types";
import { retryUnlessClientError } from "@/features/azure-devops/utils/query-retry";
import { getTicketTime } from "../api/solidtime.api";
import { solidtimeKeys } from "../api/solidtime.keys";
import { useLinkedSolidtime } from "../hooks/use-solidtime";
import { TicketTimeResult } from "./ticket-time-result";
import { TicketTimerButton } from "./ticket-timer-button";

interface TicketTimePanelProps {
  azureCredentialId: string;
  ticket: { id: number; title: string; projectName: string };
  onPropose: (input: ProposeActionInput) => void;
  isProposing: boolean;
}

/**
 * Time on this ticket in Solidtime. "Check time in Solidtime" reads the total
 * (all time; everyone's when my role allows) fresh, next to Azure's fields,
 * with the offer to update Azure from it through approval.
 */
export function TicketTimePanel({ azureCredentialId, ticket, onPropose, isProposing }: TicketTimePanelProps) {
  const { connection, isLoading } = useLinkedSolidtime(azureCredentialId);
  const [checked, setChecked] = useState(false);
  const time = useQuery({
    queryKey: solidtimeKeys.ticketTime(connection?.credentialId ?? "", ticket.id),
    queryFn: () => getTicketTime(connection?.credentialId ?? "", ticket.id, { refresh: true }),
    enabled: connection !== null && checked,
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

  return (
    <SectionCard
      title="Time"
      description={description}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" disabled={time.isFetching} onClick={() => (checked ? void time.refetch() : setChecked(true))}>
            {time.isFetching ? <Spinner className="size-4" /> : null}
            {checked ? "Check again" : "Check time in Solidtime"}
          </Button>
          <TicketTimerButton connection={connection} ticket={ticket} onPropose={onPropose} disabled={isProposing} />
        </div>
      }
    >
      {!checked ? (
        <p className="text-sm text-slate-600">See how much time is logged on #{ticket.id} in Solidtime and update Azure's Completed Work from it.</p>
      ) : time.isLoading ? (
        <SkeletonRows rows={2} />
      ) : time.error || !time.data ? (
        <ErrorCard error={time.error} onRetry={() => void time.refetch()} />
      ) : (
        <TicketTimeResult data={time.data} azureCredentialId={azureCredentialId} onPropose={onPropose} isProposing={isProposing} />
      )}
    </SectionCard>
  );
}
