/** Apple keyboards use ⌘ for shortcuts; every other system uses Ctrl. */
export const isApple = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);

/** The shortcut prefix to show for this system: `${modKey}K` reads "⌘K" or "Ctrl+K". */
export const modKey = isApple ? "⌘" : "Ctrl+";
