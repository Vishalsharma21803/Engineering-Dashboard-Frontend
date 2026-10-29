import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { Card } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Spinner } from "@/components/ui/spinner";
import { SelectField } from "@/components/ui/select-field";
import { ErrorCard, StaleDataBanner } from "@/features/azure-devops/components/feedback";
import { usePlatforms, type ConnectResult } from "../api/platform.api";
import { PlatformForm } from "../components/platform-form";

/** The success message for the Credentials page. */
function addedMessage(result: ConnectResult): string {
  if (result.kind === "solidtime") {
    const record = result.record as { connection?: { organizationId: string | null } };
    return `Solidtime (${result.name}) connected.${record.connection?.organizationId ? "" : " Choose its organization below."}`;
  }

  return `${result.name} added.`;
}

/**
 * Add a credential for any integration in the backend's platform registry
 * (AI providers are added in their own section). The fields come from the
 * registry, so a new platform needs no new form here.
 */
export function CreateCredentialPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const platforms = usePlatforms();
  /** While a save runs the platform stays fixed (switching would drop the form and its result). */
  const [saving, setSaving] = useState(false);
  const integrations = (platforms.data ?? []).filter((platform) => platform.category === "integration");
  const requested = searchParams.get("platform");
  const platform = integrations.find((candidate) => candidate.id === requested) ?? integrations[0];

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <Link
          to="/credentials"
          className="inline-flex items-center gap-1.5 rounded-sm text-sm font-medium text-slate-500 outline-none transition hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="size-4">
            <path
              fillRule="evenodd"
              d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z"
              clipRule="evenodd"
            />
          </svg>
          Back to credentials
        </Link>

        <h1 className="mt-6 text-3xl font-semibold tracking-tight text-slate-950">Add credential</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">Choose the platform, then fill in its details. Tokens are encrypted on the server and never shown again.</p>
      </div>

      <Card className="flex flex-col gap-6 p-6 sm:p-8">
        {platforms.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Spinner className="size-4" /> Loading platforms…
          </p>
        ) : !platforms.data || !platform ? (
          <ErrorCard error={platforms.error} onRetry={() => void platforms.refetch()} />
        ) : (
          <>
            {/* A failed background refresh keeps the form (and what was typed) on screen. */}
            {platforms.error ? <StaleDataBanner error={platforms.error} onRetry={() => void platforms.refetch()} isRetrying={platforms.isFetching} /> : null}
            <FormField id="platform" label="Platform" hint={platform.description}>
              <SelectField id="platform" value={platform.id} disabled={saving} onValueChange={(selected) => setSearchParams({ platform: selected }, { replace: true })}>
                {integrations.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </SelectField>
            </FormField>

            <div className="border-t border-slate-100 pt-6">
              {/* A fresh form per platform, so nothing typed for one is sent to another. */}
              <PlatformForm
                key={platform.id}
                platform={platform}
                submitLabel="Save credential"
                onSubmitting={setSaving}
                onCancel={() => navigate("/credentials")}
                onSaved={(result) => navigate("/credentials", { replace: true, state: { notice: { tone: "success", message: addedMessage(result) } } })}
              />
            </div>
          </>
        )}
      </Card>
    </section>
  );
}
