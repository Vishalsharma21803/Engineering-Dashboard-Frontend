import { Suspense } from "react";
import { Link, Outlet } from "react-router-dom";

import { BrandLogo } from "@/components/brand/brand-logo";
import { PageLoader } from "@/components/ui/page-loader";
import { RelayFlow } from "./relay-flow";

const highlights = [
  "My work, pull requests and pipelines across your Azure DevOps projects",
  "Time in Solidtime, with hours drafted from your Azure activity",
  "SOP checks on every ticket, with an AI review that quotes its evidence",
];

export function AuthLayout() {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside className="theme-fixed relative hidden overflow-hidden bg-slate-950 px-10 py-10 text-white lg:block xl:px-14">
        {/* One column, centred in the panel: logo, story and footer share the same left edge.
            Short screens (max-height 820px) drop the highlights and tighten the gaps so nothing scrolls. */}
        <div className="relative mx-auto flex h-full w-full max-w-xl flex-col justify-between gap-10 [@media(max-height:820px)]:gap-6">
          <Link
            to="/"
            className="w-fit rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
          >
            <BrandLogo inverted />
          </Link>

          <div>
            <h2 className="text-4xl font-semibold tracking-tight text-balance text-white xl:text-[2.75rem] xl:leading-[1.1] [@media(max-height:820px)]:text-3xl">
              Your engineering day, in one place.
            </h2>

            <p className="mt-4 max-w-md text-sm leading-6 text-pretty text-slate-400">
              Azure DevOps work, Solidtime hours and SOP checks side by side. Relay
              proposes each change and writes nothing until you approve it.
            </p>

            <div className="mt-6 [@media(max-height:820px)]:mt-5">
              <RelayFlow />
            </div>

            <ul className="mt-10 grid grid-cols-3 gap-5 [@media(max-height:820px)]:hidden">
              {highlights.map((highlight) => (
                <li key={highlight} className="border-t border-white/10 pt-3 text-xs leading-5 text-pretty text-slate-400">
                  {highlight}
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-slate-400">
            Nothing is written to Azure DevOps or Solidtime until you approve it.
          </p>
        </div>
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

          <Suspense fallback={<PageLoader fullScreen={false} />}>
            <Outlet />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
