interface RedirectLocationState {
  from?: {
    pathname?: unknown;
    search?: unknown;
    hash?: unknown;
  };
}

const GUEST_PATHS = new Set(["/login", "/register"]);

/** The page (with its filters and page number) the user was sent away from; same-origin paths only. */
export function getPostLoginRedirect(state: unknown): string {
  const from = (state as RedirectLocationState | null)?.from;
  const pathname = from?.pathname;

  if (
    typeof pathname === "string" &&
    pathname.startsWith("/") &&
    !pathname.startsWith("//") &&
    !pathname.includes("\\") &&
    !GUEST_PATHS.has(pathname)
  ) {
    const search = typeof from?.search === "string" && from.search.startsWith("?") ? from.search : "";
    const hash = typeof from?.hash === "string" && from.hash.startsWith("#") ? from.hash : "";
    return `${pathname}${search}${hash}`;
  }

  return "/";
}
