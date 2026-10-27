import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { buttonClassName } from "@/components/ui/button-styles";
import { Card } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { StatusBadge } from "@/features/azure-devops/components/status-badge";
import { formatRelative } from "@/features/azure-devops/utils/format";
import { deleteCredential } from "@/features/credentials/api/credential.api";
import { useCredentials } from "@/features/credentials/hooks/use-credentials";
import { getCredentialDisplayName } from "@/features/credentials/utils/credential-display";
import { ApiError } from "@/lib/api-client";
import { createConnection, listMemberships, updateConnection, validateConnection, type ConnectionChange } from "../api/solidtime.api";
import { solidtimeKeys } from "../api/solidtime.keys";
import { useSolidtimeConnections } from "../hooks/use-solidtime";
import type { SolidtimeConnection } from "../types/solidtime.types";

const SELECT = "h-9 rounded-lg border border-slate-300 bg-surface px-2.5 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20";

function errorText(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const field = error.errors?.[0];
    return field ? `${error.message}: ${field.message}` : error.message;
  }

  return fallback;
}

function AddConnection({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const [baseUrl, setBaseUrl] = useState("");
  const [token, setToken] = useState("");
  const [label, setLabel] = useState("");
  const create = useMutation({
    mutationFn: () => createConnection({ baseUrl: baseUrl.trim(), token: token.trim(), ...(label.trim() ? { label: label.trim() } : {}) }),
    onSuccess: async () => {
      setToken("");
      await queryClient.invalidateQueries({ queryKey: solidtimeKeys.all });
      onDone();
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    create.mutate();
  }

  return (
    <Card className="p-5">
      <form onSubmit={submit} aria-label="Connect Solidtime" className="flex flex-col gap-3">
        <FormField id="solidtime-url" label="Solidtime address" hint="Your Solidtime server, e.g. https://time.example.com (or https://app.solidtime.io).">
          <Input id="solidtime-url" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://" required />
        </FormField>
        <FormField id="solidtime-token" label="API token" hint="Profile settings → Create API token in Solidtime. Stored encrypted; never shown again.">
          <Input id="solidtime-token" type="password" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} required />
        </FormField>
        <FormField id="solidtime-label" label="Label (optional)">
          <Input id="solidtime-label" value={label} onChange={(event) => setLabel(event.target.value)} />
        </FormField>
        {create.error ? (
          <p role="alert" className="text-sm text-rose-600">
            {errorText(create.error, "Could not connect to Solidtime.")}
          </p>
        ) : null}
        <div className="flex gap-2">
          <Button type="submit" disabled={create.isPending || !baseUrl.trim() || !token.trim()}>
            {create.isPending ? <Spinner className="size-4" /> : null}
            Connect
          </Button>
          <Button type="button" variant="secondary" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}

function ConnectionCard({ connection }: { connection: SolidtimeConnection }) {
  const queryClient = useQueryClient();
  const azure = useCredentials();
  const [target, setTarget] = useState(String(connection.dailyTargetHours));
  const [alert, setAlert] = useState(String(connection.timerAlertHours));
  const [newToken, setNewToken] = useState("");
  const [replacing, setReplacing] = useState(false);
  const memberships = useQuery({
    queryKey: solidtimeKeys.memberships(connection.credentialId),
    queryFn: () => listMemberships(connection.credentialId),
    enabled: connection.organizationId === null,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: solidtimeKeys.all });
  const update = useMutation({ mutationFn: (change: ConnectionChange) => updateConnection(connection.credentialId, change), onSuccess: refresh });
  const check = useMutation({ mutationFn: () => validateConnection(connection.credentialId), onSuccess: refresh });
  const remove = useMutation({ mutationFn: () => deleteCredential(connection.credentialId), onSuccess: refresh });
  const error = update.error ?? check.error ?? remove.error;
  const name = connection.label ?? connection.baseUrl.replace(/^https?:\/\//, "");

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-slate-950">{name}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {connection.organizationName ?? "No organization chosen"}
            {connection.role ? ` · ${connection.role}` : ""}
            {connection.lastValidatedAt ? ` · checked ${formatRelative(connection.lastValidatedAt)}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {connection.lastValidationStatus === "INVALID" ? <StatusBadge tone="danger">Token invalid</StatusBadge> : connection.lastValidationStatus === "VALID" ? <StatusBadge tone="success">Valid</StatusBadge> : null}
          {connection.canViewTeam ? <StatusBadge tone="info">Sees team time</StatusBadge> : <StatusBadge tone="neutral">Own time only</StatusBadge>}
        </div>
      </div>

      {connection.organizationId === null ? (
        <label className="flex max-w-sm flex-col gap-1 text-sm text-slate-700">
          Solidtime organization
          <select className={SELECT} defaultValue="" onChange={(event) => event.target.value && update.mutate({ organizationId: event.target.value })}>
            <option value="" disabled>
              {memberships.isLoading ? "Loading…" : "Choose an organization"}
            </option>
            {(memberships.data ?? []).map((membership) => (
              <option key={membership.organization.id} value={membership.organization.id}>
                {membership.organization.name} ({membership.role})
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
        <label className="flex flex-col gap-1 text-sm text-slate-700">
          Azure DevOps organization
          <select
            className={SELECT}
            aria-label={`Azure organization for ${name}`}
            value={connection.azureCredentialId ?? ""}
            onChange={(event) => update.mutate({ azureCredentialId: event.target.value || null })}
          >
            <option value="">Not linked</option>
            {(azure.data ?? []).map((credential) => (
              <option key={credential.id} value={credential.id}>
                {getCredentialDisplayName(credential)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-700">
          Daily target (hours)
          <Input type="number" min={0.5} max={24} step={0.5} value={target} onChange={(event) => setTarget(event.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-700">
          Flag a timer after (hours)
          <Input type="number" min={1} max={48} step={1} value={alert} onChange={(event) => setAlert(event.target.value)} />
        </label>
        <Button
          size="sm"
          variant="secondary"
          disabled={update.isPending || (Number(target) === connection.dailyTargetHours && Number(alert) === connection.timerAlertHours)}
          onClick={() => update.mutate({ dailyTargetHours: Number(target), timerAlertHours: Number(alert) })}
        >
          Save targets
        </Button>
      </div>

      {replacing ? (
        <form
          className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3"
          aria-label={`Replace the API token for ${name}`}
          onSubmit={(event) => {
            event.preventDefault();
            update.mutate({ token: newToken.trim() }, { onSuccess: () => { setNewToken(""); setReplacing(false); } });
          }}
        >
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm text-slate-700">
            New API token
            <Input type="password" autoComplete="off" className="h-9" value={newToken} onChange={(event) => setNewToken(event.target.value)} />
          </label>
          <Button size="sm" type="submit" disabled={update.isPending || newToken.trim().length < 20}>
            Save new token
          </Button>
          <Button size="sm" variant="secondary" onClick={() => { setReplacing(false); setNewToken(""); }}>
            Cancel
          </Button>
        </form>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-rose-600">
          {errorText(error, "That change could not be saved.")}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
        {connection.organizationId ? (
          <Link to={`/time/${encodeURIComponent(connection.credentialId)}`} className={buttonClassName({ size: "sm" })}>
            Open Time
          </Link>
        ) : null}
        <Button size="sm" variant="secondary" disabled={check.isPending} onClick={() => check.mutate()}>
          {check.isPending ? <Spinner className="size-4" /> : null}
          Check token
        </Button>
        {!replacing ? (
          <Button size="sm" variant="secondary" onClick={() => setReplacing(true)}>
            Replace token…
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="secondary"
          className="text-rose-700 hover:bg-rose-50 sm:ml-auto"
          disabled={remove.isPending}
          onClick={() => {
            if (window.confirm(`Disconnect ${name}? Your time in Solidtime is not affected.`)) {
              remove.mutate();
            }
          }}
        >
          Disconnect
        </Button>
      </div>
    </Card>
  );
}

/** Credentials page section: each user's own Solidtime connection(s). */
export function SolidtimeConnectionsSection() {
  const connections = useSolidtimeConnections();
  const [adding, setAdding] = useState(false);

  return (
    <section aria-labelledby="solidtime-title" className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="solidtime-title" className="text-xl font-semibold tracking-tight text-slate-950">
            Solidtime
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Optional. Connect your Solidtime account to track time on tickets and see time next to your work. Every change to Solidtime
            is proposed first and runs only after you approve it.
          </p>
        </div>
        {!adding ? (
          <Button size="sm" onClick={() => setAdding(true)}>
            {(connections.data ?? []).length > 0 ? "Connect another" : "Connect Solidtime"}
          </Button>
        ) : null}
      </div>

      {adding ? <AddConnection onDone={() => setAdding(false)} /> : null}

      {connections.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Spinner className="size-4" /> Loading…
        </p>
      ) : (connections.data ?? []).length === 0 && !adding ? (
        <p className="text-sm text-slate-500">No Solidtime connection yet.</p>
      ) : (
        (connections.data ?? []).map((connection) => <ConnectionCard key={connection.credentialId} connection={connection} />)
      )}
    </section>
  );
}
