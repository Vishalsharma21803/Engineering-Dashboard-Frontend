import { useCallback, useRef } from "react";

import { ApiError } from "@/lib/api-client";

/** The server said no (wrong password, invalid input, sign-up not allowed): worth a shake. Network and server faults are not. */
export function isRefusal(error: unknown): boolean {
  return error instanceof ApiError && error.status >= 400 && error.status < 500;
}

/**
 * Shakes an element once (the .auth-shake animation, motion permitting), e.g. when a sign-in is refused.
 * Replays on every call without remounting, so the form keeps what was typed.
 */
export function useShake<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  const shake = useCallback(() => {
    const element = ref.current;
    if (!element) return;
    element.classList.remove("auth-shake");
    // Reading layout restarts the animation when the same class is added again.
    void element.offsetWidth;
    element.classList.add("auth-shake");
  }, []);

  return [ref, shake] as const;
}
