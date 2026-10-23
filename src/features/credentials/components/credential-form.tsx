import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type UseFormSetError } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/utils/cn";
import {
  createCredentialFormSchema,
  updateCredentialFormSchema,
  type CredentialFormValues,
} from "../schemas/credential.schema";
import { CredentialAlert } from "./credential-alert";

interface CredentialFormProps {
  mode: "create" | "edit";
  defaultValues: CredentialFormValues;
  isPending: boolean;
  formError: string | null;
  onSubmit: (
    values: CredentialFormValues,
    setError: UseFormSetError<CredentialFormValues>
  ) => void;
  onCancel: () => void;
}

export function CredentialForm({
  mode,
  defaultValues,
  isPending,
  formError,
  onSubmit,
  onCancel,
}: CredentialFormProps) {
  const resolver =
    mode === "create"
      ? zodResolver(createCredentialFormSchema)
      : zodResolver(updateCredentialFormSchema);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<CredentialFormValues>({
    resolver,
    mode: "onTouched",
    defaultValues,
  });

  const submit = handleSubmit((values) => {
    onSubmit(values, setError);
  });

  return (
    <form className="space-y-6" onSubmit={submit} noValidate>
      <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white">
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
            className="size-5"
          >
            <path d="M4.5 3A1.5 1.5 0 0 0 3 4.5v11A1.5 1.5 0 0 0 4.5 17h11a1.5 1.5 0 0 0 1.5-1.5v-11A1.5 1.5 0 0 0 15.5 3h-11Zm1.75 2.5a.75.75 0 0 0 0 1.5h7.5a.75.75 0 0 0 0-1.5h-7.5Zm0 3a.75.75 0 0 0 0 1.5h4.5a.75.75 0 0 0 0-1.5h-4.5Zm0 3a.75.75 0 0 0 0 1.5h6a.75.75 0 0 0 0-1.5h-6Z" />
          </svg>
        </span>

        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-950">
            Azure DevOps
          </p>
          <p className="mt-0.5 text-xs leading-5 text-slate-500">
            Connect an organization with a personal access token.
            Azure DevOps is the only supported platform right now.
          </p>
        </div>

        <span className="ml-auto shrink-0 rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600">
          Platform
        </span>
      </div>

      {formError ? (
        <CredentialAlert tone="error" message={formError} />
      ) : null}

      <FormField
        id="label"
        label="Label"
        error={errors.label?.message}
        hint="Optional. Helps distinguish multiple organizations."
      >
        <Input
          id="label"
          type="text"
          autoComplete="off"
          placeholder="e.g. Platform Team"
          disabled={isPending}
          aria-invalid={errors.label ? true : undefined}
          aria-describedby={
            errors.label ? "label-error" : "label-hint"
          }
          className={cn(
            errors.label
              ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/20"
              : undefined
          )}
          {...register("label")}
        />
      </FormField>

      <FormField
        id="organizationUrl"
        label="Organization URL"
        error={errors.organizationUrl?.message}
        hint="Use https://dev.azure.com/<organization> or https://<organization>.visualstudio.com."
      >
        <Input
          id="organizationUrl"
          type="url"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="https://dev.azure.com/my-org"
          disabled={isPending}
          aria-invalid={
            errors.organizationUrl ? true : undefined
          }
          aria-describedby={
            errors.organizationUrl
              ? "organizationUrl-error"
              : "organizationUrl-hint"
          }
          className={cn(
            errors.organizationUrl
              ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/20"
              : undefined
          )}
          {...register("organizationUrl")}
        />
      </FormField>

      <FormField
        id="patToken"
        label={
          mode === "create"
            ? "Personal access token"
            : "Replace personal access token"
        }
        error={errors.patToken?.message}
        hint={
          mode === "create"
            ? "Minimum 20 characters. The PAT is encrypted and never displayed again."
            : "Leave blank to keep the current PAT. Enter a new token only to replace it."
        }
      >
        <PasswordInput
          id="patToken"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder={
            mode === "create"
              ? "Paste your Azure DevOps PAT"
              : "Leave blank to keep current PAT"
          }
          disabled={isPending}
          aria-invalid={errors.patToken ? true : undefined}
          aria-describedby={
            errors.patToken ? "patToken-error" : "patToken-hint"
          }
          className={cn(
            errors.patToken
              ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/20"
              : undefined
          )}
          {...register("patToken")}
        />
      </FormField>

      <div className="flex gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-800">
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-emerald-600"
        >
          <path
            fillRule="evenodd"
            d="M10 1.944a11.954 11.954 0 0 1-3.944.753c-.882 0-1.74-.095-2.567-.277A2.25 2.25 0 0 0 1.25 4.66v4.254c0 4.313 2.626 7.992 6.39 9.944a2.25 2.25 0 0 0 1.72 0c3.764-1.952 6.39-5.631 6.39-9.944V4.66a2.25 2.25 0 0 0-2.239-2.24c-.827.182-1.685.277-2.567.277A11.954 11.954 0 0 1 10 1.944Zm3.28 6.025a.75.75 0 1 0-1.06-1.06L9.25 9.88 7.78 8.41a.75.75 0 0 0-1.06 1.06l2 2a.75.75 0 0 0 1.06 0l3.5-3.5Z"
            clipRule="evenodd"
          />
        </svg>

        <p>
          <span className="font-semibold">
            Encrypted at rest.
          </span>{" "}
          The PAT is never returned to the browser and only leaves
          the backend when validating against Azure DevOps.
        </p>
      </div>

      <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
        <Button
          variant="secondary"
          onClick={onCancel}
          disabled={isPending}
        >
          Cancel
        </Button>

        <Button type="submit" disabled={isPending}>
          {isPending ? (
            <>
              <Spinner className="size-4" />
              {mode === "create" ? "Saving..." : "Updating..."}
            </>
          ) : mode === "create" ? (
            "Save credential"
          ) : (
            "Save changes"
          )}
        </Button>
      </div>
    </form>
  );
}
