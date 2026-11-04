import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

import { apiRequest } from "@/lib/api-client";
import { getGlobalNotices, pushGlobalNotice, stampSession } from "@/lib/global-errors";
import { AuthProvider } from "@/providers/auth-provider";
import { ProtectedRoute } from "../components/protected-route";
import { LoginPage } from "../pages/login-page";
import { clearSessionExpired } from "../utils/session-expiry";

const user = { id: "u1", name: "Ada", email: "ada@example.com" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** The signed-in page: it reads private data; the session may expire under it. */
function PrivatePage() {
  const location = useLocation();
  const data = useQuery({ queryKey: ["credentials"], queryFn: () => apiRequest<{ ok: boolean }>("/api/credentials") });
  return (
    <p>
      Private {location.pathname}
      {location.search} {data.data?.ok ? "loaded" : ""}
    </p>
  );
}

/** Answers like the backend: the session can be ended (401s) and started again by signing in. */
function backend() {
  const session: { valid: boolean; holdMe?: Array<() => void> } = { valid: true };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/auth/login")) {
        session.valid = true;
        return json({ message: "Signed in", user });
      }
      if (url.endsWith("/api/auth/me") && session.holdMe) {
        // Answered later with what the session was when the check started.
        const validWhenAsked = session.valid;
        await new Promise<void>((resolve) => session.holdMe!.push(resolve));
        return validWhenAsked ? json({ user }) : json({ message: "Not signed in", reason: "AUTH_REQUIRED" }, 401);
      }
      if (!session.valid) return json({ message: "Not signed in", reason: "AUTH_REQUIRED" }, 401);
      if (url.endsWith("/api/auth/me")) return json({ user });
      void init;
      return json({ ok: true });
    })
  );
  return session;
}

function renderApp(route: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={[route]}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/x" element={<PrivatePage />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
  return queryClient;
}

afterEach(() => {
  clearSessionExpired();
  window.sessionStorage.clear();
});

describe("session expiry", () => {
  it("says the session expired and returns to the same page, filters included, after signing in", async () => {
    const session = backend();
    const queryClient = renderApp("/x?project=a&page=2");
    expect(await screen.findByText(/loaded/)).toBeInTheDocument();

    // The session ends on the server; the next private read gets a 401.
    session.valid = false;
    await queryClient.refetchQueries({ queryKey: ["credentials"] });

    expect(await screen.findByText("Your session expired. Sign in again to continue where you were.")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Email"), "ada@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "correct horse");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Private /x?project=a&page=2 loaded")).toBeInTheDocument();
  });

  it("treats a 401 when the session is checked again as an expired session too", async () => {
    const session = backend();
    const queryClient = renderApp("/x");
    expect(await screen.findByText(/loaded/)).toBeInTheDocument();

    session.valid = false;
    await queryClient.refetchQueries({ queryKey: ["auth", "me"] });

    expect(await screen.findByText("Your session expired. Sign in again to continue where you were.")).toBeInTheDocument();
    // Private data read with the old session is gone.
    expect(queryClient.getQueryData(["credentials"])).toBeUndefined();
  });

  it("drops toasts of the ended session", async () => {
    const session = backend();
    const queryClient = renderApp("/x");
    expect(await screen.findByText(/loaded/)).toBeInTheDocument();
    pushGlobalNotice({ tone: "error", title: "The change failed", message: "Azure DevOps rejected the change" }, stampSession());

    session.valid = false;
    await queryClient.refetchQueries({ queryKey: ["credentials"] });

    expect(await screen.findByText("Your session expired. Sign in again to continue where you were.")).toBeInTheDocument();
    expect(getGlobalNotices()).toEqual([]);
  });

  it("does not sign a new session out when a session check from before signing in answers late", async () => {
    const session = backend();
    session.valid = false;
    const queryClient = renderApp("/x");
    expect(await screen.findByRole("button", { name: "Sign in" })).toBeInTheDocument();

    // A check (e.g. on reconnect) starts while signed out and is still running when sign-in succeeds.
    session.holdMe = [];
    void queryClient.refetchQueries({ queryKey: ["auth", "me"] });
    await vi.waitFor(() => expect(session.holdMe).toHaveLength(1));
    await userEvent.type(screen.getByLabelText("Email"), "ada@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "correct horse");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Private /x loaded")).toBeInTheDocument();

    // Its 401 belongs to the signed-out state before.
    await act(async () => session.holdMe!.shift()!());
    await act(async () => {});

    expect(screen.getByText("Private /x loaded")).toBeInTheDocument();
    expect(screen.queryByText(/Your session expired/)).not.toBeInTheDocument();
    expect(queryClient.getQueryData(["auth", "me"])).toEqual(user);
  });

  it("does not say the session expired when nobody was signed in", async () => {
    const session = backend();
    session.valid = false;
    renderApp("/x");
    expect(await screen.findByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByText(/Your session expired/)).not.toBeInTheDocument();
  });
});
