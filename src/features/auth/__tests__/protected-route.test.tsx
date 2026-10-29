import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { AuthProvider } from "@/providers/auth-provider";
import { mockBackend } from "@/test/render";
import { ProtectedRoute } from "../components/protected-route";

const user = { id: "u1", name: "Ada", email: "ada@example.com" };

function renderApp() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={["/"]}>
          <Routes>
            <Route path="/login" element={<p>Login page</p>} />
            <Route element={<ProtectedRoute />}>
              <Route index element={<p>Signed-in home</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

describe("ProtectedRoute session check", () => {
  it("shows a retry screen instead of signing out when /api/auth/me fails with a server error", async () => {
    mockBackend([{ path: "/api/auth/me", status: 500, body: { message: "Database down" } }]);
    renderApp();

    expect(await screen.findByRole("heading", { name: "Your session could not be checked" })).toBeInTheDocument();
    expect(screen.queryByText("Login page")).not.toBeInTheDocument();

    mockBackend([{ path: "/api/auth/me", body: { user } }]);
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Signed-in home")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the retry screen when the server cannot be reached at all", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    renderApp();

    expect(await screen.findByRole("heading", { name: "Your session could not be checked" })).toBeInTheDocument();
    expect(screen.queryByText("Login page")).not.toBeInTheDocument();
  });

  it("still sends a 401 to the sign-in page", async () => {
    mockBackend([{ path: "/api/auth/me", status: 401, body: { message: "Not signed in" } }]);
    renderApp();

    expect(await screen.findByText("Login page")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Your session could not be checked" })).not.toBeInTheDocument();
  });
});
