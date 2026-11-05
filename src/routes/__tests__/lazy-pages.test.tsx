import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { lazy } from "react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RootLayout } from "@/components/layout/root-layout";
import { RouteError } from "@/components/layout/route-error";
import { AuthContext } from "@/features/auth/context/auth-context";

const LoadedPage = lazy(() => Promise.resolve({ default: () => <h1>Loaded page</h1> }));
const MissingPage = lazy(() => Promise.reject(new TypeError("Failed to fetch dynamically imported module: https://relay.example/assets/time-page-9z.js")));

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      {
        element: <RootLayout />,
        errorElement: <RouteError fullPage />,
        children: [
          {
            errorElement: <RouteError />,
            children: [
              { path: "/", element: <LoadedPage /> },
              { path: "/missing", element: <MissingPage /> },
            ],
          },
        ],
      },
    ],
    { initialEntries: [path] }
  );

  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthContext.Provider value={{ user: { id: "u1", name: "Ada", email: "ada@example.com" }, isAuthenticated: true, isLoading: false }}>
        <RouterProvider router={router} />
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("lazily loaded pages", () => {
  it("show the page once its file has loaded, inside the layout", async () => {
    renderAt("/");

    expect(await screen.findByRole("heading", { name: "Loaded page" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument();
  });

  it("offer Reload when the page's file cannot be loaded (after a deploy), keeping the navigation", async () => {
    renderAt("/missing");

    expect(await screen.findByText("A new version of Relay is available")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument();
  });
});
