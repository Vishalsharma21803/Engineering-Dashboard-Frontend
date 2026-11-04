import { useCallback, useContext, useEffect, useRef, useState } from "react";

import { AuthContext } from "@/features/auth/context/auth-context";
import { dropUnsaved, readUnsaved, stashUnsaved, unsavedGeneration, unsavedKey } from "@/lib/draft-stash";

const WRITE_DELAY_MS = 400;

/** The edits kept for the signed-in user under `name`, read once when the editor opens. */
export function useKeptUnsaved<T>(name: string, maxAgeMs?: number): T | null {
  const userId = useContext(AuthContext)?.user?.id ?? null;
  const [kept] = useState(() => (userId ? (readUnsaved<T>(unsavedKey(userId, name), maxAgeMs)?.value ?? null) : null));
  return kept;
}

/**
 * Keeps `value` (unsaved edits) for the signed-in user under `name` while it is not null.
 * Writes are debounced and flushed on unmount, so a session expiry that unmounts the
 * editor still keeps the last keystrokes. Null drops a stash this editor wrote; a stash
 * from before (to be restored) is only dropped by `drop()`. Edits typed before a sign-out
 * are never written after it.
 */
export function useUnsavedStash<T>(name: string, value: T | null, maxAgeMs?: number) {
  const userId = useContext(AuthContext)?.user?.id ?? null;
  const key = userId ? unsavedKey(userId, name) : null;
  const pending = useRef<{ key: string; value: T; generation: number } | null>(null);
  const wrote = useRef<string | null>(null);

  const flush = useCallback(() => {
    if (pending.current && pending.current.generation !== unsavedGeneration()) {
      pending.current = null;
    }

    if (pending.current) {
      stashUnsaved(pending.current.key, pending.current.value);
      wrote.current = pending.current.key;
      pending.current = null;
    }
  }, []);

  useEffect(() => {
    // Another day or scope: keep what was typed under the previous one.
    if (pending.current && pending.current.key !== key) {
      flush();
    }

    if (!key) {
      return;
    }

    if (value === null) {
      pending.current = null;

      if (wrote.current === key) {
        dropUnsaved(key);
        wrote.current = null;
      }
      return;
    }

    pending.current = { key, value, generation: unsavedGeneration() };
    const timer = window.setTimeout(flush, WRITE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [key, value, flush]);

  // Flush on unmount (e.g. the redirect to sign-in after a 401).
  useEffect(() => flush, [flush]);

  const read = useCallback(() => (key ? readUnsaved<T>(key, maxAgeMs) : null), [key, maxAgeMs]);
  const drop = useCallback(() => {
    pending.current = null;

    if (key) {
      dropUnsaved(key);
    }
  }, [key]);

  return { read, drop };
}
