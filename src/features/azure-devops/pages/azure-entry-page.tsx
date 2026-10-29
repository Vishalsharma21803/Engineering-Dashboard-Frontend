import { Link, Navigate } from "react-router-dom";

import { buttonClassName } from "@/components/ui/button-styles";
import { Card } from "@/components/ui/card";
import { useCredentials } from "@/features/credentials/hooks/use-credentials";
import { getCredentialDisplayName } from "@/features/credentials/utils/credential-display";
import { ErrorCard, SkeletonRows } from "../components/feedback";
import { getLastCredential } from "../utils/last-project";

/** Picks the organization (credential) to open; skips the choice when there is one. */
export function AzureEntryPage() {
  const { data: credentials, isLoading, error, refetch, isFetching } = useCredentials();

  if (isLoading) {
    return (
      <div className="w-full">
        <SkeletonRows />
      </div>
    );
  }

  if (error || !credentials) {
    return (
      <div className="w-full">
        <ErrorCard error={error} onRetry={() => void refetch()} isRetrying={isFetching} />
      </div>
    );
  }

  const lastCredential = getLastCredential();
  const remembered = credentials.find((credential) => credential.id === lastCredential);
  const only = credentials.length === 1 ? credentials[0] : undefined;
  const target = remembered ?? only;

  if (target) {
    return <Navigate to={`/azure/${encodeURIComponent(target.id)}`} replace />;
  }

  return (
    <section className="flex w-full flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Choose an organization</h1>
      </div>

      {credentials.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-surface p-10 text-center">
          <h2 className="text-lg font-semibold text-slate-950">No Azure DevOps credential yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
            Add an organization URL and PAT. The dashboard reads Azure DevOps through the backend only.
          </p>
          <Link to="/credentials/new" className={`${buttonClassName({ size: "md" })} mt-6`}>
            Add credential
          </Link>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {credentials.map((credential) => (
            <Link key={credential.id} to={`/azure/${encodeURIComponent(credential.id)}`}>
              <Card className="p-5 transition hover:border-indigo-300">
                <p className="font-semibold text-slate-950">{getCredentialDisplayName(credential)}</p>
                <p className="mt-1 text-sm text-slate-500">{credential.organizationUrl}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
