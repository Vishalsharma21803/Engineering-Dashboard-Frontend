import { Link } from "react-router-dom";

import { buttonClassName } from "@/components/ui/button-styles";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useCredentials } from "@/features/credentials/hooks/use-credentials";

const areas = [
  {
    title: "Azure DevOps",
    to: "/azure",
    description: "My work, pull requests, pipelines and approvals across your projects.",
  },
  {
    title: "Time",
    to: "/time",
    description: "Track time on tickets with Solidtime and see what is still unlogged.",
  },
  {
    title: "SOP rules",
    to: "/sop-rules",
    description: "See which SOP rules apply to your tickets and tune your own.",
  },
  {
    title: "Credentials",
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
        <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
          Welcome back, {firstName}.
        </h1>
        <p className="mt-3 text-base leading-7 text-slate-600">
          Your Azure DevOps work, time tracking and SOP checks in one place.
        </p>
      </div>

      {needsAzure ? (
        <Card className="flex flex-col gap-4 border-indigo-200 bg-indigo-50 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">First step</p>
            <h2 className="mt-1 text-base font-semibold text-slate-950">Add your Azure DevOps credential</h2>
            <p className="mt-1 text-sm text-slate-600">
              Connect an organization with a personal access token to see your work items, pull requests and SOP checks.
            </p>
          </div>
          <Link to="/credentials/new" className={buttonClassName({ size: "md", className: "self-start sm:self-auto" })}>
            Add credential
          </Link>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {areas.map((area) => (
          <Link
            key={area.to}
            to={area.to}
            className="group rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
          >
            <Card className="h-full p-5 transition group-hover:border-indigo-300">
              <h2 className="flex items-center justify-between gap-2 text-base font-semibold text-slate-950">
                {area.title}
                <span aria-hidden="true" className="text-slate-400 transition group-hover:text-indigo-600">
                  →
                </span>
              </h2>
              <p className="mt-1 text-sm text-slate-600">{area.description}</p>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
