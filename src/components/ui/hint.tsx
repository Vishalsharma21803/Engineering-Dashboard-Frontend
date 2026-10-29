import type { ReactElement, ReactNode } from "react";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface HintProps {
  label: ReactNode;
  /** One element that accepts a ref and pointer/focus handlers (a button, or a span). */
  children: ReactElement;
  side?: "top" | "right" | "bottom" | "left";
}

/** A shadcn/ui Tooltip on one element, in place of a title attribute. */
export function Hint({ label, children, side = "top" }: HintProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side={side} sideOffset={6}>
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
