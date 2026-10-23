import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/utils/cn";
import type { Section } from "../types/azure.types";
import { describeError } from "../utils/error-message";

interface ErrorCardProps {
  error: unknown;
  credentialId?: string;
  onRetry?: () => void;
  isRetrying?: boolean;
}

export function ErrorCard({ error, credentialId, onRetry, isRetrying }: ErrorCardProps) {
  const description = describeError(error);

  return (
    <Card role="alert" className="border-rose-200 p-5">
      <h2 className="text-base font-semibold text-slate-950">{description.title}</h2>
      <p className="mt-1.5 text-sm leading-6 text-slate-600">{description.message}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {onRetry ? (
          <Button variant="secondary" size="sm" onClick={onRetry} disabled={isRetrying}>
            {isRetrying ? "Retrying..." : "Try again"}
          </Button>
        ) : null}
        {description.fixCredential && credentialId ? (
          <Link
            to={`/credentials/${encodeURIComponent(credentialId)}/edit`}
            className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium text-indigo-600 hover:bg-indigo-50"
          >
            Update credential
          </Link>
        ) : null}
      </div>
    </Card>
  );
}

export function EmptyState({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        "rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-4 py-6 text-center text-sm text-slate-500",
        className
      )}
    >
      {children}
    </p>
  );
}

export function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="animate-pulse space-y-2" aria-label="Loading">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="h-12 rounded-lg bg-slate-100" />
      ))}
    </div>
  );
}

interface SectionViewProps<T> {
  section: Section<T>;
  /** What the section shows, used in degraded-state messages. */
  label: string;
  children: (data: T) => ReactNode;
}

/** Renders one independently-loaded backend section, including degraded states. */
export function SectionView<T>({ section, label, children }: SectionViewProps<T>) {
  if (section.status === "forbidden") {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        The PAT does not grant access to {label}. Add the missing scope to the
        credential to see this section.
      </p>
    );
  }

  if (section.status === "error" || section.data === null) {
    return (
      <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        {label.charAt(0).toUpperCase() + label.slice(1)} could not be loaded
        {section.reason ? ` (${section.reason})` : ""}.
      </p>
    );
  }

  return <>{children(section.data)}</>;
}

export function SectionCard({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-slate-950">{title}</h2>
          {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
        </div>
        {actions}
      </div>
      <div className="p-5 pt-0">{children}</div>
    </Card>
  );
}

export function StatTile({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

/** Proposal errors float above the page so they are seen wherever the button was clicked. */
export function ErrorToast({ message, onDismiss }: { message: string | null; onDismiss: () => void }) {
  if (!message) {
    return null;
  }

  return (
    <div
      role="alert"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-lg items-start gap-3 rounded-xl border border-rose-200 bg-white p-4 text-sm shadow-xl sm:left-auto sm:right-6 sm:mx-0"
    >
      <span aria-hidden="true" className="mt-0.5 size-2.5 shrink-0 rounded-full bg-rose-500" />
      <div className="flex-1">
        <p className="font-semibold text-slate-950">Could not prepare the change</p>
        <p className="mt-0.5 text-slate-600">{message}</p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="rounded-md px-1.5 text-lg leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700"
      >
        ×
      </button>
    </div>
  );
}
