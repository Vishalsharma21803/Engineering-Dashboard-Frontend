import type { ApiErrorPayload, ApiFieldError } from "@/types/api";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(
  /\/+$/,
  ""
);

export const UNAUTHORIZED_EVENT = "auth:unauthorized";

export class ApiError extends Error {
  readonly status: number;
  readonly errors: ApiFieldError[];

  constructor(
    status: number,
    message: string,
    errors: ApiFieldError[] = []
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errors = errors;
  }
}

export type ApiRequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
};

export async function apiRequest<TResponse>(
  path: string,
  options: ApiRequestOptions = {}
): Promise<TResponse> {
  const { body, headers, ...requestInit } = options;
  const requestHeaders = new Headers(headers);
  const isFormData = body instanceof FormData;

  if (body !== undefined && !isFormData && !requestHeaders.has("Content-Type")) {
    requestHeaders.set("Content-Type", "application/json");
  }

  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      credentials: "include",
      ...requestInit,
      headers: requestHeaders,
      body:
        body === undefined
          ? undefined
          : isFormData
            ? body
            : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Unable to reach the server");
  }

  if (response.status === 204) {
    return undefined as TResponse;
  }

  const contentType = response.headers.get("content-type") ?? "";
  let payload: unknown = null;

  if (contentType.toLowerCase().includes("application/json")) {
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const errorPayload = payload as ApiErrorPayload | null;

    if (
      response.status === 401 &&
      !path.startsWith("/api/auth/") &&
      typeof window !== "undefined"
    ) {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }

    throw new ApiError(
      response.status,
      errorPayload?.message ?? "Request failed",
      errorPayload?.errors ?? []
    );
  }

  return payload as TResponse;
}
