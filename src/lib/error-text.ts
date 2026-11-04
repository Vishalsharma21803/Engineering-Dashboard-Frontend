import { ApiError } from "@/lib/api-client";

/**
 * Backend reasons (see backend app-error.ts and the Azure/Solidtime/AI error classes) whose
 * server message is written for users, so it is shown as is. A missing reason, a generic one
 * (INTERNAL_ERROR, UPSTREAM_ERROR, SERVICE_UNAVAILABLE, NOT_FOUND) or one this list does not
 * know gets "(HTTP n)" appended, so an unexpected failure can still be told apart.
 */
const KNOWN_REASON_PREFIXES = ["AZURE_", "SOLIDTIME_", "AI_", "RULE_", "RULEBOOK_", "TIMER_", "ACTION_", "ENTRY_", "CREDENTIAL_"];
const KNOWN_REASONS = new Set([
  // Contract 1 (production fixes).
  "SIGNUP_NOT_ALLOWED",
  "PROJECT_SETUP_NOT_YOURS",
  "SERVER_RESTARTING",
  "ROUTE_NOT_FOUND",
  "EMAIL_ALREADY_REGISTERED",
  "SERVER_MISCONFIGURED",
  "AUTH_REQUIRED",
  "INVALID_CREDENTIALS",
  "SESSION_NOT_REVOKED",
  // Existing domain reasons.
  "USER_NOT_FOUND",
  "TOO_MANY_REQUESTS",
  "PAYLOAD_TOO_LARGE",
  "UNSUPPORTED_MEDIA_TYPE",
  "INVALID_JSON",
  "INVALID_PAT",
  "INSUFFICIENT_SCOPE",
  "ORGANIZATION_NOT_FOUND",
  "PLATFORM_NOT_FOUND",
  "NOTIFICATION_NOT_FOUND",
  "TRIAGE_MARK_NOT_FOUND",
  "SOP_REPORT_NOT_FOUND",
  "SOP_ADMIN_REQUIRED",
  "SOP_PROJECT_NOT_SET_UP",
  "PROJECT_NOT_SET_UP",
  "PROJECT_NOT_CONFIGURED",
  "PROJECT_SAVE_FAILED",
  "SECTION_UNAVAILABLE",
  "NO_AI_RULES",
  "DAILY_LIMIT_REACHED",
  "DATA_COLLECTION_NOT_ACCEPTED",
  "DRAFT_DAY_OUT_OF_RANGE",
  "ENTRIES_OVERLAP",
  "NOTHING_TO_ESTIMATE",
  "NOTHING_TO_CHANGE",
]);

function isKnownReason(reason: string | null): boolean {
  return reason !== null && (KNOWN_REASONS.has(reason) || KNOWN_REASON_PREFIXES.some((prefix) => reason.startsWith(prefix)));
}

/** Fixed wording for reasons where the server's text may be missing or too terse. */
const REASON_TEXT: Record<string, string> = {
  SIGNUP_NOT_ALLOWED: "Sign-up is by invitation only. Ask the Cockpit owner to add your email.",
  PROJECT_SETUP_NOT_YOURS: "Only the person who set up this project or an SOP owner can change it.",
  SERVER_RESTARTING: "The server is restarting. Try again in a moment.",
  ROUTE_NOT_FOUND: "The server does not know this request. The app may be out of date; reload the page.",
  AI_REQUEST_REJECTED: "The AI provider rejected this request. Change the model or settings; it will not be retried automatically.",
  SOLIDTIME_ADDRESS_BLOCKED: "That Solidtime address is not allowed. Use the public address of your Solidtime server.",
  EMAIL_ALREADY_REGISTERED: "Email is already registered. Sign in instead.",
  CREDENTIAL_ALREADY_EXISTS: "A credential with these details already exists.",
  CREDENTIAL_UNREADABLE: "The stored credential could not be read. Enter its secret again.",
  SERVER_MISCONFIGURED: "The server is not configured correctly. Ask the Cockpit owner to check its settings.",
};

export const NETWORK_ERROR_TEXT = "Unable to reach the server. Check your connection.";

/**
 * The one way every surface turns a failure into text: the server's own message (it is
 * already redacted server-side), with the HTTP status when the reason is missing or unknown.
 */
export function errorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) {
    return error instanceof Error && error.message ? error.message : fallback;
  }

  if (error.kind === "network") {
    return NETWORK_ERROR_TEXT;
  }

  // Timeout and invalid-response texts are written by the client and complete.
  if (error.kind !== "http") {
    return error.message || fallback;
  }

  const known = isKnownReason(error.reason);
  const message = error.message || (error.reason ? REASON_TEXT[error.reason] : undefined) || fallback;

  if (known || message.includes(`HTTP ${error.status}`)) {
    return message;
  }

  return `${message.replace(/\.+$/, "")} (HTTP ${error.status})`;
}
