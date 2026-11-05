import { BrandMark } from "@/components/brand/brand-mark";
import { cn } from "@/utils/cn";

interface BrandLogoProps {
  className?: string;
  /** Classes for the wordmark, e.g. to keep it for screen readers only where space is short. */
  textClassName?: string;
  inverted?: boolean;
  showSubtitle?: boolean;
}

export function BrandLogo({
  className,
  textClassName,
  inverted = false,
  showSubtitle = true,
}: BrandLogoProps) {
  return (
    <span className={cn("flex items-center gap-3", className)}>
      <BrandMark inverted={inverted} />
      <span className={cn("flex flex-col whitespace-nowrap leading-tight", textClassName)}>
        <span
          className={cn(
            "text-sm font-semibold tracking-tight",
            inverted ? "text-white" : "text-slate-950"
          )}
        >
          Relay
        </span>
        {showSubtitle ? (
          <span
            className={cn(
              "text-xs",
              inverted ? "text-slate-400" : "text-slate-500"
            )}
          >
            Engineering workspace
          </span>
        ) : null}
      </span>
    </span>
  );
}
