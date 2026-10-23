import { Link, Outlet } from "react-router-dom";

import { BrandMark } from "@/components/brand/brand-mark";

export function RootLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link
            to="/"
            className="flex items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
          >
            <BrandMark />
            <span className="flex flex-col leading-tight">
              <span className="text-sm font-semibold tracking-tight text-slate-950">
                Engineer Cockpit
              </span>
              <span className="text-xs text-slate-500">
                Azure DevOps workspace
              </span>
            </span>
          </Link>

          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-500">
            Frontend foundation
          </span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 px-4 py-10 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}
