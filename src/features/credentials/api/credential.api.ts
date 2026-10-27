import { apiRequest } from "@/lib/api-client";
import type {
  CredentialListResponse,
  CredentialResponse,
  DeleteCredentialResponse,
  UpdateCredentialInput,
  ValidateCredentialResponse,
} from "../types/credential.types";

export async function listCredentials() {
  const response = await apiRequest<CredentialListResponse>(
    "/api/credentials"
  );

  return response.credentials;
}

export async function updateCredential(
  id: string,
  input: UpdateCredentialInput
) {
  const response = await apiRequest<CredentialResponse>(
    `/api/credentials/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: input,
    }
  );

  return response.credential;
}

export async function deleteCredential(id: string): Promise<void> {
  await apiRequest<DeleteCredentialResponse>(
    `/api/credentials/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
    }
  );
}

export async function validateCredential(
  id: string
): Promise<ValidateCredentialResponse> {
  return apiRequest<ValidateCredentialResponse>(
    `/api/credentials/${encodeURIComponent(id)}/validate`,
    {
      method: "POST",
    }
  );
}
