import type {
  FieldValues,
  Path,
  UseFormSetError,
} from "react-hook-form";

import { ApiError } from "@/lib/api-client";

export function applyApiError<TFieldValues extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<TFieldValues>,
  fields: readonly Path<TFieldValues>[],
  fallbackMessage: string
): string {
  if (!(error instanceof ApiError)) {
    return fallbackMessage;
  }

  const allowedFields = new Set<string>(fields);

  for (const fieldError of error.errors) {
    if (allowedFields.has(fieldError.field)) {
      setError(fieldError.field as Path<TFieldValues>, {
        type: "server",
        message: fieldError.message,
      });
    }
  }

  if (error.status >= 500) {
    return fallbackMessage;
  }

  return error.message || fallbackMessage;
}
