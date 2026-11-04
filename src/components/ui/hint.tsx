import { useRef, useState, type ReactElement, type ReactNode } from "react";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface HintProps {
  label: ReactNode;
  /** One element that accepts a ref and pointer/focus handlers (a button, or a span). */
  children: ReactElement;
  side?: "top" | "right" | "bottom" | "left";
  /**
   * The hint carries information found nowhere else on screen: the element (a span) joins
   * the tab order, opens on focus, and a tap toggles it on touch screens. Leave it off
   * for hints on buttons, which are focusable already.
   */
  focusable?: boolean;
}

/** A shadcn/ui Tooltip on one element, in place of a title attribute. */
export function Hint({ label, children, side = "top", focusable = false }: HintProps) {
  const [open, setOpen] = useState(false);
  // Radix closes an open tooltip on pointer down; remember whether it was open so the tap that follows toggles it once.
  const openAtPointerDown = useRef(false);

  const content = (
    <TooltipContent side={side} sideOffset={6}>
      {label}
    </TooltipContent>
  );

  if (!focusable) {
    return (
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>{children}</TooltipTrigger>
          {content}
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger
          asChild
          tabIndex={0}
          onPointerDown={() => {
            openAtPointerDown.current = open;
          }}
          onClick={(event) => {
            // Skips Radix's close-on-click: the tap itself decides.
            event.preventDefault();
            setOpen(!openAtPointerDown.current);
          }}
        >
          {children}
        </TooltipTrigger>
        {content}
      </Tooltip>
    </TooltipProvider>
  );
}
