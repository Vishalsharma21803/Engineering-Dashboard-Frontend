import type { AiModelOption, AiProvider } from "../types/ai.types";

export const PROVIDER_INFO: Record<
  AiProvider,
  { name: string; description: string; keyPrefix: string; keyUrl: string; keyHelp: string }
> = {
  CLAUDE: {
    name: "Claude (Anthropic)",
    description: "Direct Claude API. Best quality and reliable JSON verdicts for SOP checks.",
    keyPrefix: "sk-ant-",
    keyUrl: "https://console.anthropic.com/settings/keys",
    keyHelp: "Create a key in the Anthropic Console and set a spend limit there.",
  },
  OPENROUTER: {
    name: "OpenRouter",
    description: "Many models from many vendors, including free ones such as DeepSeek.",
    keyPrefix: "sk-or-",
    keyUrl: "https://openrouter.ai/settings/keys",
    keyHelp: "Create a key in OpenRouter. Free models allow a limited number of requests per day.",
  },
  OPENCODE: {
    name: "OpenCode",
    description: "OpenCode's pay-as-you-go gateway: DeepSeek, GLM, Kimi, MiniMax, Qwen and its free models.",
    keyPrefix: "",
    keyUrl: "https://opencode.ai/auth",
    keyHelp:
      "Create a key at opencode.ai. Checking the key is free. OpenCode may allow its free models only inside its own app; paid models need credit in your OpenCode account.",
  },
};

/** Short provider names for status lines ("OpenRouter said: …"). */
export const PROVIDER_SHORT_NAMES: Record<AiProvider, string> = {
  CLAUDE: "Claude",
  OPENROUTER: "OpenRouter",
  OPENCODE: "OpenCode",
};

export function providerShortName(provider: string | null | undefined, fallback: string): string {
  return (provider && PROVIDER_SHORT_NAMES[provider as AiProvider]) || fallback;
}

export function formatPrice(model: AiModelOption): string {
  if (model.free) {
    return "Free";
  }

  const format = (value: number) => (value < 1 ? `$${value.toFixed(2)}` : `$${value.toFixed(value % 1 === 0 ? 0 : 2)}`);
  return `${format(model.inputPerMTok)} in / ${format(model.outputPerMTok)} out per 1M tokens`;
}

export function formatUsd(value: number): string {
  return value < 0.01 && value > 0 ? "<$0.01" : `$${value.toFixed(2)}`;
}
