import { useLayoutEffect, useRef } from "react";

import { cn } from "@/utils/cn";

interface ActiveIndicatorProps {
  /** "pill" sits behind the active link; "underline" runs along the bottom of the active tab. */
  variant: "pill" | "underline";
  className?: string;
}

const ACTIVE_SELECTOR = '[aria-current="page"], [aria-selected="true"]';

/**
 * Glides to whichever child of its parent is current (a NavLink's aria-current
 * or a tab's aria-selected). Purely visual: it only reads those attributes, so
 * routing and tab state stay where they are. The parent must be positioned.
 */
export function ActiveIndicator({ variant, className }: ActiveIndicatorProps) {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const indicator = ref.current;
    const container = indicator?.parentElement;
    if (!indicator || !container) return;

    let frame = 0;

    const place = () => {
      const active = container.querySelector<HTMLElement>(ACTIVE_SELECTOR);
      if (!active || active.offsetWidth === 0) {
        indicator.style.opacity = "0";
        return;
      }

      // Exact (fractional) box, not offsetLeft/offsetWidth: those round, and on the last tab the
      // rounded-up width ran up to 1px past the end of a scrollable tab bar, giving it a scrollbar.
      const box = container.getBoundingClientRect();
      const rect = active.getBoundingClientRect();
      const left = rect.left - box.left - container.clientLeft + container.scrollLeft;
      const top = rect.top - box.top - container.clientTop + container.scrollTop;

      indicator.style.width = `${rect.width}px`;
      if (variant === "pill") {
        indicator.style.height = `${rect.height}px`;
        indicator.style.transform = `translate(${left}px, ${top}px)`;
      } else {
        indicator.style.transform = `translateX(${left}px)`;
      }
      indicator.style.opacity = "1";
    };

    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };

    place();
    // The first position is set without motion; later moves glide.
    const ready = requestAnimationFrame(() => indicator.setAttribute("data-ready", ""));

    const mutations = new MutationObserver(schedule);
    mutations.observe(container, { subtree: true, childList: true, attributes: true, attributeFilter: ["aria-current", "aria-selected"] });

    const resizes = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    resizes?.observe(container);
    for (const child of Array.from(container.children)) resizes?.observe(child);

    void document.fonts?.ready.then(schedule);

    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(ready);
      mutations.disconnect();
      resizes?.disconnect();
    };
  }, [variant]);

  return (
    <span
      ref={ref}
      aria-hidden="true"
      className={cn(
        "active-indicator pointer-events-none absolute left-0",
        variant === "pill" ? "top-0 rounded-lg bg-indigo-50 ring-1 ring-inset ring-indigo-200" : "bottom-0 h-0.5 rounded-full bg-indigo-600",
        className
      )}
    />
  );
}
