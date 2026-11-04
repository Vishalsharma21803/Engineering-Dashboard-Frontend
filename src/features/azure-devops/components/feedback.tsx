import { CircleHelp } from "lucide-react";
import { useId, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { Card } from "@/components/ui/card";
import { StatusNotice } from "@/components/ui/status-notice";
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

/** Azure DevOps has no such ticket or pull request (or the token cannot see it): retrying would not help, so no Try again. */
export function NotFoundCard({ title, text, backTo, backLabel }: { title: string; text: string; backTo: string; backLabel: string }) {
  return (
    <Card role="alert" className="p-5">
      <h2 className="text-base font-semibold text-slate-950">{title}</h2>
      <p className="mt-1.5 text-sm leading-6 text-slate-600">{text}</p>
      <div className="mt-4">
        <Link to={backTo} className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium text-indigo-600 hover:bg-indigo-50">
          {backLabel}
        </Link>
      </div>
    </Card>
  );
}

/**
 * A refetch failed but earlier data is still on screen: say so above it,
 * instead of replacing the page (and anything typed into it) with an error.
 */
export function StaleDataBanner({ error, onRetry, isRetrying, credentialId }: { error: unknown; onRetry: () => void; isRetrying?: boolean; credentialId?: string }) {
  const description = describeError(error);

  return (
    <div role="alert" className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 sm:flex-row sm:items-center sm:justify-between">
      <span>
        Could not refresh: {description.message} Showing the last loaded data.
      </span>
      <span className="flex shrink-0 gap-2">
        {description.fixCredential && credentialId ? (
          <Link
            to={`/credentials/${encodeURIComponent(credentialId)}/edit`}
            className="inline-flex h-8 items-center rounded-lg px-3 text-sm font-medium text-indigo-600 hover:bg-indigo-50"
          >
            Update credential
          </Link>
        ) : null}
        <Button variant="secondary" size="sm" onClick={onRetry} disabled={isRetrying}>
          {isRetrying ? "Retrying..." : "Try again"}
        </Button>
      </span>
    </div>
  );
}

export interface PartialReadNoticeProps {
  /** Sentences to show, in order; null/undefined/"" entries are skipped. Renders nothing when none remain. */
  messages: Array<string | null | undefined>;
  className?: string;
}

/** Part of a list could not be read or was cut at a cap: say so calmly above it. */
export function PartialReadNotice({ messages, className }: PartialReadNoticeProps) {
  const shown = messages.filter((message): message is string => typeof message === "string" && message.trim() !== "");
  if (shown.length === 0) {
    return null;
  }

  return (
    <StatusNotice className={cn("flex flex-col gap-1 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm break-words text-amber-800", className)}>
      {shown.map((message, index) => (
        <p key={index}>{message}</p>
      ))}
    </StatusNotice>
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
    <div className="skeleton space-y-2" aria-label="Loading">
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

  // Only a failed read is an error: a successful read may legitimately be empty (no current iteration).
  if (section.status === "error") {
    return (
      <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        {label.charAt(0).toUpperCase() + label.slice(1)} could not be loaded
        {section.reason ? ` (${section.reason})` : ""}.
      </p>
    );
  }

  return <>{children(section.data as T)}</>;
}

/** A "?" next to a heading: the explanation is one hover or focus away instead of always on screen. */
export function HelpHint({ label, topic }: { label: string; topic: string }) {
  const id = useId();
  return (
    <Hint label={<span className="block max-w-72">{label}</span>}>
      <button
        type="button"
        aria-label={`About ${topic}`}
        aria-describedby={id}
        className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-slate-400 outline-none transition-colors hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        <CircleHelp aria-hidden="true" className="size-4" />
        <span id={id} hidden>
          {label}
        </span>
      </button>
    </Hint>
  );
}

export function SectionCard({
  title,
  description,
  help,
  actions,
  children,
  id,
}: {
  title: string;
  description?: string;
  /** Shown behind a "?" next to the title instead of under it. */
  help?: string;
  actions?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  return (
    <Card id={id} className={id ? "scroll-mt-6" : undefined}>
      <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-base font-semibold tracking-tight text-slate-950">
            {title}
            {help ? <HelpHint label={help} topic={title} /> : null}
          </h2>
          {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
        </div>
        {actions}
      </div>
      <div className="min-w-0 p-5 pt-0">{children}</div>
    </Card>
  );
}

export function StatTile({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="stat-tile rounded-xl border border-slate-200 bg-surface p-4 shadow-sm transition-colors hover:border-slate-300">
      <p className="text-sm text-slate-500">{label}</p>
      {/* A div: the value may be a whole section (with its own paragraphs), not just a number. */}
      <div className="mt-1.5 text-[1.75rem] leading-8 font-semibold tracking-tight text-slate-950 tabular-nums">{value}</div>
      {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

/** Proposal errors float above the page so they are seen wherever the button was clicked. */
export function ErrorToast({ message, onDismiss, title = "Could not prepare the change" }: { message: string | null; onDismiss: () => void; title?: string }) {
  if (!message) {
    return null;
  }

  return (
    <div
      role="alert"
      className="toast-in fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-lg items-start gap-3 rounded-xl border border-rose-200 bg-surface p-4 text-sm shadow-xl sm:left-auto sm:right-6 sm:mx-0"
    >
      <span aria-hidden="true" className="mt-0.5 size-2.5 shrink-0 rounded-full bg-rose-500" />
      <div className="flex-1">
        <p className="font-semibold text-slate-950">{title}</p>
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
