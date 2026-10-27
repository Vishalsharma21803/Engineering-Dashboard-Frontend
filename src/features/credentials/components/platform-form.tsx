import { useState, type FormEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Spinner } from "@/components/ui/spinner";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/utils/cn";
import { useConnectPlatform, type ConnectResult, type PlatformDefinition } from "../api/platform.api";
import { CredentialAlert } from "./credential-alert";

const INVALID = "border-rose-400 focus:border-rose-500 focus:ring-rose-500/20";

interface PlatformFormProps {
  platform: PlatformDefinition;
  submitLabel: string;
  /** Shown on the submit button while something runs after saving (e.g. checking a key). */
  busyLabel?: string | null;
  onSaved: (result: ConnectResult) => void;
  onCancel: () => void;
  /** Called when a save starts and when it fails (e.g. to keep the surrounding choice fixed meanwhile). */
  onSubmitting?: (submitting: boolean) => void;
  /** Extra content between the fields and the buttons. */
  children?: ReactNode;
}

/**
 * A form drawn from a platform in the backend registry: an optional label, then
 * the platform's own fields. The backend validates them with the platform's
 * rules; its field errors are shown under the matching fields.
 */
export function PlatformForm({ platform, submitLabel, busyLabel = null, onSaved, onCancel, onSubmitting, children }: PlatformFormProps) {
  const connect = useConnectPlatform();
  const [label, setLabel] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const busy = connect.isPending || busyLabel !== null;
  const missing = platform.fields.some((field) => field.required && !(values[field.name] ?? "").trim());

  function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});
    onSubmitting?.(true);
    connect.mutate(
      { platform: platform.id, ...(label.trim() ? { label: label.trim() } : {}), fields: Object.fromEntries(platform.fields.map((field) => [field.name, (values[field.name] ?? "").trim()])) },
      {
        onSuccess: (result) => {
          // Secrets leave the page as soon as they are saved.
          setValues({});
          onSaved(result);
        },
        onError: (error) => {
          onSubmitting?.(false);
          if (error instanceof ApiError && error.errors.length > 0) {
            const byField: Record<string, string> = {};
            for (const issue of error.errors) {
              const name = issue.field.replace(/^fields\./, "");
              if (name === "label") byField.label = issue.message;
              else if (platform.fields.some((field) => field.name === name)) byField[name] = issue.message;
            }
            setFieldErrors(byField);
            setFormError(Object.keys(byField).length > 0 ? "Check the highlighted fields." : error.message);
            return;
          }

          setFormError(error instanceof ApiError ? error.message : `Could not add ${platform.label}. Please try again.`);
        },
      }
    );
  }

  const fieldId = (name: string) => `${platform.id}-${name}`;

  return (
    <form onSubmit={submit} aria-label={`Connect ${platform.label}`} className="space-y-6" noValidate>
      {formError ? <CredentialAlert tone="error" message={formError} onDismiss={() => setFormError(null)} /> : null}

      <FormField id={fieldId("label")} label="Label (optional)" error={fieldErrors.label} hint="Helps tell several connections apart.">
        <Input id={fieldId("label")} autoComplete="off" value={label} disabled={busy} aria-invalid={fieldErrors.label ? true : undefined} className={cn(fieldErrors.label && INVALID)} onChange={(event) => setLabel(event.target.value)} />
      </FormField>

      {platform.fields.map((field) => {
        const error = fieldErrors[field.name];
        const common = {
          id: fieldId(field.name),
          autoComplete: "off",
          autoCapitalize: "none",
          spellCheck: false,
          placeholder: field.placeholder,
          value: values[field.name] ?? "",
          disabled: busy,
          "aria-invalid": error ? true : undefined,
          className: cn(error && INVALID),
          onChange: (event: React.ChangeEvent<HTMLInputElement>) => setValues((current) => ({ ...current, [field.name]: event.target.value })),
        };

        return (
          <FormField key={field.name} id={fieldId(field.name)} label={field.required ? field.label : `${field.label} (optional)`} error={error} hint={field.hint}>
            {field.type === "secret" ? <PasswordInput {...common} /> : <Input {...common} type={field.type === "url" ? "url" : "text"} />}
          </FormField>
        );
      })}

      {platform.helpUrl ? (
        <p className="-mt-3 text-xs text-slate-500">
          <a href={platform.helpUrl} target="_blank" rel="noreferrer" className="font-medium text-indigo-600 hover:text-indigo-500">
            Where do I get this? ↗
          </a>
        </p>
      ) : null}

      {children}

      <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-6 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || missing}>
          {busy ? <Spinner className="size-4" /> : null}
          {busyLabel ?? submitLabel}
        </Button>
      </div>
    </form>
  );
}
