import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "../hooks/use-auth";
import { useLogout } from "../hooks/use-logout";

function getInitials(name: string): string {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  return initials || "U";
}

export function UserMenu() {
  const { user } = useAuth();
  const logout = useLogout();

  if (!user) {
    return null;
  }

  function handleLogout() {
    logout.mutate();
  }

  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <div className="flex items-center gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
          {getInitials(user.name)}
        </span>
        <span className="hidden flex-col leading-tight sm:flex md:hidden lg:flex">
          <span className="max-w-40 truncate text-xs font-medium text-slate-900">
            {user.name}
          </span>
          <span className="max-w-40 truncate text-[11px] text-slate-500">
            {user.email}
          </span>
        </span>
      </div>

      <Hint label="Sign out" side="bottom">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          disabled={logout.isPending}
          aria-label={
            logout.isPending ? "Signing out" : "Sign out"
          }
        >
          {logout.isPending ? (
            <Spinner className="size-3.5" />
          ) : (
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
              className="size-4"
            >
              <path
                fillRule="evenodd"
                d="M3 4.75A1.75 1.75 0 0 1 4.75 3h4.5a.75.75 0 0 1 0 1.5h-4.5a.25.25 0 0 0-.25.25v10.5c0 .138.112.25.25.25h4.5a.75.75 0 0 1 0 1.5h-4.5A1.75 1.75 0 0 1 3 15.25V4.75Zm9.47 1.72a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 1 1-1.06-1.06l1.97-1.97H8.75a.75.75 0 0 1 0-1.5h5.69l-1.97-1.97a.75.75 0 0 1 0-1.06Z"
                clipRule="evenodd"
              />
            </svg>
          )}
          <span className="hidden sm:inline md:hidden xl:inline">
            {logout.isPending ? "Signing out..." : "Sign out"}
          </span>
        </Button>
      </Hint>
    </div>
  );
}
