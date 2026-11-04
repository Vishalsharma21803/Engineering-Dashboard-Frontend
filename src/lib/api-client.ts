import type { ApiErrorPayload, ApiFieldError } from "@/types/api";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(
  /\/+$/,
  ""
);

export const UNAUTHORIZED_EVENT = "auth:unauthorized";

/** What failed: no answer at all, no answer in time, an error status, or a 2xx that is not the JSON promised. */
export type ApiErrorKind = "network" | "timeout" | "http" | "invalid-response";

export class ApiError extends Error {
  readonly status: number;
  readonly errors: ApiFieldError[];
  readonly reason: string | null;
  readonly payload: unknown;
  readonly kind: ApiErrorKind;

  constructor(
    status: number,
    message: string,
    errors: ApiFieldError[] = [],
    reason: string | null = null,
    payload: unknown = null,
    kind: ApiErrorKind = status === 0 ? "network" : "http"
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errors = errors;
    this.reason = reason;
    this.payload = payload;
    this.kind = kind;
  }
}

/** Client budgets (contract 3): heavy reads and AI/write calls pass a longer `timeoutMs`. */
export const GET_TIMEOUT_MS = 30_000;
export const WRITE_TIMEOUT_MS = 60_000;

export type ApiRequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  /** Defaults: 30 s for GET, 60 s for every other method. */
  timeoutMs?: number;
  /** Replaces the default timeout text, e.g. for a change that may still have run on the server. */
  timeoutMessage?: string;
};

/*
 * A 401 from a request that started before a sign-in/sign-out belongs to the old
 * session; it must not sign the new one out. Every request remembers the epoch it began in.
 */
let sessionEpoch = 0;

export function bumpSessionEpoch(): void {
  sessionEpoch += 1;
}

export function currentSessionEpoch(): number {
  return sessionEpoch;
}

function signalUnauthorized(path: string, startedInEpoch: number): void {
  if (
    !path.startsWith("/api/auth/") &&
    startedInEpoch === sessionEpoch &&
    typeof window !== "undefined"
  ) {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  }
}

function defaultTimeoutText(timeoutMs: number): string {
  return `The server did not answer within ${Math.round(timeoutMs / 1000)} s. Check your connection and try again.`;
}

/** Timeout text for a POST that creates or starts something: retrying blindly could do it twice. */
export function stillRunningTimeoutText(timeoutMs: number): string {
  return `The server did not answer in ${Math.round(timeoutMs / 1000)} s. It may still be running — check before trying again.`;
}

/** AbortSignal.any where available, otherwise the same by hand. */
function eitherSignal(first: AbortSignal, second: AbortSignal): AbortSignal {
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([first, second]);
  }

  const controller = new AbortController();
  const abort = () => controller.abort();

  if (first.aborted || second.aborted) {
    controller.abort();
  } else {
    first.addEventListener("abort", abort, { once: true });
    second.addEventListener("abort", abort, { once: true });
  }

  return controller.signal;
}

/**
 * Runs one request under a timeout that also covers reading the body. setTimeout +
 * AbortController (not AbortSignal.timeout) so fake timers drive it in tests. A caller's
 * own abort is rethrown untouched, so TanStack treats it as a cancellation.
 */
async function withTimeout<T>(
  callerSignal: AbortSignal | null | undefined,
  timeoutMs: number,
  timeoutMessage: string,
  run: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const timer = new AbortController();
  const timeoutId = setTimeout(() => timer.abort(), timeoutMs);
  const signal = callerSignal ? eitherSignal(callerSignal, timer.signal) : timer.signal;

  try {
    return await run(signal);
  } catch (error) {
    if (timer.signal.aborted && !callerSignal?.aborted) {
      throw new ApiError(0, timeoutMessage, [], null, null, "timeout");
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function send(path: string, init: RequestInit, signal: AbortSignal): Promise<Response> {
  try {
    return await fetch(`${API_BASE_URL}${path}`, { credentials: "include", ...init, signal });
  } catch (error) {
    // An abort (caller or timeout) is decided by withTimeout; anything else is the network.
    if (signal.aborted) {
      throw error;
    }

    throw new ApiError(0, "Unable to reach the server", [], null, null, "network");
  }
}

/** Reads a body; a connection lost halfway is a network error like a failed fetch, not a raw TypeError. */
async function readBody<T>(read: () => Promise<T>, signal: AbortSignal): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (signal.aborted) {
      throw error;
    }

    throw new ApiError(0, "The connection was lost while reading the server's answer", [], null, null, "network");
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/** Error bodies are read tolerantly: a proxy's HTML page or an empty body still yields a message with the status. */
async function errorFromResponse(response: Response, fallback: string, signal: AbortSignal): Promise<ApiError> {
  const text = await readBody(() => response.text(), signal);
  const isJson = (response.headers.get("content-type") ?? "").toLowerCase().includes("application/json");
  const parsed = isJson && text ? parseJson(text) : undefined;
  const payload = parsed && typeof parsed === "object" ? (parsed as ApiErrorPayload) : null;
  const message =
    typeof payload?.message === "string" && payload.message
      ? payload.message
      : `${response.statusText || fallback} (HTTP ${response.status})`;

  return new ApiError(
    response.status,
    message,
    Array.isArray(payload?.errors) ? payload.errors : [],
    typeof payload?.reason === "string" ? payload.reason : null,
    payload
  );
}

export async function apiRequest<TResponse>(
  path: string,
  options: ApiRequestOptions = {}
): Promise<TResponse> {
  const { body, headers, signal: callerSignal, timeoutMs, timeoutMessage, ...requestInit } = options;
  const requestHeaders = new Headers(headers);
  const isFormData = body instanceof FormData;
  const isGet = (requestInit.method ?? "GET").toUpperCase() === "GET";
  const budget = timeoutMs ?? (isGet ? GET_TIMEOUT_MS : WRITE_TIMEOUT_MS);
  const startedInEpoch = sessionEpoch;

  if (body !== undefined && !isFormData && !requestHeaders.has("Content-Type")) {
    requestHeaders.set("Content-Type", "application/json");
  }

  return withTimeout(callerSignal, budget, timeoutMessage ?? defaultTimeoutText(budget), async (signal) => {
    const response = await send(
      path,
      {
        ...requestInit,
        headers: requestHeaders,
        body:
          body === undefined
            ? undefined
            : isFormData
              ? body
              : JSON.stringify(body),
      },
      signal
    );

    if (!response.ok) {
      if (response.status === 401) {
        signalUnauthorized(path, startedInEpoch);
      }

      throw await errorFromResponse(response, "Request failed", signal);
    }

    // An empty success (204, or any 2xx without a body) is `undefined`; a body must be JSON.
    const text = await readBody(() => response.text(), signal);

    if (text === "") {
      return undefined as TResponse;
    }

    const contentType = response.headers.get("content-type") ?? "";
    const payload = contentType.toLowerCase().includes("application/json") ? parseJson(text) : undefined;

    if (payload === undefined) {
      throw new ApiError(
        response.status,
        `The server sent an unexpected response (HTTP ${response.status}, ${contentType.split(";")[0] || "no content type"}).`,
        [],
        "INVALID_RESPONSE",
        null,
        "invalid-response"
      );
    }

    return payload as TResponse;
  });
}

/** Downloads a file the API produces (e.g. a CSV export) with the session cookie. */
export async function apiDownload(path: string, options: { timeoutMs?: number; signal?: AbortSignal } = {}): Promise<Blob> {
  const budget = options.timeoutMs ?? GET_TIMEOUT_MS;
  const startedInEpoch = sessionEpoch;

  return withTimeout(options.signal, budget, defaultTimeoutText(budget), async (signal) => {
    const response = await send(path, {}, signal);

    if (!response.ok) {
      if (response.status === 401) {
        signalUnauthorized(path, startedInEpoch);
      }

      throw await errorFromResponse(response, "Download failed", signal);
    }

    return readBody(() => response.blob(), signal);
  });
}
