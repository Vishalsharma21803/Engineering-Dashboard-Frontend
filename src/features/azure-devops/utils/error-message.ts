import { ApiError } from "@/lib/api-client";
import { errorMessage } from "@/lib/error-text";

export interface ErrorDescription {
  title: string;
  message: string;
  /** Set when the user can fix the problem by editing the credential. */
  fixCredential: boolean;
}

/** Messages are shown inside sentences ("Could not refresh: … Showing the last loaded data."). */
function sentence(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

/** Turns backend reasons (see backend errors.ts) into guidance. */
export function describeError(error: unknown, fallback = "Something went wrong."): ErrorDescription {
  if (!(error instanceof ApiError)) {
    return { title: "Unexpected error", message: error instanceof Error && error.message ? error.message : fallback, fixCredential: false };
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
        // The server adds why (a timeout, a 5xx…) after the colon.
        message: error.message.includes(": ") ? `${error.message.replace(/\.+$/, "")}. Try again shortly.` : "Azure DevOps could not be reached. Try again shortly.",
        fixCredential: false,
      };
    case "CREDENTIAL_UNREADABLE":
      return { title: "Credential could not be read", message: sentence(errorMessage(error, fallback)), fixCredential: true };
    case "SERVER_RESTARTING":
      return { title: "Server restarting", message: sentence(errorMessage(error, fallback)), fixCredential: false };
    case "SERVER_MISCONFIGURED":
      return { title: "Server not configured", message: sentence(errorMessage(error, fallback)), fixCredential: false };
    case "ROUTE_NOT_FOUND":
      return { title: "Request not recognised", message: sentence(errorMessage(error, fallback)), fixCredential: false };
    case "AI_REQUEST_REJECTED":
      return { title: "AI request rejected", message: sentence(errorMessage(error, fallback)), fixCredential: false };
    case "SOLIDTIME_ADDRESS_BLOCKED":
      return { title: "Solidtime address blocked", message: sentence(errorMessage(error, fallback)), fixCredential: false };
    case "PROJECT_SETUP_NOT_YOURS":
      return { title: "Not your project set-up", message: sentence(errorMessage(error, fallback)), fixCredential: false };
    default:
      break;
  }

  if (error.kind === "timeout") {
    return { title: "No answer in time", message: sentence(errorMessage(error, fallback)), fixCredential: false };
  }

  if (error.kind === "invalid-response") {
    return { title: "Unexpected response", message: sentence(errorMessage(error, fallback)), fixCredential: false };
  }

  if (error.status === 0) {
    return { title: "Server unreachable", message: sentence(errorMessage(error, fallback)), fixCredential: false };
  }

  if (error.status === 404) {
    return { title: "Not found", message: sentence(errorMessage(error, fallback)), fixCredential: false };
  }

  // The server's own message (with the HTTP status when its reason is unknown), never a generic text.
  return {
    title: "Request failed",
    message: sentence(errorMessage(error, fallback)),
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
