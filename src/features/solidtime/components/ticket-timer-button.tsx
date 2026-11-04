import { Play, Square, TimerOff } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { errorMessage } from "@/lib/error-text";
import type { ProposeActionInput } from "@/features/azure-devops/types/action.types";
import { useCatalog, useTimer } from "../hooks/use-solidtime";
import type { SolidtimeConnection } from "../types/solidtime.types";
import { mentionsTicket, solidtimeProjectFor } from "../utils/project-map";

interface TicketTimerButtonProps {
  connection: SolidtimeConnection;
  ticket: { id: number; title: string; projectName: string };
  onPropose: (input: ProposeActionInput) => void;
  disabled?: boolean;
  /** Icon only (list rows): the label stays as the button's accessible name and tooltip. */
  compact?: boolean;
}

/**
 * Start or stop my Solidtime timer for a ticket. Both only propose the change;
 * the review dialog is where it is approved. A timer starts when Start was pressed.
 */
export function TicketTimerButton({ connection, ticket, onPropose, disabled = false, compact = false }: TicketTimerButtonProps) {
  const content = (label: string, icon: ReactNode) =>
    compact ? (
      <>
        {icon}
        <span className="sr-only">{label}</span>
      </>
    ) : (
      label
    );
  const compactClass = compact ? "size-8 px-0" : undefined;
  const timer = useTimer(connection.credentialId);
  const catalog = useCatalog(connection.credentialId);
  const running = timer.data?.entry ?? null;
  // Only a timer in this organization can be stopped from here.
  const onThisTicket = running !== null && running.organization_id === connection.organizationId && mentionsTicket(running.description, ticket.id);

  // The timer could not be read (bad token, Solidtime down or rate limiting): say so instead of offering Start.
  // Without the project list a mapped project cannot be chosen, so a timer would start without its project.
  const unavailable =
    timer.error && !timer.data
      ? errorMessage(timer.error, "Solidtime could not be reached.")
      : catalog.isError && !catalog.data && !running
        ? `Solidtime projects could not be loaded: ${errorMessage(catalog.error, "Solidtime could not be reached.")}`
        : null;

  if (unavailable) {
    const reason = unavailable;
    // A disabled button shows no tooltip: the reason sits on a focusable wrapper.
    return (
      <Hint label={`Timer unavailable: ${reason}`}>
        <span tabIndex={0} className="inline-flex rounded-lg">
          <Button size="sm" variant="secondary" disabled aria-label={`Timer unavailable: ${reason}`} className={compactClass}>
            {content("Timer unavailable", <TimerOff aria-hidden="true" className="size-4" />)}
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
        className={compactClass}
        // A running timer stays visible even where row actions only show on hover.
        data-timer-running=""
        title={compact ? "Stop timer…" : undefined}
        onClick={() =>
          onPropose({
            credentialId: connection.credentialId,
            kind: "SOLIDTIME_TIMER_STOP",
            target: { entryId: running.id, entryStart: running.start },
            params: { stoppedAt: new Date().toISOString() },
          })
        }
      >
        {content("Stop timer…", <Square aria-hidden="true" className="size-3.5 fill-current" />)}
      </Button>
    );
  }

  const start = (
    <Button
      size="sm"
      variant="secondary"
      // The project comes from the catalog: wait for it.
      disabled={disabled || running !== null || timer.isLoading || catalog.isLoading}
      className={compactClass}
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
      {content("Start timer…", <Play aria-hidden="true" className="size-3.5" />)}
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
