import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api-client";
import { Input } from "@/components/ui/input";
import type { ProposeActionInput } from "@/features/azure-devops/types/action.types";
import { useCatalog, useTimer } from "../hooks/use-solidtime";
import type { SolidtimeConnection } from "../types/solidtime.types";
import { formatDuration } from "../utils/time";
import { LoadErrorNotice } from "./load-error-notice";

const SELECT = "h-9 rounded-lg border border-slate-300 bg-surface px-2.5 text-sm shadow-sm";

/** The running timer with a live clock, or a quick way to start one. Both only propose; approval runs them. */
export function TimerBar({ connection, onPropose, isProposing }: { connection: SolidtimeConnection; onPropose: (input: ProposeActionInput) => void; isProposing: boolean }) {
  const timer = useTimer(connection.credentialId);
  const catalog = useCatalog(connection.credentialId);
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const running = timer.data?.entry ?? null;

  useEffect(() => {
    if (!running) return undefined;
    const handle = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(handle);
  }, [running]);

  if (running) {
    return (
      <div role="region" aria-label="Running timer" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
        <p className="text-sm text-emerald-900">
          <span className="mr-2 inline-block size-2 animate-pulse rounded-full bg-emerald-500" aria-hidden="true" />
          <span className="font-semibold tabular-nums">{formatDuration((now - Date.parse(running.start)) / 1000)}</span> · {running.description ?? "(no description)"}
          {timer.data && !timer.data.inThisOrganization ? " · in another Solidtime organization" : ""}
        </p>
        {timer.data?.inThisOrganization ? (
          <Button
            size="sm"
            variant="danger"
            disabled={isProposing}
            onClick={() => onPropose({ credentialId: connection.credentialId, kind: "SOLIDTIME_TIMER_STOP", target: { entryId: running.id, entryStart: running.start }, params: { stoppedAt: new Date().toISOString() } })}
          >
            Stop timer…
          </Button>
        ) : (
          <span className="text-xs text-emerald-900">Stop it in that organization.</span>
        )}
      </div>
    );
  }

  // The timer could not be read: say why, and hold Start (a timer may be running that this page cannot see).
  const readError = timer.error && !timer.data ? (timer.error instanceof ApiError ? timer.error.message : "Solidtime could not be reached.") : null;

  // One block, so the notices stay with the form in the Time page's grid.
  return (
    <div className="flex flex-col gap-2">
      {readError ? (
        <p role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          Your Solidtime timer could not be read: {readError}
          <Button size="sm" variant="ghost" onClick={() => void timer.refetch()}>
            Retry
          </Button>
        </p>
      ) : null}
      <form
        aria-label="Start a timer"
        className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-surface px-4 py-3 sm:flex-row sm:items-center"
        onSubmit={(event) => {
          event.preventDefault();
          onPropose({
            credentialId: connection.credentialId,
            kind: "SOLIDTIME_TIMER_START",
            target: {},
            params: { startedAt: new Date().toISOString(), description: description.trim() || null, projectId: projectId || null, taskId: null, tags: [], billable: false },
          });
        }}
      >
        <Input aria-label="What are you working on?" placeholder="What are you working on? e.g. #21786" value={description} onChange={(event) => setDescription(event.target.value)} className="h-9 sm:flex-1" />
        <select aria-label="Project" className={SELECT} value={projectId} onChange={(event) => setProjectId(event.target.value)}>
          <option value="">No project</option>
          {(catalog.data?.projects ?? []).map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm" disabled={isProposing || timer.isLoading || readError !== null}>
          Start timer…
        </Button>
      </form>
      {catalog.isError && !catalog.data ? <LoadErrorNotice what="Solidtime projects" onRetry={() => void catalog.refetch()} isRetrying={catalog.isFetching} /> : null}
    </div>
  );
}
