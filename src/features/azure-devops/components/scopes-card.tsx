import { useCapabilities } from "../hooks/use-projects";
import type { ScopeStatus } from "../types/azure.types";
import { SCOPE_HINTS } from "../utils/error-message";
import type { Tone } from "../utils/labels";
import { ErrorCard, SectionCard, SkeletonRows, StaleDataBanner } from "./feedback";
import { StatusBadge } from "./status-badge";

/** "unknown" only means the scope has not been probed or used yet. */
const statusLabel = (status: ScopeStatus) => (status === "unknown" ? "not checked yet" : status);

const SCOPE_TONES: Record<ScopeStatus, Tone> = {
  granted: "success",
  missing: "danger",
  unknown: "neutral",
};

/** What the PAT can read (probed) and write (learned from executed actions). */
export function ScopesCard({ credentialId }: { credentialId: string }) {
  const { data: capabilities, isLoading, isFetching, error, refetch } = useCapabilities(credentialId);

  return (
    <SectionCard
      title="PAT permissions"
      description="Read scopes are probed; write scopes are learned the first time an approved change runs."
    >
      {isLoading ? (
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
    </SectionCard>
  );
}
