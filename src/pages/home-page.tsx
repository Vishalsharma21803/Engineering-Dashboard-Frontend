import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const foundations = [
  {
    label: "React",
    value: "19",
  },
  {
    label: "TypeScript",
    value: "Strict",
  },
  {
    label: "Vite",
    value: "8",
  },
  {
    label: "Tailwind CSS",
    value: "v4",
  },
  {
    label: "Router",
    value: "React Router v7",
  },
  {
    label: "Server state",
    value: "TanStack Query",
  },
];

const nextSteps = [
  {
    title: "Authentication",
    status: "Next up",
    statusClass: "bg-indigo-50 text-indigo-700",
    description:
      "Login and registration pages, session context, and protected routes.",
  },
  {
    title: "Credentials",
    status: "Backend ready",
    statusClass: "bg-emerald-50 text-emerald-700",
    description:
      "Create, list, update, validate, and delete Azure DevOps PATs.",
  },
  {
    title: "Azure DevOps",
    status: "Backend ready",
    statusClass: "bg-emerald-50 text-emerald-700",
    description:
      "Projects, work items, repositories, pull requests, pipelines, and builds.",
  },
];

export function HomePage() {
  return (
    <section className="flex w-full flex-col gap-10">
      <div className="max-w-3xl">
        <span className="inline-flex items-center rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
          Frontend initialized
        </span>

        <h1 className="mt-5 text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
          One cockpit for your Azure DevOps work.
        </h1>

        <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
          A modular React workspace for authentication, Azure DevOps
          credentials, projects, work items, repositories, pull requests,
          and pipelines.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {nextSteps.map((item) => (
          <Card key={item.title}>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle>{item.title}</CardTitle>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${item.statusClass}`}
                >
                  {item.status}
                </span>
              </div>
              <CardDescription>{item.description}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Frontend foundation</CardTitle>
          <CardDescription>
            Feature-based structure under{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">
              src/features
            </code>
            , shared UI primitives, an API client, and a configured query
            cache.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {foundations.map((item) => (
              <div
                key={item.label}
                className="rounded-lg border border-slate-100 bg-slate-50 p-3"
              >
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  {item.label}
                </dt>
                <dd className="mt-1 text-sm font-semibold text-slate-900">
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </section>
  );
}
