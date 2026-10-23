import { cn } from "@/utils/cn";
import type { ValidationStatus } from "../types/credential.types";

interface CredentialStatusBadgeProps {
  status: ValidationStatus | null;
}

const statusConfig: Record<
  "VALID" | "INVALID" | "ERROR" | "UNVALIDATED",
  { label: string; className: string; dotClassName: string }
> = {
  VALID: {
    label: "Valid",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    dotClassName: "bg-emerald-500",
  },
  INVALID: {
    label: "Invalid",
    className: "border-rose-200 bg-rose-50 text-rose-700",
    dotClassName: "bg-rose-500",
  },
  ERROR: {
    label: "Check failed",
    className: "border-amber-200 bg-amber-50 text-amber-700",
    dotClassName: "bg-amber-500",
  },
  UNVALIDATED: {
    label: "Not validated",
    className: "border-slate-200 bg-slate-50 text-slate-600",
    dotClassName: "bg-slate-400",
  },
};

export function CredentialStatusBadge({
  status,
}: CredentialStatusBadgeProps) {
  const config = statusConfig[status ?? "UNVALIDATED"];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        config.className
      )}
    >
      <span
        aria-hidden="true"
        className={cn("size-1.5 rounded-full", config.dotClassName)}
      />
      {config.label}
    </span>
  );
}
