import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/utils/cn";
import { ErrorCard, SkeletonRows } from "@/features/azure-devops/components/feedback";
import type { ProposeActionInput } from "@/features/azure-devops/types/action.types";
import { retryUnlessClientError } from "@/features/azure-devops/utils/query-retry";
import { getTicketTime } from "../api/solidtime.api";
import { solidtimeKeys } from "../api/solidtime.keys";
import type { SolidtimeConnection } from "../types/solidtime.types";
import { TicketTimeResult } from "./ticket-time-result";

/** Type a ticket id: its title, all the time logged on it in Solidtime, and the offer to update Azure from it. */
export function TicketTimeLookup({ connection, onPropose, isProposing }: { connection: SolidtimeConnection; onPropose: (input: ProposeActionInput) => void; isProposing: boolean }) {
  const [text, setText] = useState("");
  const [ticketId, setTicketId] = useState<number | null>(null);
  const time = useQuery({
    queryKey: solidtimeKeys.ticketTime(connection.credentialId, ticketId ?? 0),
    queryFn: () => getTicketTime(connection.credentialId, ticketId!, { refresh: true }),
    enabled: ticketId !== null,
    retry: retryUnlessClientError,
  });
  const typed = /^#?\d{1,9}$/.test(text.trim()) ? Number(text.trim().replace("#", "")) : null;
  const ticket = time.data?.ticket ?? null;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (typed === null || typed <= 0) return;
    if (typed === ticketId) void time.refetch();
    else setTicketId(typed);
  }

  return (
    // With a result, the card takes the full width (its figures need the room).
    <Card className={cn("flex flex-col gap-3 px-4 py-3", ticketId !== null && "lg:col-span-2")}>
      <form onSubmit={submit} aria-label="Ticket time lookup" className="flex flex-wrap items-center gap-2">
        <label className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium text-slate-700">
          <span className="whitespace-nowrap">Ticket time</span>
          <Input aria-label="Ticket ID" inputMode="numeric" placeholder="Ticket ID, e.g. 21786" className="h-9 min-w-0 flex-1" value={text} onChange={(event) => setText(event.target.value)} />
        </label>
        <Button size="sm" type="submit" disabled={typed === null || typed <= 0 || time.isFetching}>
          {time.isFetching ? <Spinner className="size-4" /> : null}
          Check
        </Button>
        <p className="w-full text-xs text-slate-500">All the time logged on a ticket in Solidtime, next to its Azure Completed Work.</p>
      </form>

      {ticketId === null ? null : time.isLoading ? (
        <SkeletonRows rows={2} />
      ) : time.error || !time.data ? (
        <ErrorCard error={time.error} onRetry={() => void time.refetch()} />
      ) : (
        <div className="flex flex-col gap-3">
          <p className="font-medium text-slate-950">
            {ticket && connection.azureCredentialId ? (
              <Link
                to={`/azure/${encodeURIComponent(connection.azureCredentialId)}/projects/${encodeURIComponent(ticket.projectName)}/work-items/${ticket.id}`}
                className="hover:underline"
              >
                #{ticket.id} {ticket.title}
              </Link>
            ) : (
              <>#{ticketId}</>
            )}
            {ticket ? <span className="ml-2 text-xs font-normal text-slate-500">{ticket.type} · {ticket.state} · {ticket.projectName}</span> : null}
          </p>
          <TicketTimeResult data={time.data} azureCredentialId={connection.azureCredentialId} onPropose={onPropose} isProposing={isProposing} />
        </div>
      )}
    </Card>
  );
}
