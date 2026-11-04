import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { buttonClassName } from "@/components/ui/button-styles";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ArrowRightIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { SelectField } from "@/components/ui/select-field";
import { ErrorCard, StaleDataBanner } from "@/features/azure-devops/components/feedback";
import { StatusBadge } from "@/features/azure-devops/components/status-badge";
import type { CredentialAlertTone } from "@/features/credentials/components/credential-alert";
import { CredentialCardFrame, type CardNotice } from "@/features/credentials/components/credential-card-frame";
import { EditIcon, ShieldIcon, TrashIcon } from "@/features/credentials/components/credential-icons";
import { deleteCredential } from "@/features/credentials/api/credential.api";
import { useCredentials } from "@/features/credentials/hooks/use-credentials";
import { dropCredentialCaches } from "@/features/credentials/hooks/use-delete-credential";
import { getCredentialDisplayName } from "@/features/credentials/utils/credential-display";
import { ApiError } from "@/lib/api-client";
import { errorMessage } from "@/lib/error-text";
import { listMemberships, updateConnection, validateConnection, type ConnectionChange } from "../api/solidtime.api";
import { solidtimeKeys } from "../api/solidtime.keys";
import { useSolidtimeConnections } from "../hooks/use-solidtime";
import type { SolidtimeConnection } from "../types/solidtime.types";
import { LoadErrorNotice } from "./load-error-notice";

function errorText(error: unknown, fallback: string): string {
  const field = error instanceof ApiError ? error.errors[0] : undefined;
  const message = errorMessage(error, fallback);
  return field ? `${message}: ${field.message}` : message;
}

/** A message for the top of the Credentials page, the same place Azure DevOps reports to. */
export type CredentialsNotice = { tone: CredentialAlertTone; message: string };

function ConnectionCard({ connection, onNotice }: { connection: SolidtimeConnection; onNotice: (notice: CredentialsNotice) => void }) {
  const queryClient = useQueryClient();
  const azure = useCredentials();
  const [target, setTarget] = useState(String(connection.dailyTargetHours));
  const [alert, setAlert] = useState(String(connection.timerAlertHours));
  const [newToken, setNewToken] = useState("");
  const [replacing, setReplacing] = useState(false);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  /** Validation and token results, shown in this card. */
  const [notice, setNotice] = useState<CardNotice | null>(null);
  const memberships = useQuery({
    queryKey: solidtimeKeys.memberships(connection.credentialId),
    queryFn: ({ signal }) => listMemberships(connection.credentialId, signal),
    enabled: connection.organizationId === null,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: solidtimeKeys.all });
  const name = connection.label ?? connection.baseUrl.replace(/^https?:\/\//, "");
  // gcTime 0: a token change keeps the token in the variables; they are not kept after the call.
  // One change at a time (the controls below are disabled while one is saving), so `update.error` is always the latest call's.
  const update = useMutation({ mutationFn: (change: ConnectionChange) => updateConnection(connection.credentialId, change), onSuccess: refresh, gcTime: 0 });
  const check = useMutation({
    mutationFn: () => validateConnection(connection.credentialId),
    onSuccess: async (result) => {
      await refresh();
      setNotice(
        result.valid
          ? { tone: "success", message: `${name} validated successfully with Solidtime.` }
          : { tone: "error", message: `Solidtime rejected the API token for ${name}. Replace it with a new token.` }
      );
    },
    onError: (error) => setNotice({ tone: "error", message: errorText(error, `Could not check ${name} with Solidtime.`) }),
  });
  const remove = useMutation({
    mutationFn: () => deleteCredential(connection.credentialId),
    onSuccess: async () => {
      dropCredentialCaches(queryClient, connection.credentialId);
      await refresh();
      onNotice({ tone: "success", message: `${name} disconnected.` });
    },
    onError: (error) => setNotice({ tone: "error", message: errorText(error, `Could not disconnect ${name}.`) }),
  });
  const targetsChanged = Number(target) !== connection.dailyTargetHours || Number(alert) !== connection.timerAlertHours;

  return (
    <CredentialCardFrame
      platform={{ label: "Solidtime", tone: "emerald" }}
      status={connection.lastValidationStatus}
      title={name}
      subtitle={connection.baseUrl}
      lastValidatedAt={connection.lastValidatedAt}
      validatedWith="Solidtime"
      notice={notice}
      onDismissNotice={() => setNotice(null)}
      meta={connection.canViewTeam ? <StatusBadge tone="info">Sees team time</StatusBadge> : <StatusBadge tone="neutral">Own time only</StatusBadge>}
      actions={
        <>
          <Button variant="secondary" size="sm" disabled={check.isPending || remove.isPending} onClick={() => { setNotice(null); check.mutate(); }} aria-label={`Validate ${name}`}>
            {check.isPending ? <Spinner className="size-3.5" /> : <ShieldIcon />}
            {check.isPending ? "Validating..." : "Validate"}
          </Button>
          <Button variant="secondary" size="sm" disabled={replacing || remove.isPending} onClick={() => setReplacing(true)} aria-label={`Replace the API token for ${name}`}>
            <EditIcon />
            Replace token
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="text-rose-700 hover:bg-rose-50 hover:text-rose-700"
            disabled={remove.isPending}
            aria-label={`Disconnect ${name}`}
            onClick={() => {
              remove.reset();
              setConfirmingDisconnect(true);
            }}
          >
            {remove.isPending ? <Spinner className="size-3.5" /> : <TrashIcon />}
            Disconnect
          </Button>
          <ConfirmDialog
            open={confirmingDisconnect}
            title={`Disconnect ${name}?`}
            description="Your time in Solidtime is not affected."
            confirmLabel="Disconnect"
            pendingLabel="Disconnecting…"
            destructive
            isPending={remove.isPending}
            error={remove.error ? errorText(remove.error, `Could not disconnect ${name}.`) : null}
            onConfirm={() => remove.mutate(undefined, { onSuccess: () => setConfirmingDisconnect(false) })}
            onOpenChange={setConfirmingDisconnect}
          />
        </>
      }
    >
      {replacing ? (
        <form
          className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3"
          aria-label={`New API token for ${name}`}
          onSubmit={(event) => {
            event.preventDefault();
            update.mutate(
              { token: newToken.trim() },
              {
                onSuccess: () => {
                  setNewToken("");
                  setReplacing(false);
                  setNotice({ tone: "success", message: `New API token saved for ${name}.` });
                },
              }
            );
          }}
        >
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm text-slate-700">
            New API token
            <Input type="password" autoComplete="off" className="h-9" value={newToken} onChange={(event) => setNewToken(event.target.value)} />
          </label>
          <Button size="sm" type="submit" disabled={update.isPending || newToken.trim().length < 20}>
            {update.isPending ? <Spinner className="size-3.5" /> : null}
            Save token
          </Button>
          <Button size="sm" variant="secondary" onClick={() => { setReplacing(false); setNewToken(""); }}>
            Cancel
          </Button>
          {newToken.trim() !== "" && newToken.trim().length < 20 ? <p className="w-full text-xs text-slate-500">API tokens are at least 20 characters.</p> : null}
        </form>
      ) : null}

      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-slate-500">Organization</dt>
        <dd className="font-medium text-slate-900">
          {connection.organizationName ?? <span className="text-amber-700">Not chosen yet</span>}
          {connection.role ? <span className="font-normal text-slate-500"> · {connection.role}</span> : null}
        </dd>
      </dl>

      {connection.organizationId === null ? (
        <div className="flex max-w-sm flex-col gap-1">
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            Choose the Solidtime organization
            <SelectField size="sm" defaultValue="" disabled={!memberships.data || update.isPending} onValueChange={(selected) => selected && update.mutate({ organizationId: selected })}>
              <option value="" disabled>
                {memberships.isLoading ? "Loading…" : !memberships.data ? "Organizations not loaded" : "Choose an organization"}
              </option>
              {(memberships.data ?? []).map((membership) => (
                <option key={membership.organization.id} value={membership.organization.id}>
                  {membership.organization.name} ({membership.role})
                </option>
              ))}
            </SelectField>
          </label>
          {memberships.isError && !memberships.data ? <LoadErrorNotice what="Your Solidtime organizations" error={memberships.error} onRetry={() => void memberships.refetch()} isRetrying={memberships.isFetching} /> : null}
        </div>
      ) : null}

      <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
          Linked Azure DevOps organization
          <SelectField
            size="sm"
            aria-label={`Azure organization for ${name}`}
            value={connection.azureCredentialId ?? ""}
            // Without the list, the current link cannot be shown; it would read "Not linked".
            disabled={!azure.data || update.isPending}
            onValueChange={(selected) => update.mutate({ azureCredentialId: selected || null })}
          >
            <option value="">Not linked</option>
            {(azure.data ?? []).map((credential) => (
              <option key={credential.id} value={credential.id}>
                {getCredentialDisplayName(credential)}
              </option>
            ))}
          </SelectField>
          {azure.isError && !azure.data ? <LoadErrorNotice what="Azure DevOps organizations" error={azure.error} onRetry={() => void azure.refetch()} isRetrying={azure.isFetching} /> : null}
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
          Daily target (hours)
          <Input type="number" min={0.5} max={24} step={0.5} value={target} onChange={(event) => setTarget(event.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
          Flag a timer after (hours)
          <Input type="number" min={1} max={48} step={1} value={alert} onChange={(event) => setAlert(event.target.value)} />
        </label>
        <Button size="sm" variant="secondary" disabled={update.isPending || !targetsChanged} onClick={() => update.mutate({ dailyTargetHours: Number(target), timerAlertHours: Number(alert) })}>
          Save targets
        </Button>
      </div>

      {update.error ? (
        <p role="alert" className="text-sm text-rose-600">
          {errorText(update.error, "That change could not be saved.")}
        </p>
      ) : null}

      {connection.organizationId ? (
        <div>
          <Link to={`/time/${encodeURIComponent(connection.credentialId)}`} className={buttonClassName({ size: "sm" })}>
            Open Time
            <ArrowRightIcon />
          </Link>
        </div>
      ) : null}
    </CredentialCardFrame>
  );
}

/** Credentials page section: each user's own Solidtime connection(s). New ones are added from the Add credential page. */
export function SolidtimeConnectionsSection({ onNotice }: { onNotice: (notice: CredentialsNotice) => void }) {
  const connections = useSolidtimeConnections();

  return (
    <section aria-labelledby="solidtime-title" className="flex flex-col gap-4">
      <div>
        <h2 id="solidtime-title" className="text-xl font-semibold tracking-tight text-slate-950">
          Solidtime
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Optional. Connect your Solidtime account to track time on tickets and see time next to your work. Every change to Solidtime is
          proposed first and runs only after you approve it.
        </p>
      </div>

      {connections.error && connections.data ? <StaleDataBanner error={connections.error} onRetry={() => void connections.refetch()} isRetrying={connections.isFetching} /> : null}

      {connections.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Spinner className="size-4" /> Loading…
        </p>
      ) : !connections.data ? (
        // Unknown is not "none": a failed load never says no account is connected.
        <ErrorCard error={connections.error} onRetry={() => void connections.refetch()} isRetrying={connections.isFetching} />
      ) : connections.data.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-surface px-4 py-6 text-center text-sm text-slate-600">
          No Solidtime account connected.{" "}
          <Link to="/credentials/new?platform=solidtime" className="font-medium text-indigo-700 hover:underline">
            Add one
          </Link>
        </p>
      ) : (
        <div className="space-y-3">
          {connections.data.map((connection) => (
            <ConnectionCard key={connection.credentialId} connection={connection} onNotice={onNotice} />
          ))}
        </div>
      )}
    </section>
  );
}
