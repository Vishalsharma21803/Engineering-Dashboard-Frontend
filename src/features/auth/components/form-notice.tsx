import { StatusNotice } from "@/components/ui/status-notice";

interface FormNoticeProps {
  message: string;
  /** "warning": something the user should know before going on (session expired, sign-out incomplete). */
  tone?: "success" | "warning";
}

export function FormNotice({ message, tone = "success" }: FormNoticeProps) {
  return (
    <StatusNotice
      className={
        tone === "warning"
          ? "flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800"
          : "flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700"
      }
    >
      <svg
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0"
      >
        <path
          fillRule="evenodd"
          d={
            tone === "warning"
              ? "M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm0-12a1 1 0 0 1 1 1v4a1 1 0 1 1-2 0V7a1 1 0 0 1 1-1Zm0 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
              : "M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z"
          }
          clipRule="evenodd"
        />
      </svg>
      <span>{message}</span>
    </StatusNotice>
  );
}
