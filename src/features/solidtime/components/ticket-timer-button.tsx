import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { ApiError } from "@/lib/api-client";
import type { ProposeActionInput } from "@/features/azure-devops/types/action.types";
import { useCatalog, useTimer } from "../hooks/use-solidtime";
import type { SolidtimeConnection } from "../types/solidtime.types";
import { mentionsTicket, solidtimeProjectFor } from "../utils/project-map";

interface TicketTimerButtonProps {
  connection: SolidtimeConnection;
  ticket: { id: number; title: string; projectName: string };
  onPropose: (input: ProposeActionInput) => void;
  disabled?: boolean;
}

/**
 * Start or stop my Solidtime timer for a ticket. Both only propose the change;
 * the review dialog is where it is approved. A timer starts when Start was pressed.
 */
export function TicketTimerButton({ connection, ticket, onPropose, disabled = false }: TicketTimerButtonProps) {
  const timer = useTimer(connection.credentialId);
  const catalog = useCatalog(connection.credentialId);
  const running = timer.data?.entry ?? null;
  // Only a timer in this organization can be stopped from here.
  const onThisTicket = running !== null && running.organization_id === connection.organizationId && mentionsTicket(running.description, ticket.id);

  // The timer could not be read (bad token, Solidtime down or rate limiting): say so instead of offering Start.
  if (timer.error && !timer.data) {
    const reason = timer.error instanceof ApiError ? timer.error.message : "Solidtime could not be reached.";
    // A disabled button shows no tooltip: the reason sits on a focusable wrapper.
    return (
      <Hint label={`Timer unavailable: ${reason}`}>
        <span tabIndex={0} className="inline-flex rounded-lg">
          <Button size="sm" variant="secondary" disabled aria-label={`Timer unavailable: ${reason}`}>
            Timer unavailable
          </Button>
        </span>
      </Hint>
    );
  }

  if (onThisTicket && running) {
    return (
      <Button
        size="sm"
        variant="danger"
        disabled={disabled}
        onClick={() =>
          onPropose({
            credentialId: connection.credentialId,
            kind: "SOLIDTIME_TIMER_STOP",
            target: { entryId: running.id, entryStart: running.start },
            params: { stoppedAt: new Date().toISOString() },
          })
        }
      >
        Stop timer…
      </Button>
    );
  }

  const start = (
    <Button
      size="sm"
      variant="secondary"
      disabled={disabled || running !== null || timer.isLoading}
      title={running ? undefined : `Track time on #${ticket.id}`}
      onClick={() =>
        onPropose({
          credentialId: connection.credentialId,
          kind: "SOLIDTIME_TIMER_START",
          target: {},
          params: {
            startedAt: new Date().toISOString(),
            description: `#${ticket.id} ${ticket.title}`,
            projectId: solidtimeProjectFor(connection, catalog.data?.projects ?? [], ticket.projectName),
            taskId: null,
            tags: [],
            billable: false,
          },
        })
      }
    >
      Start timer…
    </Button>
  );

  return running ? (
    <Hint label="Another timer is running; stop it first">
      <span tabIndex={0} className="inline-flex rounded-lg">
        {start}
      </span>
    </Hint>
  ) : (
    start
  );
}
