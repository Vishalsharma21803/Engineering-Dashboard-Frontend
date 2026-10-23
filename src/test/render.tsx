import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { vi } from "vitest";

export function renderWithProviders(ui: ReactElement, { path = "/", route = "/" } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path={path} element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

export interface MockRoute {
  method?: string;
  path: string | RegExp;
  status?: number;
  body: unknown;
}

/** Stubs fetch with canned backend responses and records every call. */
export function mockBackend(routes: MockRoute[]) {
  const calls: Array<{ method: string; url: string; body: unknown }> = [];

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : null });

    const route = routes.find(
      (candidate) =>
        (candidate.method ?? "GET") === method &&
        (typeof candidate.path === "string" ? url.split("?")[0] === candidate.path : candidate.path.test(url))
    );

    if (!route) {
      return new Response(JSON.stringify({ message: `No mock for ${method} ${url}` }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response(JSON.stringify(route.body), {
      status: route.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  });

  vi.stubGlobal("fetch", fetchMock);
  return calls;
}
