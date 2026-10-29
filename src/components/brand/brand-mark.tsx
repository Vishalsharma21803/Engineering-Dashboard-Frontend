import { cn } from "@/utils/cn";

interface BrandMarkProps {
  className?: string;
  inverted?: boolean;
}

export function BrandMark({
  className,
  inverted = false,
}: BrandMarkProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-[inset_0_1px_0_0_rgb(255_255_255/0.25),0_2px_8px_-2px_rgb(49_30_160/0.5)]",
        inverted && "ring-1 ring-white/15",
        className
      )}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-5"
      >
        <path d="M4 7h16" />
        <path d="M4 12h9" />
        <path d="M4 17h6" />
        <circle cx="18" cy="17" r="3" />
        <path d="m20.5 19.5 1.5 1.5" />
      </svg>
    </span>
  );
}
