import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { buttonClassName } from "@/components/ui/button-styles";
import { Card } from "@/components/ui/card";
import { PageLoader } from "@/components/ui/page-loader";
import { ApiError } from "@/lib/api-client";
import { CredentialAlert } from "../components/credential-alert";
import { CredentialCard } from "../components/credential-card";
import { CredentialDeleteDialog } from "../components/credential-delete-dialog";
import { AiProvidersSection } from "@/features/ai/components/ai-providers-section";
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
          <div className="animate-pulse space-y-3">
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

    validateMutation.mutate(credential.id, {
      onSuccess: (result) => {
        const displayName = getCredentialDisplayName(credential);

        if (result.valid) {
          setNotice({
            tone: "success",
            message: `${displayName} validated successfully with Azure DevOps.`,
          });
          return;
        }

        setNotice({
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
          setNotice({
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
          setNotice({
            tone: "error",
            message:
              "Azure DevOps could not be reached. Try validating again later.",
          });
          return;
        }

        setNotice({
          tone: "error",
          message:
            mutationError instanceof ApiError
              ? mutationError.message
              : "Unable to validate the credential.",
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
          message:
            mutationError instanceof ApiError
              ? mutationError.message
              : "Unable to delete the credential.",
        });
      },
    });
  }

  return (
    <section className="flex w-full flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">
            Workspace
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
            Credentials
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Manage Azure DevOps organization access. PATs are
            encrypted at rest and never returned to the browser.
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
        <CredentialAlert
          tone={notice.tone}
          message={notice.message}
          onDismiss={() => setNotice(null)}
        />
      ) : null}

      {isLoading ? (
        <CredentialsSkeleton />
      ) : isError ? (
        <Card className="p-6">
          <h2 className="text-base font-semibold text-slate-950">
            Unable to load credentials
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            {error instanceof ApiError
              ? error.message
              : "Something went wrong while loading your credentials."}
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
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
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
          <h2 className="mt-4 text-lg font-semibold text-slate-950">
            No credentials yet
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
            Add an Azure DevOps personal access token to validate
            organization access and prepare for project data.
          </p>
          <Link
            to="/credentials/new"
            className={`${buttonClassName({
              size: "md",
            })} mt-6`}
          >
            Add your first credential
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {credentialList.length}{" "}
            {credentialList.length === 1
              ? "credential"
              : "credentials"}
          </p>

          {credentialList.map((credential) => (
            <CredentialCard
              key={credential.id}
              credential={credential}
              isValidating={validatingId === credential.id}
              validateDisabled={isMutating}
              deleteDisabled={isMutating}
              onValidate={handleValidate}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      <div className="flex gap-3 rounded-lg border border-slate-200 bg-white p-4 text-xs leading-5 text-slate-600">
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-slate-400"
        >
          <path
            fillRule="evenodd"
            d="M10 1.944a11.954 11.954 0 0 1-3.944.753c-.882 0-1.74-.095-2.567-.277A2.25 2.25 0 0 0 1.25 4.66v4.254c0 4.313 2.626 7.992 6.39 9.944a2.25 2.25 0 0 0 1.72 0c3.764-1.952 6.39-5.631 6.39-9.944V4.66a2.25 2.25 0 0 0-2.239-2.24c-.827.182-1.685.277-2.567.277A11.954 11.954 0 0 1 10 1.944Zm3.28 6.025a.75.75 0 1 0-1.06-1.06L9.25 9.88 7.78 8.41a.75.75 0 0 0-1.06 1.06l2 2a.75.75 0 0 0 1.06 0l3.5-3.5Z"
            clipRule="evenodd"
          />
        </svg>

        <p>
          Stored PATs are AES-256-GCM encrypted. This page only
          receives metadata such as the label, organization URL, and
          validation status.
        </p>
      </div>

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
