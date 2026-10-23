import { BrandMark } from "@/components/brand/brand-mark";
import { cn } from "@/utils/cn";

interface BrandLogoProps {
  className?: string;
  inverted?: boolean;
  showSubtitle?: boolean;
}

export function BrandLogo({
  className,
  inverted = false,
  showSubtitle = true,
}: BrandLogoProps) {
  return (
    <span className={cn("flex items-center gap-3", className)}>
      <BrandMark inverted={inverted} />
      <span className="flex flex-col leading-tight">
        <span
          className={cn(
            "text-sm font-semibold tracking-tight",
            inverted ? "text-white" : "text-slate-950"
          )}
        >
          Engineer Cockpit
        </span>
        {showSubtitle ? (
          <span
            className={cn(
              "text-xs",
              inverted ? "text-slate-400" : "text-slate-500"
            )}
          >
            Azure DevOps workspace
          </span>
        ) : null}
      </span>
    </span>
  );
}
