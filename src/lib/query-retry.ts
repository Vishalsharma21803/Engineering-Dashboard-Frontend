import { ApiError } from "@/lib/api-client";

/**
 * Retries once, and only failures a second try can fix: client errors (scope, not found,
 * invalid PAT, 429), timeouts (the server was already slow) and malformed answers do not.
 */
export function retryUnlessClientError(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError) {
    if (error.kind === "timeout" || error.kind === "invalid-response") {
      return false;
    }

    if (error.status >= 400 && error.status < 500) {
      return false;
    }
  }

  return failureCount < 1;
}
