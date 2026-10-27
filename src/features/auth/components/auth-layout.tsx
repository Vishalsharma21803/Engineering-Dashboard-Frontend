import { Link, Outlet } from "react-router-dom";

import { BrandLogo } from "@/components/brand/brand-logo";

const highlights = [
  "Encrypted Azure DevOps PAT storage",
  "Projects, work items, and pull requests",
  "Pipelines, builds, and release visibility",
];

function CheckIcon() {
  return (
    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-indigo-500/15 text-indigo-300">
      <svg
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
        className="size-3.5"
      >
        <path
          fillRule="evenodd"
          d="M16.704 5.29a1 1 0 0 1 .006 1.414l-7.5 7.55a1 1 0 0 1-1.42 0l-3.5-3.5a1 1 0 1 1 1.414-1.414l2.793 2.793 6.793-6.836a1 1 0 0 1 1.414-.006Z"
          clipRule="evenodd"
        />
      </svg>
    </span>
  );
}

export function AuthLayout() {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside className="theme-fixed relative hidden overflow-hidden bg-slate-950 px-10 py-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.35),transparent_45%)]" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 size-80 rounded-full bg-indigo-500/10 blur-3xl" />

        <Link
          to="/"
          className="relative w-fit rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
        >
          <BrandLogo inverted />
        </Link>

        <div className="relative max-w-md">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-300">
            Engineer Cockpit
          </p>

          <h2 className="mt-4 text-4xl font-semibold tracking-tight text-white">
            Your Azure DevOps work, in one place.
          </h2>

          <p className="mt-4 text-sm leading-6 text-slate-400">
            Sign in to manage credentials, inspect projects, and keep
            delivery work moving without jumping between tools.
          </p>

          <ul className="mt-8 space-y-3">
            {highlights.map((highlight) => (
              <li
                key={highlight}
                className="flex items-start gap-3 text-sm text-slate-300"
              >
                <CheckIcon />
                <span>{highlight}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-slate-500">
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

          <p className="mt-8 text-center text-xs text-slate-400">
            Secure session via an httpOnly cookie.
          </p>
        </div>
      </main>
    </div>
  );
}
