import { currentSessionEpoch } from "@/lib/api-client";

/*
 * Outcomes that arrive after the page that asked for them is gone (the user navigated
 * away while a save or an approval was running). Shown by GlobalErrorToaster, mounted
 * once in RootLayout. Pages that are still open show their own messages instead.
 */
export interface GlobalNotice {
  id: number;
  tone: "error" | "info";
  title: string;
  message: string;
  link?: { to: string; label: string };
}

let notices: GlobalNotice[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

/** The session a mutation started in; its onMutate returns this (see `stampSession`). */
export interface SessionStamp {
  sessionEpoch: number;
}

/** For a mutation's onMutate: remembers the session it started in. */
export function stampSession(): SessionStamp {
  return { sessionEpoch: currentSessionEpoch() };
}

/**
 * False once the user signed out, the session expired or someone signed in after the
 * mutation started: its outcome belongs to that ended session and must not reach the next
 * account. Without a stamp (its onMutate never ran) it is shown rather than lost.
 */
export function sameSession(stamp: SessionStamp | undefined): boolean {
  return stamp === undefined || stamp.sessionEpoch === currentSessionEpoch();
}

/** `stamp`: from the mutation's onMutate; an outcome from an ended session is dropped. */
export function pushGlobalNotice(notice: Omit<GlobalNotice, "id">, stamp: SessionStamp | undefined): void {
  if (!sameSession(stamp)) {
    return;
  }

  // Keep the last few; an old one the user never dismissed is not worth a wall of toasts.
  notices = [...notices, { ...notice, id: nextId++ }].slice(-4);
  emit();
}

export function dismissGlobalNotice(id: number): void {
  notices = notices.filter((notice) => notice.id !== id);
  emit();
}

/** Sign-out or an ended session: one account's outcomes are never shown to the next. */
export function clearGlobalNotices(): void {
  if (notices.length > 0) {
    notices = [];
    emit();
  }
}

export function subscribeGlobalNotices(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getGlobalNotices(): GlobalNotice[] {
  return notices;
}
