import { ListFilter, Search } from "lucide-react";
import type { ReactNode } from "react";

import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SelectField } from "@/components/ui/select-field";
import { cn } from "@/utils/cn";
import type { WorkItemListFilters } from "../../types/azure.types";
import type { useListFilters } from "./use-list-filters";

interface FilterOptionLike {
  value: string;
  label: string;
  count?: number;
}

/** Search stays on screen; the dropdown filters fold into one "Filter" button (with how many are on). */
export function ListToolbar({
  list,
  definitions,
  extra,
}: {
  list: ReturnType<typeof useListFilters>;
  definitions: Array<{ id: keyof WorkItemListFilters; label: string; options: FilterOptionLike[] }>;
  extra?: ReactNode;
}) {
  const active = definitions.filter((definition) => list.filters[definition.id] !== "").length;
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
      <div className="relative min-w-0 flex-1 basis-48 sm:max-w-64">
        <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <Input type="search" aria-label="Search ID, title or tag" placeholder="Search ID, title or tag" value={list.searchInput} onChange={(event) => list.setSearchInput(event.target.value)} className="h-8 pl-8 text-sm" />
      </div>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500",
              active > 0 ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-surface text-slate-700 hover:bg-slate-50"
            )}
          >
            <ListFilter aria-hidden="true" className="size-4" />
            Filter{active > 0 ? ` · ${active}` : ""}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 space-y-3 p-3">
          {definitions.map((definition) => (
            <label key={definition.id} className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              {definition.label}
              <SelectField aria-label={definition.label} size="sm" value={list.filters[definition.id]} onValueChange={list.set(definition.id)}>
                <option value="">All</option>
                {definition.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                    {option.count !== undefined ? ` (${option.count})` : ""}
                  </option>
                ))}
              </SelectField>
            </label>
          ))}
          {extra}
          {active > 0 || list.searchInput ? (
            <button type="button" onClick={list.clear} className="text-xs font-medium text-indigo-700 hover:underline">
              Clear filters
            </button>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  );
}
