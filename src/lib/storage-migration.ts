/*
 * The app was called "Engineer Cockpit" and kept its browser settings under `cockpit…` keys
 * (theme, filters, folded stories, tips, unsaved edits). Each is moved to the matching `relay…`
 * key once, so nobody loses a setting; a value already saved under the new key wins.
 */
const LEGACY_PREFIXES = ["cockpit:", "cockpit-"];

export function migrateLegacyKeys(storage: Storage): void {
  const legacy: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key && LEGACY_PREFIXES.some((prefix) => key.startsWith(prefix))) legacy.push(key);
  }

  for (const key of legacy) {
    const renamed = `relay${key.slice("cockpit".length)}`;
    const value = storage.getItem(key);
    if (value !== null && storage.getItem(renamed) === null) storage.setItem(renamed, value);
    storage.removeItem(key);
  }
}

/** Runs once when the app starts; storage that is blocked or full is left as it is. */
export function migrateLegacyStorage(): void {
  for (const pick of [() => window.localStorage, () => window.sessionStorage]) {
    try {
      migrateLegacyKeys(pick());
    } catch {
      // Private mode or blocked storage: there is nothing to move, and the app works without it.
    }
  }
}
