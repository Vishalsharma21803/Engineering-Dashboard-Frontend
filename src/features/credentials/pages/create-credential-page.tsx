import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Card } from "@/components/ui/card";
import { ApiError } from "@/lib/api-client";
import { applyApiError } from "@/lib/form-errors";
import { CredentialForm } from "../components/credential-form";
import { useCreateCredential } from "../hooks/use-create-credential";
import type { CreateCredentialInput } from "../types/credential.types";
import { getCredentialDisplayName } from "../utils/credential-display";
import type { CredentialFormValues } from "../schemas/credential.schema";
import type { UseFormSetError } from "react-hook-form";

export function CreateCredentialPage() {
  const [formError, setFormError] = useState<string | null>(null);
  const createMutation = useCreateCredential();
  const navigate = useNavigate();

  function handleSubmit(
    values: CredentialFormValues,
    setError: UseFormSetError<CredentialFormValues>
  ) {
    setFormError(null);

    const label = values.label.trim();
    const input: CreateCredentialInput = {
      platform: "AZURE",
      organizationUrl: values.organizationUrl,
      patToken: values.patToken,
      ...(label ? { label } : {}),
    };

    createMutation.mutate(input, {
      onSuccess: (credential) => {
        const displayName = getCredentialDisplayName(credential);

        navigate("/credentials", {
          replace: true,
          state: {
            notice: {
              tone: "success",
              message: `${displayName} added.`,
            },
          },
        });
      },
      onError: (error) => {
        if (error instanceof ApiError && error.status === 409) {
          setError(
            "organizationUrl",
            {
              type: "server",
              message: error.message,
            },
            { shouldFocus: true }
          );
          setFormError(error.message);
          return;
        }

        setFormError(
          applyApiError(
            error,
            setError,
            ["label", "organizationUrl", "patToken"],
            "Unable to save the credential. Please try again."
          )
        );
      },
    });
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

        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">
          Azure DevOps
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
          Add credential
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Store an organization URL and personal access token. The
          PAT is encrypted before it reaches the database.
        </p>
      </div>

      <Card className="p-6 sm:p-8">
        <CredentialForm
          mode="create"
          defaultValues={{
            label: "",
            organizationUrl: "",
            patToken: "",
          }}
          isPending={createMutation.isPending}
          formError={formError}
          onSubmit={handleSubmit}
          onCancel={() => navigate("/credentials")}
        />
      </Card>
    </section>
  );
}
