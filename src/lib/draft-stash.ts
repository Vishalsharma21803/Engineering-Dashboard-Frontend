/*
 * Unsaved edits kept in sessionStorage so a session that expires mid-edit does not lose
 * them. Keys are scoped by user id (`relay:unsaved:{userId}:{name}`), so another person
 * signing in on the same tab never sees them; sign-out drops them all.
 */
const PREFIX = "relay:unsaved:";

/** Bumped on sign-out: edits typed before it are not written afterwards (a pending debounced write, a flush on unmount). */
let signOutCount = 0;

export function unsavedGeneration(): number {
  return signOutCount;
}

export interface StashEntry<T> {
  value: T;
  savedAt: number;
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function unsavedKey(userId: string, name: string): string {
  return `${PREFIX}${userId}:${name}`;
}

export function stashUnsaved(key: string, value: unknown): void {
  try {
    storage()?.setItem(key, JSON.stringify({ value, savedAt: Date.now() }));
  } catch {
    // Full or blocked storage: the edits simply are not kept.
  }
}

/** The stashed edits, or null when there are none, they are unreadable or older than `maxAgeMs`. */
export function readUnsaved<T>(key: string, maxAgeMs?: number): StashEntry<T> | null {
  try {
    const text = storage()?.getItem(key);

    if (!text) {
      return null;
    }

    const entry = JSON.parse(text) as Partial<StashEntry<T>> | null;

    if (!entry || typeof entry.savedAt !== "number" || entry.value === undefined) {
      return null;
    }

    if (maxAgeMs !== undefined && Date.now() - entry.savedAt > maxAgeMs) {
      return null;
    }

    return { value: entry.value, savedAt: entry.savedAt };
  } catch {
    return null;
  }
}

export function dropUnsaved(key: string): void {
  try {
    storage()?.removeItem(key);
  } catch {
    // Nothing to do.
  }
}

/** Drops every stash, or every stash except this user's (another account signed in). */
export function dropAllUnsaved(keepUserId?: string): void {
  if (keepUserId === undefined) {
    signOutCount += 1;
  }

  const store = storage();

  if (!store) {
    return;
  }

  try {
    const keep = keepUserId === undefined ? null : `${PREFIX}${keepUserId}:`;
    const keys = Array.from({ length: store.length }, (_, index) => store.key(index)).filter(
      (key): key is string => key !== null && key.startsWith(PREFIX) && (keep === null || !key.startsWith(keep))
    );

    for (const key of keys) {
      store.removeItem(key);
    }
  } catch {
    // Nothing to do.
  }
}
