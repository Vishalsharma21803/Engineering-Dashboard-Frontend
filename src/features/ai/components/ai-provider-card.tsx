import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Spinner } from "@/components/ui/spinner";
import { CredentialCardFrame } from "@/features/credentials/components/credential-card-frame";
import { EditIcon, ShieldIcon, TrashIcon } from "@/features/credentials/components/credential-icons";
import { useDeleteAiCredential, useReplaceAiKey, useValidateAiCredential } from "../hooks/use-ai";
import type { AiCredential } from "../types/ai.types";
import { PROVIDER_INFO, providerShortName } from "../utils/ai-display";
import { describeAiError } from "../utils/ai-errors";
import { validationNotice, type AiNotice } from "../utils/ai-validation";

interface AiProviderCardProps {
  credential: AiCredential;
  /** What the check right after adding the key found (shown until the next action). */
  initialNotice?: AiNotice | null;
}

/** One saved provider key, in the same card as the other credentials: check it, replace it or delete it. The key is never shown again. */
export function AiProviderCard({ credential, initialNotice = null }: AiProviderCardProps) {
  const provider = credential.provider;
  const info = PROVIDER_INFO[provider];
  const [editing, setEditing] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [notice, setNotice] = useState<AiNotice | null>(initialNotice);
  const replace = useReplaceAiKey();
  const validate = useValidateAiCredential();
  const remove = useDeleteAiCredential();
  const busy = replace.isPending || validate.isPending || remove.isPending;

  function runValidation(id: string) {
    validate.mutate(id, {
      onSuccess: (result) => setNotice(validationNotice(provider, result)),
      onError: (error) => setNotice({ tone: "error", text: describeAiError(error, "Validation failed.") }),
    });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    replace.mutate(
      { id: credential.id, apiKey: apiKey.trim() },
      {
        onSuccess: (saved) => {
          setApiKey("");
          setEditing(false);
          runValidation(saved.id);
        },
        onError: (error) => setNotice({ tone: "error", text: describeAiError(error, "Could not save the key.") }),
      }
    );
  }

  return (
    <CredentialCardFrame
      platform={{ label: "AI provider", tone: "violet" }}
      status={credential.lastValidationStatus}
      title={credential.label ? `${info.name} · ${credential.label}` : info.name}
      subtitle={`Key ending …${credential.keyHint}`}
      lastValidatedAt={credential.lastValidatedAt}
      validatedWith={providerShortName(provider, info.name)}
      notice={notice ? { tone: notice.tone, message: notice.text } : null}
      onDismissNotice={() => setNotice(null)}
      actions={
        <>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => runValidation(credential.id)} aria-label={`Validate ${info.name}`}>
            {validate.isPending ? <Spinner className="size-3.5" /> : <ShieldIcon />}
            {validate.isPending ? "Validating..." : "Validate"}
          </Button>
          <Button size="sm" variant="secondary" disabled={busy || editing} onClick={() => { setEditing(true); setNotice(null); }}>
            <EditIcon />
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
            {remove.isPending ? <Spinner className="size-3.5" /> : <TrashIcon />}
            Delete
          </Button>
        </>
      }
    >
      {editing ? (
        <form onSubmit={submit} className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3" aria-label={`Replace the ${info.name} key`}>
          <Label htmlFor={`ai-key-${provider}`}>New API key</Label>
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1">
              <PasswordInput
                id={`ai-key-${provider}`}
                autoComplete="off"
                placeholder={info.keyPrefix ? `${info.keyPrefix}…` : "Paste your API key"}
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
              />
            </div>
            <Button type="submit" size="sm" disabled={busy || apiKey.trim().length < 20}>
              {replace.isPending ? <Spinner className="size-4" /> : null}
              Save & validate
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => { setEditing(false); setApiKey(""); }}>
              Cancel
            </Button>
          </div>
          {apiKey.trim() !== "" && apiKey.trim().length < 20 ? <p className="text-xs text-slate-500">API keys are at least 20 characters.</p> : null}
        </form>
      ) : null}
    </CredentialCardFrame>
  );
}
