import type {
  Credential,
  PatValidationReason,
} from "../types/credential.types";

export function getCredentialDisplayName(
  credential: Pick<Credential, "label" | "organizationUrl">
): string {
  if (credential.label) {
    return credential.label;
  }

  try {
    const url = new URL(credential.organizationUrl);

    if (url.hostname === "dev.azure.com") {
      const organization = url.pathname.split("/").filter(Boolean)[0];

      return organization ? `${organization}` : "Azure DevOps";
    }

    if (url.hostname.endsWith(".visualstudio.com")) {
      return url.hostname.slice(0, -".visualstudio.com".length);
    }
  } catch {
    return "Azure DevOps";
  }

  return "Azure DevOps";
}

export function formatDateTime(value: string | null): string {
  if (!value) {
    return "Never";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function getValidationReasonMessage(
  reason: PatValidationReason | undefined
): string {
  switch (reason) {
    case "INVALID_PAT":
      return "Azure DevOps rejected this PAT. Check that it is valid, not expired, and has not been revoked.";
    case "INSUFFICIENT_SCOPE":
      return "The PAT is valid but lacks the required scope. Grant at least Projects (Read) access.";
    case "ORGANIZATION_NOT_FOUND":
      return "Azure DevOps could not find this organization. Check the organization URL.";
    default:
      return "Azure DevOps could not validate this credential.";
  }
}
