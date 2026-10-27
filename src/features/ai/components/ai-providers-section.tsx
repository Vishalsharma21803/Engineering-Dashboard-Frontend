import { useState } from "react";

import { Button } from "@/components/ui/button";
import { SkeletonRows } from "@/features/azure-devops/components/feedback";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useAiCredentials } from "../hooks/use-ai";
import type { AiProvider } from "../types/ai.types";
import type { AiNotice } from "../utils/ai-validation";
import { AddAiProviderForm } from "./add-ai-provider-form";
import { AiProviderCard } from "./ai-provider-card";
import { AiSettingsCard } from "./ai-settings-card";
import { OpenRouterAllowlistCard } from "./openrouter-allowlist-card";

const PROVIDER_COUNT = 3;

/** Credentials page section: each user's own AI keys (added from one place), model choice and spend guard. */
export function AiProvidersSection() {
  const { user } = useAuth();
  const credentials = useAiCredentials();
  const [adding, setAdding] = useState(false);
  /** The check result of the key just added, shown on its card. */
  const [justAdded, setJustAdded] = useState<{ provider: AiProvider; notice: AiNotice } | null>(null);
  const saved = credentials.data ?? [];
  const existing = new Set(saved.map((credential) => credential.provider));
  const allAdded = existing.size >= PROVIDER_COUNT;

  return (
    <section aria-labelledby="ai-providers-title" className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="ai-providers-title" className="text-xl font-semibold tracking-tight text-slate-950">
            AI providers
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Optional. Add your own Claude, OpenRouter and/or OpenCode key to enable AI SOP checks and suggested fixes. Without a key, only the
            rule-based checks run.
          </p>
        </div>
        {!adding ? (
          <Button size="sm" variant="secondary" disabled={allAdded || credentials.isLoading} title={allAdded ? "Every provider already has a key" : undefined} onClick={() => setAdding(true)}>
            + Add AI provider
          </Button>
        ) : null}
      </div>

      {adding ? (
        <AddAiProviderForm
          existing={existing}
          onCancel={() => setAdding(false)}
          onDone={(provider, notice) => {
            setJustAdded({ provider, notice });
            setAdding(false);
          }}
        />
      ) : null}

      {credentials.isLoading ? (
        <SkeletonRows rows={2} />
      ) : saved.length === 0 ? (
        !adding ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-surface px-4 py-6 text-center text-sm text-slate-600">
            No AI provider yet. Use “Add AI provider” to add a key.
          </p>
        ) : null
      ) : (
        <div className="space-y-3">
          {saved.map((credential) => (
            <AiProviderCard
              // A new key gets a fresh card, so the check result just shown belongs to it.
              key={`${credential.id}:${justAdded?.provider === credential.provider ? "new" : ""}`}
              credential={credential}
              initialNotice={justAdded?.provider === credential.provider ? justAdded.notice : null}
            />
          ))}
        </div>
      )}

      <AiSettingsCard />

      {user?.isSopAdmin ? <OpenRouterAllowlistCard /> : null}
    </section>
  );
}
