import { useState } from "react";

import { Card } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Spinner } from "@/components/ui/spinner";
import { ErrorCard, StaleDataBanner } from "@/features/azure-devops/components/feedback";
import { usePlatforms } from "@/features/credentials/api/platform.api";
import { PlatformForm } from "@/features/credentials/components/platform-form";
import { useValidateAiCredential } from "../hooks/use-ai";
import type { AiProvider } from "../types/ai.types";
import { describeAiError } from "../utils/ai-errors";
import { validationNotice, type AiNotice } from "../utils/ai-validation";

const SELECT = "h-10 w-full rounded-lg border border-slate-300 bg-surface px-3 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20";

/**
 * The one place to add an AI provider key. Providers and their fields come from
 * the backend's platform registry (category "ai"); one key per provider. The
 * key is saved, then checked right away.
 */
export function AddAiProviderForm({ existing, onDone, onCancel }: { existing: Set<AiProvider>; onDone: (provider: AiProvider, notice: AiNotice) => void; onCancel: () => void }) {
  const platforms = usePlatforms();
  const providers = (platforms.data ?? []).filter((platform) => platform.category === "ai" && platform.aiProvider);
  const [chosen, setChosen] = useState<string | null>(null);
  /** From Save until the key is checked: the saved key makes its provider "already added", but the form must stay on it. */
  const [saving, setSaving] = useState(false);
  const validate = useValidateAiCredential();
  const firstFree = providers.find((platform) => !existing.has(platform.aiProvider!));
  const platform = providers.find((candidate) => candidate.id === chosen) ?? firstFree ?? providers[0];

  return (
    <Card className="p-5" role="region" aria-labelledby="add-ai-provider-title">
      <div className="mb-5">
        <h3 id="add-ai-provider-title" className="text-base font-semibold text-slate-950">
          Add AI provider
        </h3>
        <p className="mt-0.5 text-sm text-slate-600">One key per provider. It is encrypted on the server and never shown again.</p>
      </div>

      {platforms.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Spinner className="size-4" /> Loading providers…
        </p>
      ) : !platforms.data || !platform ? (
        <ErrorCard error={platforms.error} onRetry={() => void platforms.refetch()} />
      ) : (
        <div className="space-y-6">
          {/* A failed background refresh keeps the form (and the typed key) on screen. */}
          {platforms.error ? <StaleDataBanner error={platforms.error} onRetry={() => void platforms.refetch()} isRetrying={platforms.isFetching} /> : null}
          <FormField id="new-ai-provider" label="Provider" hint={platform.description}>
            <select id="new-ai-provider" className={SELECT} value={platform.id} disabled={saving || validate.isPending} onChange={(event) => setChosen(event.target.value)}>
              {providers.map((option) => (
                <option key={option.id} value={option.id} disabled={existing.has(option.aiProvider!)}>
                  {option.label}
                  {existing.has(option.aiProvider!) ? " (already added)" : ""}
                </option>
              ))}
            </select>
          </FormField>

          {existing.has(platform.aiProvider!) && !saving ? (
            <p className="text-sm text-slate-600">You already have a {platform.label} key. Replace it from its card below.</p>
          ) : (
            <PlatformForm
              key={platform.id}
              platform={platform}
              submitLabel="Save & validate"
              busyLabel={validate.isPending ? "Checking the key…" : null}
              onCancel={onCancel}
              onSubmitting={(submitting) => {
                setSaving(submitting);
                if (submitting) setChosen(platform.id);
              }}
              onSaved={(result) => {
                const provider = platform.aiProvider!;
                validate.mutate(result.id, {
                  onSuccess: (check) => onDone(provider, validationNotice(provider, check)),
                  onError: (error) => onDone(provider, { tone: "error", text: describeAiError(error, "The key was saved but could not be checked.") }),
                });
              }}
            />
          )}
        </div>
      )}
    </Card>
  );
}
