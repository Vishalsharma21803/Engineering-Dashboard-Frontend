import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { useDashboard } from "../hooks/use-dashboard";
import { CREDENTIAL_ID, dashboard } from "./fixtures";

describe("useDashboard refresh", () => {
  it("asks the server for fresh data even while a normal load is still running", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        urls.push(url);
        // The first (cached) load hangs; the refresh answers.
        return url.includes("refresh=")
          ? Promise.resolve(new Response(JSON.stringify({ dashboard }), { headers: { "content-type": "application/json" } }))
          : new Promise<Response>(() => undefined);
      })
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useDashboard(CREDENTIAL_ID, undefined), { wrapper });
    await waitFor(() => expect(urls).toHaveLength(1));

    await act(async () => {
      await result.current.refresh();
    });

    expect(urls[1]).toContain("refresh=1");
    await waitFor(() => expect(result.current.data).toEqual(dashboard));
  });
});
