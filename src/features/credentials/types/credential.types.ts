export type CredentialPlatform = "AZURE" | "SOLIDTIME";

export type ValidationStatus = "VALID" | "INVALID" | "ERROR";

export type PatValidationReason =
  | "INVALID_PAT"
  | "INSUFFICIENT_SCOPE"
  | "ORGANIZATION_NOT_FOUND";

export interface Credential {
  id: string;
  platform: CredentialPlatform;
  organizationUrl: string;
  label: string | null;
  lastValidatedAt: string | null;
  lastValidationStatus: ValidationStatus | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateCredentialInput {
  organizationUrl?: string;
  label?: string | null;
  patToken?: string;
}

export interface CredentialListResponse {
  credentials: Credential[];
}

export interface CredentialResponse {
  message: string;
  credential: Credential;
}

export interface DeleteCredentialResponse {
  message: string;
}

export interface ValidateCredentialResponse {
  valid: boolean;
  reason?: PatValidationReason;
  lastValidatedAt: string | null;
}
