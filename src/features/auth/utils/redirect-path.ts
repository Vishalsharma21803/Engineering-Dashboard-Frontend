interface RedirectLocationState {
  from?: {
    pathname?: unknown;
  };
}

const GUEST_PATHS = new Set(["/login", "/register"]);

export function getPostLoginRedirect(state: unknown): string {
  const pathname = (state as RedirectLocationState | null)?.from
    ?.pathname;

  if (
    typeof pathname === "string" &&
    pathname.startsWith("/") &&
    !pathname.startsWith("//") &&
    !pathname.includes("\\") &&
    !GUEST_PATHS.has(pathname)
  ) {
    return pathname;
  }

  return "/";
}
