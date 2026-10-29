import { useMemo, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { SelectField } from "@/components/ui/select-field";
import { Checkbox } from "@/components/ui/checkbox";
import { ErrorCard, StaleDataBanner } from "@/features/azure-devops/components/feedback";
import { cn } from "@/utils/cn";
import { useAiCredentials, useAiModels, useAiPreference, useAiUsage, useUpdateAiPreference } from "../hooks/use-ai";
import type { AiEffort, AiPreference, AiProvider } from "../types/ai.types";
import { PROVIDER_INFO, formatPrice, formatUsd } from "../utils/ai-display";
import { describeAiError } from "../utils/ai-errors";
import { AiReviewSpeed } from "./ai-review-speed";
import { formatDateTime } from "@/features/credentials/utils/credential-display";

const EFFORT_LABELS: Record<AiEffort, { label: string; hint: string }> = {
  LOW: { label: "Low", hint: "Fastest and cheapest" },
  MEDIUM: { label: "Medium", hint: "Balanced (recommended)" },
  HIGH: { label: "High", hint: "Most thorough, costs more" },
};

/** Which provider, model and effort AI checks use, plus the daily spend guard. */
export function AiSettingsCard() {
  const credentials = useAiCredentials();
  const preference = useAiPreference();

  if (preference.isLoading || credentials.isLoading) {
    return (
      <Card className="flex items-center gap-2 p-5 text-sm text-slate-500">
        <Spinner className="size-4" /> Loading AI settings…
      </Card>
    );
  }

  if (!preference.data) {
    return <ErrorCard error={preference.error} onRetry={() => void preference.refetch()} isRetrying={preference.isFetching} />;
  }

  return (
    <>
      {/* A failed background refresh keeps the form (and unsaved changes) on screen. */}
      {preference.error ? <StaleDataBanner error={preference.error} onRetry={() => void preference.refetch()} isRetrying={preference.isFetching} /> : null}
      {/* Re-mount the form whenever the saved settings change so it starts from them. */}
      <AiSettingsForm key={preference.data.updatedAt ?? "unsaved"} initial={preference.data} />
    </>
  );
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
  /** The saved keys could not be read, so which providers have one is unknown (not "none"). */
  const keysUnknown = credentials.isError && !credentials.data;
  /** Usage could not be read: show that, not figures that look like nothing was spent. */
  const usageUnknown = usage.isError && !usage.data;
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

  const savedModelLabel = initial.model ? ((initial.provider === provider ? models.data : undefined)?.find((option) => option.id === initial.model)?.label ?? initial.model) : null;
  const spentShare = usage.data && initial.dailyLimitUsd > 0 ? Math.min(1, usage.data.todayUsd / initial.dailyLimitUsd) : 0;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-950">AI settings</h3>
          <p className="mt-1 text-sm text-slate-600">Used for AI checks and suggested fixes. Your own key pays for your checks; results are private to you.</p>
        </div>
        {initial.provider ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-emerald-500" />
            AI checks on · {savedModelLabel ?? PROVIDER_INFO[initial.provider].name}
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-slate-400" />
            AI checks off
          </span>
        )}
      </div>

      {usageUnknown ? (
        <p role="alert" className="flex flex-wrap items-center gap-2 border-y border-slate-200 bg-slate-50 px-5 py-3 text-sm text-rose-600">
          AI usage could not be loaded.
          <Button size="sm" variant="ghost" disabled={usage.isFetching} onClick={() => void usage.refetch()}>
            {usage.isFetching ? "Retrying..." : "Retry"}
          </Button>
        </p>
      ) : (
        <dl aria-label="AI usage" className="grid border-y border-slate-200 bg-slate-50 sm:grid-cols-3">
          <div className="border-b border-slate-200 px-5 py-3 sm:border-b-0 sm:border-r">
            <dt className="text-sm text-slate-500">Spent today</dt>
            <dd className="mt-1">
              <span className="text-lg font-semibold text-slate-950 tabular-nums">{usage.data ? formatUsd(usage.data.todayUsd) : "—"}</span>
              <span className="text-sm text-slate-500"> of {formatUsd(initial.dailyLimitUsd)}</span>
              <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
                <span className={cn("block h-full rounded-full", spentShare >= 1 ? "bg-rose-500" : spentShare >= 0.8 ? "bg-amber-500" : "bg-indigo-500")} style={{ width: `${spentShare * 100}%` }} />
              </span>
            </dd>
          </div>
          <div className="border-b border-slate-200 px-5 py-3 sm:border-b-0 sm:border-r">
            <dt className="text-sm text-slate-500">Calls today</dt>
            <dd className="mt-1 text-lg font-semibold text-slate-950 tabular-nums">{usage.data ? usage.data.callsToday : "—"}</dd>
          </div>
          <div className="px-5 py-3">
            <dt className="text-sm text-slate-500">This month</dt>
            <dd className="mt-1 text-lg font-semibold text-slate-950 tabular-nums">
              {usage.data ? formatUsd(usage.data.monthUsd) : "—"}
              <span className="block text-xs font-normal text-slate-500">Daily total resets at 00:00 UTC</span>
            </dd>
          </div>
        </dl>
      )}
      <AiReviewSpeed provider={initial.provider} model={initial.model} />

      <form onSubmit={submit}>
        <div className="space-y-6 p-5">
          <section aria-labelledby="ai-model-title" className="space-y-3">
            <h4 id="ai-model-title" className="text-sm font-semibold text-slate-900">
              Model and limits
            </h4>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ai-provider">Provider</Label>
                <SelectField
                  id="ai-provider"
                  value={provider ?? ""}
                  onValueChange={(selected) => {
                    const next = (selected || null) as AiProvider | null;
                    setProvider(next);
                    setModel(null);
                  }}
                >
                  <option value="">AI checks off</option>
                  {(["CLAUDE", "OPENROUTER", "OPENCODE"] as const).map((option) => (
                    <option key={option} value={option} disabled={!providersWithKeys.includes(option)}>
                      {PROVIDER_INFO[option].name}
                      {providersWithKeys.includes(option) ? "" : keysUnknown ? " (keys not loaded)" : " (add a key first)"}
                    </option>
                  ))}
                </SelectField>
                {keysUnknown ? (
                  <p role="alert" className="flex flex-wrap items-center gap-2 text-xs text-rose-600">
                    Your AI keys could not be loaded.
                    <Button size="sm" variant="ghost" disabled={credentials.isFetching} onClick={() => void credentials.refetch()}>
                      {credentials.isFetching ? "Retrying..." : "Retry"}
                    </Button>
                  </p>
                ) : providersWithKeys.length === 0 ? (
                  <p className="text-xs text-slate-500">Add an AI provider key above to turn AI checks on.</p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ai-model">Model</Label>
                <SelectField
                  id="ai-model"
                  value={model ?? ""}
                  disabled={provider === null || models.isLoading}
                  onValueChange={(selected) => setModel(selected || null)}
                >
                  <option value="">{models.isLoading ? "Loading models…" : "Choose a model"}</option>
                  {(models.data ?? []).map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                      {option.free ? " · Free" : ""}
                    </option>
                  ))}
                </SelectField>
                {models.isError ? (
                  <p className="text-xs text-rose-600">{describeAiError(models.error, "Could not load models.")}</p>
                ) : selectedModel ? (
                  <div className="space-y-0.5 text-xs text-slate-500">
                    <p>
                      <span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-medium text-slate-700">{formatPrice(selectedModel)}</span>
                    </p>
                    {selectedModel.description ? <p>{selectedModel.description}</p> : null}
                  </div>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ai-effort">Effort</Label>
                <SelectField
                  id="ai-effort"
                  value={efforts.length === 0 ? "" : efforts.includes(effort) ? effort : (efforts[0] ?? "")}
                  disabled={efforts.length === 0}
                  onValueChange={(selected) => setEffort(selected as AiEffort)}
                >
                  {efforts.length === 0 ? <option value="">{selectedModel ? "Not adjustable" : "Choose a model first"}</option> : null}
                  {efforts.map((option) => (
                    <option key={option} value={option}>
                      {EFFORT_LABELS[option].label} · {EFFORT_LABELS[option].hint}
                    </option>
                  ))}
                </SelectField>
                {selectedModel && efforts.length === 0 ? <p className="text-xs text-slate-500">This model doesn't offer an effort setting.</p> : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ai-limit">Daily spend limit (USD)</Label>
                <div className="relative">
                  <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-500">
                    $
                  </span>
                  <Input id="ai-limit" type="number" min={0} max={100} step={0.5} className="pl-7" value={limit} onChange={(event) => setLimit(event.target.value)} />
                </div>
                <p className="text-xs text-slate-500">Checks pause once today's spend reaches this. 0 = free models only.</p>
              </div>
            </div>
          </section>

          {needsConsent ? (
            <label className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <Checkbox className="mt-0.5" checked={accepted} onCheckedChange={(state) => setAccepted(state === true)} />
              <span>
                <strong>Data notice:</strong> free models are served by providers that may store or train on what they receive. Ticket titles,
                descriptions and comments would be sent to them. I confirm this is allowed for my projects.
              </span>
            </label>
          ) : null}

        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-slate-50 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-h-5 text-xs">
            {message ? (
              <span role={message.tone === "error" ? "alert" : "status"} className={message.tone === "error" ? "text-sm text-rose-600" : "text-sm text-emerald-700"}>
                {message.text}
              </span>
            ) : changed && !save.isPending ? (
              <span className="text-amber-700">{valid ? "Unsaved changes" : "Unsaved changes: choose a model, accept the data notice if shown, and use a limit from 0 to 100"}</span>
            ) : !changed && initial.updatedAt ? (
              <span className="text-slate-500">Saved {formatDateTime(initial.updatedAt)}</span>
            ) : null}
          </div>
          <Button type="submit" disabled={!canSave}>
            {save.isPending ? <Spinner className="size-4" /> : null}
            Save AI settings
          </Button>
        </div>
      </form>
    </Card>
  );
}
