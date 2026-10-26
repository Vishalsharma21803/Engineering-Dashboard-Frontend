import { cn } from "@/utils/cn";
import { pageWindow } from "@/utils/pagination";

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
  label?: string;
  disabled?: boolean;
}

const BUTTON =
  "inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40";

/** "Showing 11–20 of 57" with Previous / page numbers / Next. Renders nothing for a single page. */
export function Pagination({ page, totalPages, total, pageSize, onChange, label = "Pages", disabled = false }: PaginationProps) {
  if (totalPages <= 1) {
    return null;
  }

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <nav aria-label={label} className="flex flex-col items-center justify-between gap-2 pt-2 sm:flex-row">
      <p className="text-xs text-slate-500">
        Showing {first}–{last} of {total}
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className={cn(BUTTON, "border-slate-200 bg-white text-slate-700 hover:bg-slate-50")}
          disabled={disabled || page <= 1}
          onClick={() => onChange(page - 1)}
        >
          Previous
        </button>
        {pageWindow(page, totalPages).map((value, index) =>
          value === null ? (
            <span key={`gap-${index}`} className="px-1 text-sm text-slate-400" aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={value}
              type="button"
              aria-label={`Page ${value}`}
              aria-current={value === page ? "page" : undefined}
              disabled={disabled}
              onClick={() => onChange(value)}
              className={cn(
                BUTTON,
                value === page ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              )}
            >
              {value}
            </button>
          )
        )}
        <button
          type="button"
          className={cn(BUTTON, "border-slate-200 bg-white text-slate-700 hover:bg-slate-50")}
          disabled={disabled || page >= totalPages}
          onClick={() => onChange(page + 1)}
        >
          Next
        </button>
      </div>
    </nav>
  );
}
