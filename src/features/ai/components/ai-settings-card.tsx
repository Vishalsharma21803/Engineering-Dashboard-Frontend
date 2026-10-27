import { useMemo, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/utils/cn";
import { useAiCredentials, useAiModels, useAiPreference, useAiUsage, useUpdateAiPreference } from "../hooks/use-ai";
import type { AiEffort, AiPreference, AiProvider } from "../types/ai.types";
import { PROVIDER_INFO, formatPrice, formatUsd } from "../utils/ai-display";
import { describeAiError } from "../utils/ai-errors";
import { formatDateTime } from "@/features/credentials/utils/credential-display";

const EFFORT_LABELS: Record<AiEffort, { label: string; hint: string }> = {
  LOW: { label: "Low", hint: "Fastest and cheapest" },
  MEDIUM: { label: "Medium", hint: "Balanced (recommended)" },
  HIGH: { label: "High", hint: "Most thorough, costs more" },
};

const selectClassName =
  "block h-10 w-full rounded-lg border border-slate-300 bg-surface px-3 text-sm text-slate-950 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-50";

/** Which provider, model and effort AI checks use, plus the daily spend guard. */
export function AiSettingsCard() {
  const credentials = useAiCredentials();
  const preference = useAiPreference();

  if (preference.isLoading || credentials.isLoading || !preference.data) {
    return (
      <Card className="flex items-center gap-2 p-5 text-sm text-slate-500">
        <Spinner className="size-4" /> Loading AI settings…
      </Card>
    );
  }

  // Re-mount the form whenever the saved settings change so it starts from them.
  return <AiSettingsForm key={preference.data.updatedAt ?? "unsaved"} initial={preference.data} />;
}

function AiSettingsForm({ initial }: { initial: AiPreference }) {
  const credentials = useAiCredentials();
  const usage = useAiUsage();
  const save = useUpdateAiPreference();

  const [provider, setProvider] = useState<AiProvider | null>(initial.provider);
  const [model, setModel] = useState<string | null>(initial.model);
  const [effort, setEffort] = useState<AiEffort>(initial.effort);
  const [limit, setLimit] = useState(String(initial.dailyLimitUsd));
  const [accepted, setAccepted] = useState(initial.dataCollectionAcceptedAt !== null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const models = useAiModels(provider);

  const providersWithKeys = (credentials.data ?? []).map((credential) => credential.provider);
  const selectedModel = useMemo(
    () => (models.data ?? []).find((option) => option.id === model) ?? null,
    [models.data, model]
  );
  const efforts = selectedModel?.efforts ?? [];
  const limitValue = limit.trim() === "" ? Number.NaN : Number(limit);
  const needsConsent = selectedModel?.mayCollectData ?? false;
  const valid =
    Number.isFinite(limitValue) &&
    limitValue >= 0 &&
    limitValue <= 100 &&
    (provider === null || (selectedModel !== null && (!needsConsent || accepted)));

  // Exactly what Save would send, so "changed" means a real difference from the saved settings.
  const next = {
    provider,
    model: provider === null ? null : model,
    effort: efforts.length === 0 || efforts.includes(effort) ? effort : (efforts[0] ?? "MEDIUM"),
    dailyLimitUsd: limitValue,
    acceptDataCollection: accepted,
  };
  const changed =
    next.provider !== initial.provider ||
    next.model !== (initial.provider === null ? null : initial.model) ||
    next.effort !== initial.effort ||
    next.dailyLimitUsd !== initial.dailyLimitUsd ||
    next.acceptDataCollection !== (initial.dataCollectionAcceptedAt !== null);
  const canSave = !save.isPending && valid && changed;

  function submit(event: FormEvent) {
    event.preventDefault();

    if (!canSave) {
      return;
    }

    setMessage(null);
    save.mutate(
      next,
      {
        // The saved settings re-mount this form; nothing else to do on success.
        onSuccess: () => undefined,
        onError: (error) => setMessage({ tone: "error", text: describeAiError(error, "Could not save AI settings.") }),
      }
    );
  }

  return (
    <Card className="p-5">
      <h3 className="text-base font-semibold text-slate-950">AI settings</h3>
      <p className="mt-1 text-sm text-slate-600">
        Used for AI checks and suggested fixes. Your own key pays for your checks; results are private to you.
      </p>

      <form onSubmit={submit} className="mt-4 space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ai-provider">Provider</Label>
            <select
              id="ai-provider"
              className={selectClassName}
              value={provider ?? ""}
              onChange={(event) => {
                const next = (event.target.value || null) as AiProvider | null;
                setProvider(next);
                setModel(null);
              }}
            >
              <option value="">AI checks off</option>
              {(["CLAUDE", "OPENROUTER", "OPENCODE"] as const).map((option) => (
                <option key={option} value={option} disabled={!providersWithKeys.includes(option)}>
                  {PROVIDER_INFO[option].name}
                  {providersWithKeys.includes(option) ? "" : " (add a key first)"}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ai-model">Model</Label>
            <select
              id="ai-model"
              className={selectClassName}
              value={model ?? ""}
              disabled={provider === null || models.isLoading}
              onChange={(event) => setModel(event.target.value || null)}
            >
              <option value="">{models.isLoading ? "Loading models…" : "Choose a model"}</option>
              {(models.data ?? []).map((option) => (
                <option key={option.id} value={option.id}>
                  {option.free ? "FREE · " : ""}
                  {option.label} — {formatPrice(option)}
                </option>
              ))}
            </select>
            {models.isError ? (
              <p className="text-xs text-rose-600">{describeAiError(models.error, "Could not load models.")}</p>
            ) : selectedModel?.description ? (
              <p className="text-xs text-slate-500">{selectedModel.description}</p>
            ) : null}
          </div>
        </div>

        {provider !== null && selectedModel ? (
          <fieldset>
            <legend className="text-sm font-medium text-slate-700">Effort</legend>
            {efforts.length === 0 ? (
              <p className="mt-1 text-xs text-slate-500">This model doesn't offer an effort setting.</p>
            ) : (
              <div role="radiogroup" className="mt-1.5 grid gap-2 sm:grid-cols-3">
                {efforts.map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={effort === option}
                    onClick={() => setEffort(option)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left transition",
                      effort === option
                        ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-500/20"
                        : "border-slate-200 bg-surface hover:border-slate-300"
                    )}
                  >
                    <span className="block text-sm font-semibold text-slate-900">{EFFORT_LABELS[option].label}</span>
                    <span className="block text-xs text-slate-500">{EFFORT_LABELS[option].hint}</span>
                  </button>
                ))}
              </div>
            )}
          </fieldset>
        ) : null}

        {needsConsent ? (
          <label className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <input
              type="checkbox"
              className="mt-0.5 size-4 shrink-0"
              checked={accepted}
              onChange={(event) => setAccepted(event.target.checked)}
            />
            <span>
              <strong>Data notice:</strong> free models are served by providers that may store or train on what they
              receive. Ticket titles, descriptions and comments would be sent to them. I confirm this is allowed for
              my projects.
            </span>
          </label>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ai-limit">Daily spend limit (USD)</Label>
            <Input
              id="ai-limit"
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={limit}
              onChange={(event) => setLimit(event.target.value)}
            />
            <p className="text-xs text-slate-500">Automatic checks pause once today's spend reaches this. 0 = only free models.</p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Usage</p>
            {usage.data ? (
              <p className="mt-1 text-slate-800">
                Today <strong>{formatUsd(usage.data.todayUsd)}</strong> ({usage.data.callsToday} calls) · This month{" "}
                <strong>{formatUsd(usage.data.monthUsd)}</strong>
                <span className="block text-xs text-slate-500">Daily total resets at 00:00 UTC.</span>
              </p>
            ) : (
              <p className="mt-1 text-slate-500">—</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={!canSave}>
            {save.isPending ? <Spinner className="size-4" /> : null}
            Save AI settings
          </Button>
          {!message && changed && !save.isPending ? (
            <span className="text-xs text-amber-700">
              {valid ? "Unsaved changes" : "Unsaved changes: choose a model, accept the data notice if shown, and use a limit from 0 to 100"}
            </span>
          ) : null}
          {!message && !changed && initial.updatedAt ? (
            <span className="text-xs text-slate-500">Saved {formatDateTime(initial.updatedAt)}</span>
          ) : null}
          {message ? (
            <span role={message.tone === "error" ? "alert" : "status"} className={message.tone === "error" ? "text-sm text-rose-600" : "text-sm text-emerald-700"}>
              {message.text}
            </span>
          ) : null}
        </div>
      </form>
    </Card>
  );
}
