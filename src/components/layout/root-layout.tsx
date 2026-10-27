import { Link, NavLink, Outlet } from "react-router-dom";

import { BrandLogo } from "@/components/brand/brand-logo";
import { buttonClassName } from "@/components/ui/button-styles";
import { Spinner } from "@/components/ui/spinner";
import { UserMenu } from "@/features/auth/components/user-menu";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { cn } from "@/utils/cn";

const navLinkClassName = ({
  isActive,
}: {
  isActive: boolean;
}) =>
  cn(
    "rounded-lg px-3 py-2 text-sm font-medium transition",
    isActive
      ? "bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200"
      : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
  );

export function RootLayout() {
  const { user, isLoading } = useAuth();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
            >
              <BrandLogo />
            </Link>

            {!isLoading && user ? (
              <nav
                aria-label="Primary"
                className="hidden items-center gap-1 md:flex"
              >
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

          {isLoading ? (
            <Spinner className="size-4 text-slate-400" />
          ) : user ? (
            <UserMenu />
          ) : (
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
        {!isLoading && user ? (
          <nav
            aria-label="Primary mobile"
            className="flex gap-1 overflow-x-auto border-t border-slate-100 px-4 py-2 md:hidden"
          >
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

      <main className="mx-auto flex w-full max-w-6xl flex-1 px-4 py-10 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}
