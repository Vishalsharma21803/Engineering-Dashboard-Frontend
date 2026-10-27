import { Input } from "@/components/ui/input";
import { cn } from "@/utils/cn";

export interface FilterOption {
  value: string;
  label: string;
  count?: number;
}

export interface FilterDefinition {
  id: string;
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
}

interface FilterBarProps {
  search?: { value: string; onChange: (value: string) => void; placeholder: string };
  filters: FilterDefinition[];
  shown: number;
  total: number;
  onClear: () => void;
}

/** One compact row: search, a few dropdown filters, result count and Clear. */
export function FilterBar({ search, filters, shown, total, onClear }: FilterBarProps) {
  const active = filters.filter((filter) => filter.value !== "").length + (search?.value ? 1 : 0);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50/70 p-2 lg:flex-row lg:items-center">
      {search ? (
        <div className="relative lg:w-64">
          <svg
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400"
          >
            <circle cx="9" cy="9" r="5.5" />
            <path d="m13.5 13.5 3 3" strokeLinecap="round" />
          </svg>
          <Input
            type="search"
            aria-label={search.placeholder}
            placeholder={search.placeholder}
            value={search.value}
            onChange={(event) => search.onChange(event.target.value)}
            className="h-9 pl-8"
          />
        </div>
      ) : null}

      <div className="flex flex-1 flex-wrap items-center gap-2">
        {filters.map((filter) => (
          <label key={filter.id} className="inline-flex items-center">
            <span className="sr-only">{filter.label}</span>
            <select
              value={filter.value}
              onChange={(event) => filter.onChange(event.target.value)}
              className={cn(
                "h-9 rounded-lg border bg-surface px-2.5 text-sm shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20",
                filter.value ? "border-indigo-300 font-medium text-indigo-700" : "border-slate-300 text-slate-700"
              )}
            >
              <option value="">{filter.label}: All</option>
              {filter.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {filter.label}: {option.label}
                  {option.count !== undefined ? ` (${option.count})` : ""}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      <div className="flex items-center gap-3 text-xs text-slate-500">
        <span aria-live="polite">
          {shown === total ? `${total} item${total === 1 ? "" : "s"}` : `${shown} of ${total}`}
        </span>
        {active > 0 ? (
          <button type="button" onClick={onClear} className="font-medium text-indigo-600 hover:text-indigo-500">
            Clear filters
          </button>
        ) : null}
      </div>
    </div>
  );
}
