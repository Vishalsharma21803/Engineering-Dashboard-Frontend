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
    status: "Next module",
    statusClass: "bg-indigo-50 text-indigo-700",
    description:
      "Create, update, validate, and delete Azure DevOps PATs from the cockpit.",
  },
  {
    title: "Azure DevOps",
    status: "Backend ready",
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
          Your session is active. Credential management is the next
          module to land, followed by the Azure DevOps workspace.
        </p>
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
