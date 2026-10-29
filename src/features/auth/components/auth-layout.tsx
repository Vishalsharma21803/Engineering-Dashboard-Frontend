import { Link, Outlet } from "react-router-dom";

import { BrandLogo } from "@/components/brand/brand-logo";
import { CockpitPreview } from "./cockpit-preview";

const highlights = [
  "Encrypted Azure DevOps PAT storage",
  "Projects, work items, and pull requests",
  "Pipelines, builds, and release visibility",
];

export function AuthLayout() {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside className="theme-fixed relative hidden overflow-hidden bg-slate-950 px-10 py-10 text-white lg:flex lg:flex-col lg:justify-between xl:px-14">
        <Link
          to="/"
          className="relative w-fit rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
        >
          <BrandLogo inverted />
        </Link>

        <div className="relative my-10 w-full max-w-xl">
          <h2 className="text-4xl font-semibold tracking-tight text-balance text-white xl:text-[2.75rem] xl:leading-[1.1]">
            Your Azure DevOps work, in one place.
          </h2>

          <p className="mt-4 max-w-md text-sm leading-6 text-slate-400">
            Sign in to manage credentials, inspect projects, and keep
            delivery work moving without jumping between tools.
          </p>

          <div className="mt-10">
            <CockpitPreview />
          </div>

          <ul className="mt-10 grid grid-cols-3 gap-5">
            {highlights.map((highlight) => (
              <li key={highlight} className="border-t border-white/10 pt-3 text-xs leading-5 text-slate-400">
                {highlight}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-slate-400">
          Azure DevOps workspace
        </p>
      </aside>

      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10 sm:px-6 lg:px-10">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <Link
              to="/"
              className="inline-flex rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
            >
              <BrandLogo />
            </Link>
          </div>

          <Outlet />
        </div>
      </main>
    </div>
  );
}
