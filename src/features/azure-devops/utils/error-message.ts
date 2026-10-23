import { ApiError } from "@/lib/api-client";

export interface ErrorDescription {
  title: string;
  message: string;
  /** Set when the user can fix the problem by editing the credential. */
  fixCredential: boolean;
}

/** Turns backend reasons (see backend errors.ts) into guidance. */
export function describeError(error: unknown, fallback = "Something went wrong."): ErrorDescription {
  if (!(error instanceof ApiError)) {
    return { title: "Unexpected error", message: fallback, fixCredential: false };
  }

  switch (error.reason) {
    case "AZURE_PAT_INVALID":
      return {
        title: "PAT rejected by Azure DevOps",
        message: "The personal access token is invalid, expired, or revoked. Update the credential with a new PAT.",
        fixCredential: true,
      };
    case "AZURE_INSUFFICIENT_SCOPE":
      return {
        title: "Missing PAT permission",
        message: "The PAT does not include the scope needed for this data or change.",
        fixCredential: true,
      };
    case "AZURE_THROTTLED":
      return {
        title: "Azure DevOps is rate limiting",
        message: "Too many requests right now. Wait a moment and refresh.",
        fixCredential: false,
      };
    case "AZURE_UPSTREAM_ERROR":
      return {
        title: "Azure DevOps unavailable",
        message: "Azure DevOps could not be reached. Try again shortly.",
        fixCredential: false,
      };
    default:
      break;
  }

  if (error.status === 0) {
    return { title: "Server unreachable", message: error.message, fixCredential: false };
  }

  if (error.status === 404) {
    return { title: "Not found", message: error.message, fixCredential: false };
  }

  return {
    title: "Request failed",
    message: error.status >= 500 && !error.reason ? fallback : error.message,
    fixCredential: false,
  };
}

export const SCOPE_HINTS: Record<string, string> = {
  project: "Project and Team (Read)",
  work: "Work Items (Read)",
  code: "Code (Read)",
  build: "Build (Read)",
  release: "Release (Read)",
  environment: "Environment (Read & manage)",
};
