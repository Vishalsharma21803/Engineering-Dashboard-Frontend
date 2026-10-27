import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Spinner } from "@/components/ui/spinner";
import { CredentialStatusBadge } from "@/features/credentials/components/credential-status-badge";
import { formatDateTime } from "@/features/credentials/utils/credential-display";
import {
  useCreateAiCredential,
  useDeleteAiCredential,
  useReplaceAiKey,
  useValidateAiCredential,
} from "../hooks/use-ai";
import type { AiCredential, AiProvider } from "../types/ai.types";
import { PROVIDER_INFO } from "../utils/ai-display";
import { describeAiError, describeValidationFailure } from "../utils/ai-errors";

interface AiProviderCardProps {
  provider: AiProvider;
  credential: AiCredential | undefined;
}

type Notice = { tone: "success" | "error"; text: string };

/** Add, validate, replace or delete one provider's key. The key is never shown again after saving. */
export function AiProviderCard({ provider, credential }: AiProviderCardProps) {
  const info = PROVIDER_INFO[provider];
  const [editing, setEditing] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const create = useCreateAiCredential();
  const replace = useReplaceAiKey();
  const validate = useValidateAiCredential();
  const remove = useDeleteAiCredential();
  const busy = create.isPending || replace.isPending || validate.isPending || remove.isPending;
  const showForm = !credential || editing;

  function runValidation(id: string) {
    validate.mutate(id, {
      onSuccess: (result) =>
        setNotice(
          result.valid
            ? {
                tone: "success",
                text:
                  provider === "CLAUDE"
                    ? `Key works. Models available: ${String(result.details.modelsAvailable || "none of Cockpit's models")}.`
                    : provider === "OPENCODE"
                      ? `Key works. ${
                          result.details.freeModelsUsable === true
                            ? "Free models can be used from Cockpit."
                            : result.details.freeModelsUsable === false
                              ? "OpenCode allows its free models only inside the OpenCode app, so choose a paid OpenCode model (needs credit)."
                              : "Could not tell whether free models work from Cockpit."
                        }`
                      : `Key works.${
                        result.details.freeRequestsDailyLimit
                          ? ` Free-model requests today: ${String(result.details.freeRequestsToday ?? 0)} of ${String(result.details.freeRequestsDailyLimit)}.`
                          : ""
                      }`,
              }
            : { tone: "error", text: describeValidationFailure(result.reason) }
        ),
      onError: (error) => setNotice({ tone: "error", text: describeAiError(error, "Validation failed.") }),
    });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    const trimmed = apiKey.trim();

    const onSaved = (saved: AiCredential) => {
      setApiKey("");
      setEditing(false);
      runValidation(saved.id);
    };
    const onError = (error: unknown) => setNotice({ tone: "error", text: describeAiError(error, "Could not save the key.") });

    if (credential) {
      replace.mutate({ id: credential.id, apiKey: trimmed }, { onSuccess: onSaved, onError });
    } else {
      create.mutate({ provider, apiKey: trimmed }, { onSuccess: onSaved, onError });
    }
  }

  return (
    <Card className="flex h-full flex-col p-5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold text-slate-950">{info.name}</h3>
          {credential ? <CredentialStatusBadge status={credential.lastValidationStatus} /> : null}
        </div>
        <p className="mt-1 text-sm text-slate-600">{info.description}</p>
        {credential ? (
          <p className="mt-2 text-xs text-slate-500">
            Key ending <span className="font-mono font-semibold text-slate-700">…{credential.keyHint}</span>
            {credential.lastValidatedAt ? ` · validated ${formatDateTime(credential.lastValidatedAt)}` : " · not validated yet"}
          </p>
        ) : null}
      </div>

      {credential && !editing ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => runValidation(credential.id)}>
            {validate.isPending ? <Spinner className="size-3.5" /> : null}
            Validate
          </Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => { setEditing(true); setNotice(null); }}>
            Replace key
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="text-rose-700 hover:bg-rose-50 hover:text-rose-700"
            disabled={busy}
            onClick={() => {
              if (window.confirm(`Delete your ${info.name} key? AI checks using it will stop.`)) {
                remove.mutate(credential.id, {
                  onError: (error) => setNotice({ tone: "error", text: describeAiError(error, "Could not delete the key.") }),
                });
              }
            }}
          >
            Delete
          </Button>
        </div>
      ) : null}

      {showForm ? (
        <form onSubmit={submit} className="mt-4 space-y-2">
          <Label htmlFor={`ai-key-${provider}`}>{credential ? "New API key" : "API key"}</Label>
          <div className="flex flex-col gap-2">
            <div className="min-w-0">
              <PasswordInput
                id={`ai-key-${provider}`}
                autoComplete="off"
                placeholder={info.keyPrefix ? `${info.keyPrefix}…` : "Paste your API key"}
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={busy || apiKey.trim().length < 20}>
                {create.isPending || replace.isPending ? <Spinner className="size-4" /> : null}
                Save & validate
              </Button>
              {credential ? (
                <Button type="button" variant="ghost" onClick={() => { setEditing(false); setApiKey(""); }}>
                  Cancel
                </Button>
              ) : null}
            </div>
          </div>
          <p className="text-xs text-slate-500">
            {info.keyHelp}{" "}
            <a href={info.keyUrl} target="_blank" rel="noreferrer" className="font-medium text-indigo-600 hover:text-indigo-500">
              Get a key ↗
            </a>{" "}
            The key is encrypted on the server and never shown again.
          </p>
        </form>
      ) : null}

      {notice ? (
        <p
          role={notice.tone === "error" ? "alert" : "status"}
          className={
            notice.tone === "error"
              ? "mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
              : "mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
          }
        >
          {notice.text}
        </p>
      ) : null}
    </Card>
  );
}
