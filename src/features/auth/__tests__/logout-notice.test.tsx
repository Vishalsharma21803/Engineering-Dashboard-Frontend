import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { stashUnsaved, unsavedKey } from "@/lib/draft-stash";
import { getGlobalNotices, pushGlobalNotice, stampSession } from "@/lib/global-errors";
import { mockBackend } from "@/test/render";
import { AuthProvider } from "@/providers/auth-provider";
import { UserMenu } from "../components/user-menu";
import { LoginPage } from "../pages/login-page";

const user = { id: "u1", name: "Ada", email: "ada@example.com" };

function renderSignedIn() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={["/"]}>
          <Routes>
            <Route path="/" element={<UserMenu />} />
            <Route path="/login" element={<LoginPage />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

describe("sign-out", () => {
  it("says so when the server could not end the session", async () => {
    const message = "Signed out on this device, but Relay could not end the session on the server. Copies of it stay valid until they expire (within 24 hours).";
    mockBackend([
      { path: "/api/auth/me", body: { user } },
      { method: "POST", path: "/api/auth/logout", body: { message, reason: "SESSION_NOT_REVOKED" } },
    ]);
    renderSignedIn();
    await userEvent.click(await screen.findByRole("button", { name: /sign out/i }));

    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  it("goes to sign-in without a notice after a normal sign-out, and drops unsaved edits", async () => {
    stashUnsaved(unsavedKey("u1", "rulebook:personal"), { content: "draft", baseVersion: 1 });
    mockBackend([
      { path: "/api/auth/me", body: { user } },
      { method: "POST", path: "/api/auth/logout", body: { message: "Logout successful" } },
    ]);
    renderSignedIn();
    await userEvent.click(await screen.findByRole("button", { name: /sign out/i }));

    expect(await screen.findByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem(unsavedKey("u1", "rulebook:personal"))).toBeNull();
  });

  it("drops toasts of the signed-out account, so the next one never sees them", async () => {
    mockBackend([
      { path: "/api/auth/me", body: { user } },
      { method: "POST", path: "/api/auth/logout", body: { message: "Logout successful" } },
    ]);
    renderSignedIn();
    pushGlobalNotice({ tone: "info", title: "Change applied", message: "Comment on #12" }, stampSession());
    await userEvent.click(await screen.findByRole("button", { name: /sign out/i }));

    expect(await screen.findByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(getGlobalNotices()).toEqual([]);
  });
});
