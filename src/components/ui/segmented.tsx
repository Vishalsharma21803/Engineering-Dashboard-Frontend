import { cn } from "@/utils/cn";

interface SegmentedProps<T extends string> {
  /** The group's accessible name. */
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  size?: "sm" | "md";
  className?: string;
}

/** A two-or-three-way switch (one pressed button in a group): the one toggle style used across Cockpit. */
export function Segmented<T extends string>({ label, value, options, onChange, size = "md", className }: SegmentedProps<T>) {
  return (
    <div role="group" aria-label={label} className={cn("inline-flex w-fit rounded-lg bg-slate-100 p-0.5", className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-md font-medium whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500",
            size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm",
            value === option.value ? "bg-surface text-slate-950 shadow-xs" : "text-slate-600 hover:text-slate-900"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
