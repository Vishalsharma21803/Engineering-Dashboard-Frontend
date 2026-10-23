import { cn } from "@/utils/cn";

export type CredentialAlertTone = "error" | "success" | "info";

interface CredentialAlertProps {
  tone: CredentialAlertTone;
  message: string;
  onDismiss?: () => void;
}

const toneStyles: Record<CredentialAlertTone, string> = {
  error: "border-rose-200 bg-rose-50 text-rose-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  info: "border-sky-200 bg-sky-50 text-sky-700",
};

const iconStyles: Record<CredentialAlertTone, string> = {
  error: "bg-rose-100 text-rose-600",
  success: "bg-emerald-100 text-emerald-600",
  info: "bg-sky-100 text-sky-600",
};

function AlertIcon({
  tone,
}: {
  tone: CredentialAlertTone;
}) {
  if (tone === "success") {
    return (
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
    );
  }

  if (tone === "info") {
    return (
      <svg
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
        className="size-3.5"
      >
        <path
          fillRule="evenodd"
          d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.25v2.25H9a.75.75 0 0 0 0 1.5h2a.75.75 0 0 0 0-1.5h-.25V9.75A.75.75 0 0 0 10 9H9Z"
          clipRule="evenodd"
        />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
      className="size-3.5"
    >
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm0-12a1 1 0 0 1 1 1v4a1 1 0 1 1-2 0V7a1 1 0 0 1 1-1Zm0 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function CredentialAlert({
  tone,
  message,
  onDismiss,
}: CredentialAlertProps) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm",
        toneStyles[tone]
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
          iconStyles[tone]
        )}
      >
        <AlertIcon tone={tone} />
      </span>

      <span className="flex-1">{message}</span>

      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss message"
          className="rounded-sm px-1 text-current/70 outline-none transition hover:text-current focus-visible:ring-2 focus-visible:ring-current"
        >
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
            className="size-4"
          >
            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}
