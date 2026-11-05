import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router-dom";

import { RootLayout } from "@/components/layout/root-layout";
import { RouteError } from "@/components/layout/route-error";
import { AuthContext } from "@/features/auth/context/auth-context";

function Boom(): never {
  throw new Error("Cannot read properties of undefined (reading 'rows')");
}

function ChunkBoom(): never {
  throw new TypeError("Failed to fetch dynamically imported module: https://relay.example/assets/dashboard-page-1a2b.js");
}

/** Vite's own error when a page's stylesheet is gone after a deploy. */
function CssChunkBoom(): never {
  throw new Error("Unable to preload CSS for /assets/dashboard-page-1a2b.css");
}

/** Stands in for AzureLayout: a header that must survive a crash in the page under it. */
function AppLayout() {
  return (
    <div>
      <p>Relay header</p>
      <Outlet />
    </div>
  );
}

function renderAt(path: string, layout: ReactElement = <RootLayout />) {
  const router = createMemoryRouter(
    [
      {
        element: layout,
        errorElement: <RouteError fullPage />,
        children: [
          {
            errorElement: <RouteError />,
            children: [
              { path: "/", element: <Boom /> },
              { path: "/chunk", element: <ChunkBoom /> },
              { path: "/css-chunk", element: <CssChunkBoom /> },
              {
                path: "/azure",
                element: <AppLayout />,
                children: [{ errorElement: <RouteError />, children: [{ index: true, element: <Boom /> }] }],
              },
            ],
          },
        ],
      },
    ],
    { initialEntries: [path] }
  );
  const user = { id: "u1", name: "Ada", email: "ada@example.com" };

  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthContext.Provider value={{ user, isAuthenticated: true, isLoading: false }}>
        <RouterProvider router={router} />
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RouteError", () => {
  it("replaces only the crashed page: the navigation stays, with the real message and a way out", async () => {
    renderAt("/");

    expect(await screen.findByText("This page crashed")).toBeInTheDocument();
    expect(screen.getByText("Cannot read properties of undefined (reading 'rows')")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go home" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("button", { name: "Copy details" })).toBeInTheDocument();
  });

  it("keeps the Relay header when a page under it crashes", async () => {
    renderAt("/azure");

    expect(await screen.findByText("This page crashed")).toBeInTheDocument();
    expect(screen.getByText("Relay header")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument();
  });

  it("offers Reload when a page's code could not be loaded after an update", async () => {
    renderAt("/chunk");

    expect(await screen.findByText("A new version of Relay is available")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("offers Reload when a page's stylesheet could not be loaded after an update", async () => {
    renderAt("/css-chunk");

    expect(await screen.findByText("A new version of Relay is available")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
  });

  it("still shows a card when the layout itself crashes", async () => {
    renderAt("/", <Boom />);

    expect(await screen.findByText("This page crashed")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Primary" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go home" })).toHaveAttribute("href", "/");
  });
});
