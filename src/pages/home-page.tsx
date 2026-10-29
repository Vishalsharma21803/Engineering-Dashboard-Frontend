import { Link } from "react-router-dom";

import { buttonClassName } from "@/components/ui/button-styles";
import { Card } from "@/components/ui/card";
import { ChevronRightIcon } from "@/components/ui/icons";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useCredentials } from "@/features/credentials/hooks/use-credentials";

/** 24px stroke glyphs, drawn like the Azure DevOps header icon. */
const AREA_ICONS = {
  azure: <path d="M4 5h7v7H4zM13 5h7v4h-7zM13 11h7v8h-7zM4 14h7v5H4z" />,
  time: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l2.5 2.5" />
    </>
  ),
  sop: (
    <>
      <rect x="5" y="4.5" width="14" height="16" rx="2" />
      <path d="M9 3.5h6v3H9zM9 13l2 2 4-4" />
    </>
  ),
  credentials: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="M10.8 12.2 19 4m-3 3 2 2m-4.5.5 2 2" />
    </>
  ),
};

const areas = [
  {
    title: "Azure DevOps",
    icon: AREA_ICONS.azure,
    to: "/azure",
    description: "My work, pull requests, pipelines and approvals across your projects.",
  },
  {
    title: "Time",
    icon: AREA_ICONS.time,
    to: "/time",
    description: "Track time on tickets with Solidtime and see what is still unlogged.",
  },
  {
    title: "SOP rules",
    icon: AREA_ICONS.sop,
    to: "/sop-rules",
    description: "See which SOP rules apply to your tickets and tune your own.",
  },
  {
    title: "Credentials",
    icon: AREA_ICONS.credentials,
    to: "/credentials",
    description: "Connect Azure DevOps, Solidtime and AI providers.",
  },
];

export function HomePage() {
  const { user } = useAuth();
  const credentials = useCredentials();
  const firstName = user?.name.split(/\s+/).filter(Boolean)[0] ?? "there";
  const needsAzure = credentials.isSuccess && credentials.data.length === 0;

  return (
    <section className="flex w-full flex-col gap-8">
      <div className="max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight text-balance text-slate-950 sm:text-[2.75rem] sm:leading-[1.1]">
          Welcome back, {firstName}.
        </h1>
        <p className="mt-3 text-base leading-7 text-slate-600">
          Your Azure DevOps work, time tracking and SOP checks in one place.
        </p>
      </div>

      {needsAzure ? (
        <Card className="flex flex-col gap-4 border-indigo-200 bg-indigo-50 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-950">Add your Azure DevOps credential</h2>
            <p className="mt-1 text-sm text-slate-600">
              Connect an organization with a personal access token to see your work items, pull requests and SOP checks.
            </p>
          </div>
          <Link to="/credentials/new" className={buttonClassName({ size: "md", className: "self-start sm:self-auto" })}>
            Add credential
          </Link>
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <ul className="stagger divide-y divide-slate-200">
          {areas.map((area) => (
            <li key={area.to}>
              <Link
                to={area.to}
                className="group flex items-center gap-4 px-5 py-4 outline-none transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 sm:py-5"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-100 transition duration-300 ease-out group-hover:bg-indigo-600 group-hover:text-white group-hover:ring-indigo-600">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="size-5">
                    {area.icon}
                  </svg>
                </span>
                <div className="min-w-0 flex-1 sm:flex sm:items-baseline sm:gap-6">
                  <h2 className="text-base font-semibold text-slate-950 transition group-hover:text-indigo-700 sm:w-40 sm:shrink-0">
                    {area.title}
                  </h2>
                  <p className="mt-0.5 text-sm text-slate-600 sm:mt-0">{area.description}</p>
                </div>
                <ChevronRightIcon className="size-5 shrink-0 text-slate-400 transition duration-300 ease-out group-hover:translate-x-1 group-hover:text-indigo-700" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}
