import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { mockBackend } from "@/test/render";
import { useDeleteCredential } from "../hooks/use-delete-credential";

const id = "c1";
const other = "c2";

describe("useDeleteCredential", () => {
  it("drops everything cached under the deleted credential, Azure DevOps and Solidtime alike", async () => {
    mockBackend([{ method: "DELETE", path: `/api/credentials/${id}`, body: { message: "Deleted" } }]);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const seeded = [
      ["azure", id, "dashboard", "all"],
      ["triage", id],
      ["notifications", id, "all", "token"],
      ["sop", "projects", "azure", id],
      ["sop", "ai", id, "101"],
      ["sop", "report", id, "p1", "runs"],
      ["solidtime", id, "timer"],
      ["solidtime", id, "draft", "2026-11-04"],
      ["solidtime", "memberships", id],
    ];
    for (const key of seeded) queryClient.setQueryData(key, { cached: true });
    queryClient.setQueryData(["azure", other, "dashboard", "all"], { cached: true });
    queryClient.setQueryData(["solidtime", other, "timer"], { cached: true });

    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useDeleteCredential(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(id);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    for (const key of seeded) expect(queryClient.getQueryData(key)).toBeUndefined();
    // Other credentials keep their data.
    expect(queryClient.getQueryData(["azure", other, "dashboard", "all"])).toEqual({ cached: true });
    expect(queryClient.getQueryData(["solidtime", other, "timer"])).toEqual({ cached: true });
  });
});
