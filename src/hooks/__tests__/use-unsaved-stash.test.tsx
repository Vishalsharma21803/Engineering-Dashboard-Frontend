import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthContext } from "@/features/auth/context/auth-context";
import { dropAllUnsaved, unsavedKey } from "@/lib/draft-stash";
import { useUnsavedStash } from "../use-unsaved-stash";

const user = { id: "u1", name: "Ada", email: "ada@example.com" };
const key = unsavedKey("u1", "rulebook:personal");

function wrapper({ children }: { children: ReactNode }) {
  return <AuthContext.Provider value={{ user, isAuthenticated: true, isLoading: false }}>{children}</AuthContext.Provider>;
}

afterEach(() => {
  vi.useRealTimers();
  window.sessionStorage.clear();
});

describe("useUnsavedStash", () => {
  it("keeps the last keystrokes when the editor closes (a session that expired)", () => {
    vi.useFakeTimers();
    const { rerender, unmount } = renderHook(({ value }) => useUnsavedStash("rulebook:personal", value), { wrapper, initialProps: { value: "a" } });
    rerender({ value: "ab" });
    unmount();
    expect(JSON.parse(window.sessionStorage.getItem(key)!).value).toBe("ab");
  });

  it("does not write edits typed before a sign-out after it", () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() => useUnsavedStash("rulebook:personal", "typed just now"), { wrapper });
    // Signed out inside the write delay; the editor then closes.
    dropAllUnsaved();
    act(() => vi.advanceTimersByTime(1_000));
    unmount();
    expect(window.sessionStorage.getItem(key)).toBeNull();
  });
});
