/*
 * Set when a signed-in session ends without the user signing out (a 401), so the
 * sign-in page can say why the user is there. Kept in sessionStorage as well, so a
 * reload of the sign-in page still explains it.
 */
const KEY = "auth:expired";
let expired = false;

export function markSessionExpired(): void {
  expired = true;

  try {
    window.sessionStorage.setItem(KEY, "1");
  } catch {
    // Storage blocked: the in-memory flag still covers this tab.
  }
}

export function isSessionExpired(): boolean {
  if (expired) {
    return true;
  }

  try {
    return window.sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function clearSessionExpired(): void {
  expired = false;

  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to do.
  }
}
