import { useState } from "react";

import { useCapabilities } from "../hooks/use-projects";
import type { ScopeStatus } from "../types/azure.types";
import { SCOPE_HINTS } from "../utils/error-message";
import type { Tone } from "../utils/labels";
import { ErrorCard, SkeletonRows, StaleDataBanner } from "./feedback";
import { StatusBadge } from "./status-badge";

/** "unknown" only means the scope has not been probed or used yet. */
const statusLabel = (status: ScopeStatus) => (status === "unknown" ? "not checked yet" : status);

const SCOPE_TONES: Record<ScopeStatus, Tone> = {
  granted: "success",
  missing: "danger",
  unknown: "neutral",
};

/**
 * What the PAT can read (probed) and write (learned from executed actions),
 * folded on the organization's credential card: probing costs Azure calls,
 * so it runs only when opened.
 */
export function TokenPermissions({ credentialId }: { credentialId: string }) {
  const [open, setOpen] = useState(false);
  const { data: capabilities, isLoading, isFetching, error, refetch } = useCapabilities(credentialId, { enabled: open });

  return (
    <details className="group text-sm" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer select-none rounded font-medium text-slate-700 outline-none hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-indigo-500">
        Token permissions
      </summary>
      <div className="mt-3 flex flex-col gap-2">
        <p className="text-xs text-slate-500">Read scopes are probed; write scopes are learned the first time an approved change runs.</p>
        {!open ? null : isLoading ? (
          <SkeletonRows rows={1} />
        ) : !capabilities ? (
          <ErrorCard error={error} credentialId={credentialId} onRetry={() => void refetch()} isRetrying={isFetching} />
        ) : (
          <div className="flex flex-wrap gap-2">
            {error ? <StaleDataBanner credentialId={credentialId} error={error} onRetry={() => void refetch()} isRetrying={isFetching} /> : null}
            {Object.entries(capabilities.scopes).map(([area, status]) => (
              <StatusBadge key={area} tone={SCOPE_TONES[status]} title={SCOPE_HINTS[area]}>
                {SCOPE_HINTS[area] ?? area}: {statusLabel(status)}
              </StatusBadge>
            ))}
            {Object.entries(capabilities.writeScopes).map(([area, status]) => (
              <StatusBadge key={`write-${area}`} tone={SCOPE_TONES[status]}>
                {area === "work" ? "Work Items (Write)" : "Build (Execute)"}: {statusLabel(status)}
              </StatusBadge>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}
