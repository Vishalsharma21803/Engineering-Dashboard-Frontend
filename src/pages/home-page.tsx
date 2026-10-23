import { Link } from "react-router-dom";

import { buttonClassName } from "@/components/ui/button-styles";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/features/auth/hooks/use-auth";

const modules = [
  {
    title: "Credentials",
    status: "Available",
    statusClass: "bg-emerald-50 text-emerald-700",
    description:
      "Add, validate, update, and delete encrypted Azure DevOps PATs.",
  },
  {
    title: "Azure DevOps",
    status: "Available",
    statusClass: "bg-emerald-50 text-emerald-700",
    description:
      "Projects, work items, repositories, pull requests, pipelines, and builds.",
  },
  {
    title: "Insights",
    status: "Planned",
    statusClass: "bg-slate-100 text-slate-600",
    description:
      "Delivery visibility across teams, repositories, and build health.",
  },
];

export function HomePage() {
  const { user } = useAuth();
  const firstName = user?.name.split(/\s+/).filter(Boolean)[0] ?? "there";

  return (
    <section className="flex w-full flex-col gap-10">
      <div className="max-w-3xl">
        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          Authenticated
        </span>

        <h1 className="mt-5 text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
          Welcome back, {firstName}.
        </h1>

        <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
          Your session is active. Credential management is live.
          Add an Azure DevOps PAT to validate organization access and
          prepare for the workspace.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to="/credentials"
            className={buttonClassName({ size: "md" })}
          >
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
              className="size-4"
            >
              <path
                fillRule="evenodd"
                d="M8 7a4 4 0 1 1 8 0 4 4 0 0 1-8 0Zm-5.5 8a5.5 5.5 0 0 1 9.58-3.68A4.5 4.5 0 0 0 10 14.5v1a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5V15Zm5.25-8a3 3 0 1 0 6 0 3 3 0 0 0-6 0ZM3 15.5A4.5 4.5 0 0 1 7.5 11h.257a5.49 5.49 0 0 0-1.284 2.65A2.5 2.5 0 0 0 4.5 15.5v.5h4.75a2.5 2.5 0 0 0 .25 1.5H3a.5.5 0 0 1-.5-.5v-1Z"
                clipRule="evenodd"
              />
            </svg>
            Manage credentials
          </Link>

          <Link
            to="/credentials/new"
            className={buttonClassName({
              variant: "secondary",
              size: "md",
            })}
          >
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
              className="size-4"
            >
              <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
            </svg>
            Add credential
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {modules.map((module) => (
          <Card key={module.title}>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle>{module.title}</CardTitle>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${module.statusClass}`}
                >
                  {module.status}
                </span>
              </div>
              <CardDescription>
                {module.description}
              </CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Signed-in session</CardTitle>
          <CardDescription>
            Your session is backed by an httpOnly JWT cookie and
            restored automatically on refresh.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Name
              </dt>
              <dd className="mt-1 truncate text-sm font-semibold text-slate-900">
                {user?.name ?? "Unknown"}
              </dd>
            </div>

            <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Email
              </dt>
              <dd className="mt-1 truncate text-sm font-semibold text-slate-900">
                {user?.email ?? "Unknown"}
              </dd>
            </div>

            <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Session
              </dt>
              <dd className="mt-1 flex items-center gap-2 text-sm font-semibold text-slate-900">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                Active
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </section>
  );
}
