import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { buttonClassName } from "@/components/ui/button-styles";
import { Card } from "@/components/ui/card";
import { PageLoader } from "@/components/ui/page-loader";
import { StaleDataBanner } from "@/features/azure-devops/components/feedback";
import { ApiError } from "@/lib/api-client";
import { errorMessage } from "@/lib/error-text";
import { CredentialAlert } from "../components/credential-alert";
import { CredentialCard } from "../components/credential-card";
import type { CardNotice } from "../components/credential-card-frame";
import { CredentialDeleteDialog } from "../components/credential-delete-dialog";
import { AiProvidersSection } from "@/features/ai/components/ai-providers-section";
import { SolidtimeConnectionsSection } from "@/features/solidtime/components/solidtime-connections-section";
import { useCredentials } from "../hooks/use-credentials";
import { useDeleteCredential } from "../hooks/use-delete-credential";
import { useValidateCredential } from "../hooks/use-validate-credential";
import type { Credential } from "../types/credential.types";
import {
  getCredentialDisplayName,
  getValidationReasonMessage,
} from "../utils/credential-display";
import type { CredentialAlertTone } from "../components/credential-alert";

interface CredentialsRouteState {
  notice?: {
    tone: CredentialAlertTone;
    message: string;
  };
}

interface Notice {
  tone: CredentialAlertTone;
  message: string;
}

function CredentialsSkeleton() {
  return (
    <div className="space-y-3" aria-label="Loading credentials">
      {[0, 1, 2].map((item) => (
        <Card key={item} className="p-5">
          <div className="skeleton space-y-3">
            <div className="flex gap-2">
              <div className="h-6 w-28 rounded-full bg-slate-100" />
              <div className="h-6 w-24 rounded-full bg-slate-100" />
            </div>
            <div className="h-5 w-56 rounded bg-slate-100" />
            <div className="h-3 w-72 max-w-full rounded bg-slate-100" />
            <div className="h-3 w-40 rounded bg-slate-100" />
          </div>
        </Card>
      ))}
    </div>
  );
}

export function CredentialsPage() {
  const [deleteTarget, setDeleteTarget] =
    useState<Credential | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  const routeNotice = (
    location.state as CredentialsRouteState | null
  )?.notice;
  const [notice, setNotice] = useState<Notice | null>(
    () => routeNotice ?? null
  );

  const noticeRef = useRef<HTMLDivElement>(null);
  /** A validation result, shown inside the card it belongs to. */
  const [cardNotice, setCardNotice] = useState<(CardNotice & { id: string }) | null>(null);

  // A new message (also for actions further down the page) is brought into view once.
  useEffect(() => {
    if (notice) {
      noticeRef.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
    }
  }, [notice]);

  useEffect(() => {
    if (!routeNotice) {
      return;
    }

    navigate(location.pathname, { replace: true, state: null });
  }, [routeNotice, location.pathname, navigate]);

  const {
    data: credentials,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useCredentials();

  const validateMutation = useValidateCredential();
  const deleteMutation = useDeleteCredential();

  if (error instanceof ApiError && error.status === 401) {
    return (
      <PageLoader
        label="Session expired. Redirecting to sign in..."
        fullScreen={false}
      />
    );
  }

  const credentialList = credentials ?? [];
  const validatingId = validateMutation.isPending
    ? validateMutation.variables
    : null;
  const isMutating =
    validateMutation.isPending || deleteMutation.isPending;

  function handleValidate(credential: Credential) {
    setNotice(null);
    setCardNotice(null);

    validateMutation.mutate(credential.id, {
      onSuccess: (result) => {
        const displayName = getCredentialDisplayName(credential);

        if (result.valid) {
          setCardNotice({ id: credential.id,
            tone: "success",
            message: `${displayName} validated successfully with Azure DevOps.`,
          });
          return;
        }

        setCardNotice({ id: credential.id,
          tone: "error",
          message: getValidationReasonMessage(result.reason),
        });
      },
      onError: (mutationError) => {
        if (
          mutationError instanceof ApiError &&
          mutationError.status === 401
        ) {
          return;
        }

        if (
          mutationError instanceof ApiError &&
          mutationError.status === 404
        ) {
          setCardNotice({ id: credential.id,
            tone: "error",
            message:
              "This credential no longer exists. Refreshing the list.",
          });
          void refetch();
          return;
        }

        if (
          mutationError instanceof ApiError &&
          mutationError.status === 502
        ) {
          setCardNotice({ id: credential.id,
            tone: "error",
            message:
              "Azure DevOps could not be reached. Try validating again later.",
          });
          return;
        }

        setCardNotice({ id: credential.id,
          tone: "error",
          message: errorMessage(mutationError, "Unable to validate the credential."),
        });
      },
    });
  }

  function handleDelete(credential: Credential) {
    setNotice(null);
    setDeleteTarget(credential);
  }

  function handleDeleteConfirm() {
    if (!deleteTarget) {
      return;
    }

    const credential = deleteTarget;
    const displayName = getCredentialDisplayName(credential);

    deleteMutation.mutate(credential.id, {
      onSuccess: () => {
        setDeleteTarget(null);
        setNotice({
          tone: "success",
          message: `${displayName} deleted.`,
        });
      },
      onError: (mutationError) => {
        setDeleteTarget(null);

        if (
          mutationError instanceof ApiError &&
          mutationError.status === 401
        ) {
          return;
        }

        if (
          mutationError instanceof ApiError &&
          mutationError.status === 404
        ) {
          setNotice({
            tone: "error",
            message:
              "This credential no longer exists. Refreshing the list.",
          });
          void refetch();
          return;
        }

        setNotice({
          tone: "error",
          message: errorMessage(mutationError, "Unable to delete the credential."),
        });
      },
    });
  }

  return (
    <section className="flex w-full flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
            Credentials
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Connect your Azure DevOps organizations, Solidtime and AI
            providers. Tokens are stored encrypted and never shown again.
          </p>
        </div>

        <Link
          to="/credentials/new"
          className={buttonClassName({ size: "md" })}
        >
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
            className="size-4"
          >
            <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
          </svg>
          Add credential
        </Link>
      </div>

      {notice ? (
        <div ref={noticeRef} className="scroll-mt-24">
          <CredentialAlert
            tone={notice.tone}
            message={notice.message}
            onDismiss={() => setNotice(null)}
          />
        </div>
      ) : null}

      <section aria-labelledby="azure-title" className="flex flex-col gap-4">
        <div>
          <h2 id="azure-title" className="text-xl font-semibold tracking-tight text-slate-950">
            Azure DevOps
          </h2>
          <p className="mt-1 text-sm text-slate-600">Organizations Cockpit reads your work items, pull requests and pipelines from.</p>
        </div>
        {isError && credentials ? (
          // A failed background refresh keeps the last list on screen.
          <StaleDataBanner error={error} onRetry={() => void refetch()} isRetrying={isFetching} />
        ) : null}
        {isLoading ? (
          <CredentialsSkeleton />
        ) : isError && !credentials ? (
          <Card className="p-6">
            <h2 className="text-base font-semibold text-slate-950">
              Unable to load credentials
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              {errorMessage(error, "Something went wrong while loading your credentials.")}
            </p>
            <Button
              variant="secondary"
              className="mt-4"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              {isFetching ? "Retrying..." : "Try again"}
            </Button>
          </Card>
        ) : credentialList.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-surface p-10 text-center">
            <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="size-6"
              >
                <circle cx="8" cy="15" r="4" />
                <path d="m10.85 12.15 7.65-7.65" />
                <path d="m14 9 3 3" />
                <path d="m17 6 3 3" />
              </svg>
            </span>
            <h3 className="mt-4 text-lg font-semibold text-slate-950">
              No Azure DevOps organization yet
            </h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
              Add an organization URL and a personal access token to see your work items, pull requests and pipelines.
            </p>
            <Link
              to="/credentials/new?platform=azure"
              className={`${buttonClassName({
                size: "md",
              })} mt-6`}
            >
              Add Azure DevOps
            </Link>
          </div>
        ) : (
          <div className="space-y-3">

            {credentialList.map((credential) => (
              <CredentialCard
                key={credential.id}
                credential={credential}
                isValidating={validatingId === credential.id}
                validateDisabled={isMutating}
                deleteDisabled={isMutating}
                onValidate={handleValidate}
                onDelete={handleDelete}
                notice={cardNotice?.id === credential.id ? cardNotice : null}
                onDismissNotice={() => setCardNotice(null)}
              />
            ))}
          </div>
        )}
      </section>

      <SolidtimeConnectionsSection onNotice={setNotice} />

      <AiProvidersSection />

      <CredentialDeleteDialog
        credential={deleteTarget}
        isPending={deleteMutation.isPending}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
      />
    </section>
  );
}
