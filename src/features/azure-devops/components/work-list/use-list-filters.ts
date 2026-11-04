import { useEffect, useState } from "react";

import type { WorkItemListFilters } from "../../types/azure.types";
import { readStored, writeStored } from "../../utils/stored";

const EMPTY_WORK_ITEM_FILTERS: WorkItemListFilters = {
  search: "",
  type: "",
  stateCategory: "",
  priority: "",
  sop: "",
  assignee: "",
};

const SEARCH_DELAY_MS = 300;

/** Filters in the page (remembered when `storageKey` is set); the search box waits for typing to pause. */
export function useListFilters(onChange: () => void, storageKey?: string) {
  const [filters, setFilters] = useState<WorkItemListFilters>(() =>
    storageKey ? { ...EMPTY_WORK_ITEM_FILTERS, ...readStored<Partial<WorkItemListFilters>>(storageKey, {}), search: "" } : EMPTY_WORK_ITEM_FILTERS
  );
  const [searchInput, setSearchInput] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFilters((current) => (current.search === searchInput.trim() ? current : { ...current, search: searchInput.trim() }));
    }, SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (storageKey) writeStored(storageKey, { ...filters, search: "" });
  }, [filters, storageKey]);

  return {
    filters,
    searchInput,
    setSearchInput: (value: string) => {
      setSearchInput(value);
      onChange();
    },
    set: (key: keyof WorkItemListFilters) => (value: string) => {
      setFilters((current) => ({ ...current, [key]: value }));
      onChange();
    },
    clear: () => {
      setFilters(EMPTY_WORK_ITEM_FILTERS);
      setSearchInput("");
      onChange();
    },
  };
}
