import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select-field";
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
    <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-2 sm:flex-row sm:flex-wrap sm:items-center">
      {search ? (
        <div className="relative min-w-0 sm:min-w-56 sm:flex-1">
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
            className="h-9 w-full pl-8"
          />
        </div>
      ) : null}

      {filters.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          {filters.map((filter) => (
            <label key={filter.id} className="flex min-w-0 items-center">
              <span className="sr-only">{filter.label}</span>
              <SelectField
                value={filter.value}
                onValueChange={(selected) => filter.onChange(selected)}
                size="sm"
                className={cn("sm:w-44", filter.value ? "border-indigo-300 font-medium text-indigo-700" : "text-slate-700")}
              >
                <option value="">{filter.label}: All</option>
                {filter.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {filter.label}: {option.label}
                    {option.count !== undefined ? ` (${option.count})` : ""}
                  </option>
                ))}
              </SelectField>
            </label>
          ))}
        </div>
      ) : null}

      <div className="flex shrink-0 items-center justify-between gap-3 whitespace-nowrap px-1 text-xs text-slate-500 sm:ml-auto sm:justify-end">
        <span aria-live="polite">
          {shown === total ? `${total} item${total === 1 ? "" : "s"}` : `${shown} of ${total}`}
        </span>
        {active > 0 ? (
          <button type="button" onClick={onClear} className="rounded-md px-1.5 py-1 font-medium text-indigo-600 hover:bg-indigo-50 hover:text-indigo-500">
            Clear filters
          </button>
        ) : null}
      </div>
    </div>
  );
}
