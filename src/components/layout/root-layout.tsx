import { Link, NavLink, Outlet } from "react-router-dom";

import { BrandLogo } from "@/components/brand/brand-logo";
import { ActiveIndicator } from "@/components/ui/active-indicator";
import { buttonClassName } from "@/components/ui/button-styles";
import { Spinner } from "@/components/ui/spinner";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { UserMenu } from "@/features/auth/components/user-menu";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { cn } from "@/utils/cn";

const navLinkClassName = ({
  isActive,
}: {
  isActive: boolean;
}) =>
  cn(
    "relative shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors",
    isActive
      ? "text-indigo-700"
      : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-950"
  );

export function RootLayout() {
  const { user, isLoading, error } = useAuth();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="app-header sticky top-0 z-10 border-b border-slate-200/80 bg-surface/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-[90rem] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
            >
              {/* Between md and lg the desktop nav leaves room for the mark only. */}
              <BrandLogo textClassName="md:max-lg:sr-only" />
            </Link>

            {!isLoading && user ? (
              <nav
                aria-label="Primary"
                className="relative hidden items-center gap-1 md:flex"
              >
                <ActiveIndicator variant="pill" />
                <NavLink to="/" end className={navLinkClassName}>
                  Overview
                </NavLink>
                <NavLink to="/azure" className={navLinkClassName}>
                  Azure DevOps
                </NavLink>
                <NavLink to="/sop-rules" className={navLinkClassName}>
                  SOP rules
                </NavLink>
                <NavLink to="/time" className={navLinkClassName}>
                  Time
                </NavLink>
                <NavLink
                  to="/credentials"
                  className={navLinkClassName}
                >
                  Credentials
                </NavLink>
              </nav>
            ) : null}
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            <ThemeToggle />
            {isLoading ? (
              <Spinner className="size-4 text-slate-400" />
            ) : user ? (
              <UserMenu />
            ) : error ? null : (
              // The server is unreachable: whether the user is signed in is unknown, so no sign-in links.
              <div className="flex items-center gap-2">
                <Link
                  to="/login"
                  className={buttonClassName({
                    variant: "ghost",
                    size: "sm",
                  })}
                >
                  Sign in
                </Link>
                <span className="hidden sm:block">
                  <Link
                    to="/register"
                    className={buttonClassName({ size: "sm" })}
                  >
                    Create account
                  </Link>
                </span>
              </div>
            )}
          </div>
        </div>
        {!isLoading && user ? (
          <nav
            aria-label="Primary mobile"
            className="relative flex gap-1 overflow-x-auto border-t border-slate-100 px-4 py-2 md:hidden"
          >
            <ActiveIndicator variant="pill" />
            <NavLink to="/" end className={navLinkClassName}>
              Overview
            </NavLink>
            <NavLink to="/azure" className={navLinkClassName}>
              Azure DevOps
            </NavLink>
            <NavLink to="/sop-rules" className={navLinkClassName}>
              SOP rules
            </NavLink>
            <NavLink to="/time" className={navLinkClassName}>
              Time
            </NavLink>
            <NavLink to="/credentials" className={navLinkClassName}>
              Credentials
            </NavLink>
          </nav>
        ) : null}
      </header>

      <main className="mx-auto flex w-full min-w-0 max-w-[90rem] flex-1 px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}
