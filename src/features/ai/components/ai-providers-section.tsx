import { useAuth } from "@/features/auth/hooks/use-auth";
import { useAiCredentials } from "../hooks/use-ai";
import { AiProviderCard } from "./ai-provider-card";
import { AiSettingsCard } from "./ai-settings-card";
import { OpenRouterAllowlistCard } from "./openrouter-allowlist-card";

/** Credentials page section: each user's own AI keys, model choice and spend guard. */
export function AiProvidersSection() {
  const { user } = useAuth();
  const credentials = useAiCredentials();
  const byProvider = new Map((credentials.data ?? []).map((credential) => [credential.provider, credential]));

  return (
    <section aria-labelledby="ai-providers-title" className="flex flex-col gap-4">
      <div>
        <h2 id="ai-providers-title" className="text-xl font-semibold tracking-tight text-slate-950">
          AI providers
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Optional. Add your own Claude, OpenRouter and/or OpenCode key to enable AI SOP checks and suggested fixes. Without a key,
          only the rule-based checks run.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <AiProviderCard provider="CLAUDE" credential={byProvider.get("CLAUDE")} />
        <AiProviderCard provider="OPENROUTER" credential={byProvider.get("OPENROUTER")} />
        <AiProviderCard provider="OPENCODE" credential={byProvider.get("OPENCODE")} />
      </div>

      <AiSettingsCard />

      {user?.isSopAdmin ? <OpenRouterAllowlistCard /> : null}
    </section>
  );
}
