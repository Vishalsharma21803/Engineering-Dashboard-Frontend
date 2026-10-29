import { useState } from "react";
import type { UseFormSetError } from "react-hook-form";
import {
  Link,
  useNavigate,
  useParams,
} from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageLoader } from "@/components/ui/page-loader";
import { StaleDataBanner } from "@/features/azure-devops/components/feedback";
import { ApiError } from "@/lib/api-client";
import { applyApiError } from "@/lib/form-errors";
import { CredentialForm } from "../components/credential-form";
import { useCredentials } from "../hooks/use-credentials";
import { useUpdateCredential } from "../hooks/use-update-credential";
import type { CredentialFormValues } from "../schemas/credential.schema";
import type { UpdateCredentialInput } from "../types/credential.types";
import { getCredentialDisplayName } from "../utils/credential-display";

export function EditCredentialPage() {
  const { id } = useParams<{ id: string }>();
  const [formError, setFormError] = useState<string | null>(null);
  const navigate = useNavigate();
  const updateMutation = useUpdateCredential();

  const {
    data: credentials,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useCredentials();

  if (error instanceof ApiError && error.status === 401) {
    return (
      <PageLoader
        label="Session expired. Redirecting to sign in..."
        fullScreen={false}
      />
    );
  }

  if (isLoading) {
    return (
      <PageLoader
        label="Loading credential..."
        fullScreen={false}
      />
    );
  }

  // Only a failed first load replaces the page; a failed background
  // refresh keeps the form and what was typed into it.
  if (isError && !credentials) {
    return (
      <section className="mx-auto w-full max-w-2xl">
        <Card className="p-6">
          <h1 className="text-lg font-semibold text-slate-950">
            Unable to load credential
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {error instanceof ApiError
              ? error.message
              : "Something went wrong while loading the credential."}
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
      </section>
    );
  }

  const credential = id
    ? credentials?.find((item) => item.id === id)
    : undefined;

  if (!credential) {
    return (
      <section className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <Link
          to="/credentials"
          className="inline-flex w-fit items-center gap-1.5 rounded-sm text-sm font-medium text-slate-500 outline-none transition hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
        >
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
            className="size-4"
          >
            <path
              fillRule="evenodd"
              d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z"
              clipRule="evenodd"
            />
          </svg>
          Back to credentials
        </Link>

        <Card className="p-8 text-center">
          <h1 className="text-xl font-semibold text-slate-950">
            Credential not found
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
            This credential may have been deleted or does not belong
            to your account.
          </p>
        </Card>
      </section>
    );
  }

  const displayName = getCredentialDisplayName(credential);

  function handleSubmit(
    values: CredentialFormValues,
    setError: UseFormSetError<CredentialFormValues>
  ) {
    if (!credential) {
      return;
    }

    setFormError(null);

    const input: UpdateCredentialInput = {};
    const nextLabel = values.label || null;

    if (values.organizationUrl !== credential.organizationUrl) {
      input.organizationUrl = values.organizationUrl;
    }

    if (nextLabel !== credential.label) {
      input.label = nextLabel;
    }

    if (values.patToken) {
      input.patToken = values.patToken;
    }

    if (Object.keys(input).length === 0) {
      setFormError(
        "Change the label, organization URL, or PAT before saving."
      );
      return;
    }

    updateMutation.mutate(
      {
        id: credential.id,
        input,
      },
      {
        onSuccess: (updatedCredential) => {
          const updatedName =
            getCredentialDisplayName(updatedCredential);

          navigate("/credentials", {
            replace: true,
            state: {
              notice: {
                tone: "success",
                message: `${updatedName} updated.`,
              },
            },
          });
        },
        onError: (mutationError) => {
          if (
            mutationError instanceof ApiError &&
            mutationError.status === 409
          ) {
            setError(
              "organizationUrl",
              {
                type: "server",
                message: mutationError.message,
              },
              { shouldFocus: true }
            );
            setFormError(mutationError.message);
            return;
          }

          if (
            mutationError instanceof ApiError &&
            mutationError.status === 404
          ) {
            setFormError(
              "This credential no longer exists. Refreshing the list."
            );
            void refetch();
            return;
          }

          setFormError(
            applyApiError(
              mutationError,
              setError,
              ["label", "organizationUrl", "patToken"],
              "Unable to update the credential. Please try again."
            )
          );
        },
      }
    );
  }

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <Link
          to="/credentials"
          className="inline-flex items-center gap-1.5 rounded-sm text-sm font-medium text-slate-500 outline-none transition hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
        >
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
            className="size-4"
          >
            <path
              fillRule="evenodd"
              d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z"
              clipRule="evenodd"
            />
          </svg>
          Back to credentials
        </Link>

        <h1 className="mt-6 text-3xl font-semibold tracking-tight text-slate-950">
          Edit credential
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Update {displayName}. The current PAT cannot be displayed
          or recovered.
        </p>
      </div>

      {isError ? (
        <StaleDataBanner error={error} onRetry={() => void refetch()} isRetrying={isFetching} />
      ) : null}

      <Card className="p-6 sm:p-8">
        <CredentialForm
          key={`${credential.id}-${credential.updatedAt}`}
          mode="edit"
          defaultValues={{
            label: credential.label ?? "",
            organizationUrl: credential.organizationUrl,
            patToken: "",
          }}
          isPending={updateMutation.isPending}
          formError={formError}
          onSubmit={handleSubmit}
          onCancel={() => navigate("/credentials")}
        />
      </Card>
    </section>
  );
}
