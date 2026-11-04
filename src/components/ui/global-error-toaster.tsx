import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";

import { StatusNotice } from "@/components/ui/status-notice";
import { dismissGlobalNotice, getGlobalNotices, subscribeGlobalNotices, type GlobalNotice } from "@/lib/global-errors";
import { cn } from "@/utils/cn";

/**
 * Results of saves and approvals that finished after their page closed. Rendered in a
 * portal, each toast its own live region (none nested in another), so they are announced
 * even while a dialog is open.
 */
export function GlobalErrorToaster() {
  const notices = useSyncExternalStore(subscribeGlobalNotices, getGlobalNotices, getGlobalNotices);

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-stretch gap-2 sm:left-auto sm:right-6 sm:w-full sm:max-w-lg">
      {notices.map((notice) => (
        <Toast key={notice.id} notice={notice} />
      ))}
    </div>,
    document.body
  );
}

function Toast({ notice }: { notice: GlobalNotice }) {
  const error = notice.tone === "error";

  return (
    <StatusNotice
      alert={error}
      className={cn("toast-in pointer-events-auto flex items-start gap-3 rounded-xl border bg-surface p-4 text-sm shadow-xl", error ? "border-rose-200" : "border-slate-200")}
    >
      <span aria-hidden="true" className={cn("mt-0.5 size-2.5 shrink-0 rounded-full", error ? "bg-rose-500" : "bg-indigo-500")} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-slate-950">{notice.title}</p>
        <p className="mt-0.5 text-slate-600">{notice.message}</p>
        {notice.link ? (
          <Link to={notice.link.to} onClick={() => dismissGlobalNotice(notice.id)} className="mt-1 inline-block font-medium text-indigo-700 hover:underline">
            {notice.link.label}
          </Link>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => dismissGlobalNotice(notice.id)}
        aria-label="Dismiss"
        className="rounded-md px-1.5 text-lg leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700"
      >
        ×
      </button>
    </StatusNotice>
  );
}
