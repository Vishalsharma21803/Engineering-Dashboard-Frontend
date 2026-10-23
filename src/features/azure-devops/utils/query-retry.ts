import { ApiError } from "@/lib/api-client";

/** Client errors (scope, not found, invalid PAT) do not get better on retry. */
export function retryUnlessClientError(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
    return false;
  }

  return failureCount < 1;
}
