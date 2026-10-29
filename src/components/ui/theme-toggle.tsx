import { useState, type MouseEvent } from "react";
import { flushSync } from "react-dom";

import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { currentTheme, setTheme, type Theme } from "@/lib/theme";

/** Switches between light and dark mode; where supported, the new theme spreads out from the button. */
export function ThemeToggle() {
  const [theme, setThemeState] = useState<Theme>(currentTheme);
  const next: Theme = theme === "dark" ? "light" : "dark";

  function apply() {
    setTheme(next);
    setThemeState(next);
  }

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!document.startViewTransition || reduceMotion) {
      apply();
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const x = bounds.left + bounds.width / 2;
    const y = bounds.top + bounds.height / 2;
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));

    const transition = document.startViewTransition(() => flushSync(apply));
    void transition.ready.then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 560, easing: "cubic-bezier(0.16, 1, 0.3, 1)", pseudoElement: "::view-transition-new(root)" }
      );
    });
  }

  return (
    <Hint label={`Switch to ${next} mode`} side="bottom">
      <Button
        variant="ghost"
        size="sm"
        aria-label={`Switch to ${next} mode`}
        onClick={handleClick}
      >
        {theme === "dark" ? (
          <svg key="sun" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="icon-swap size-4">
            <path d="M10 2a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 10 2Zm0 13a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 10 15Zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm5.657-1.596a.75.75 0 1 0-1.06-1.06l-1.061 1.06a.75.75 0 0 0 1.06 1.06l1.06-1.06Zm-9.193 9.192a.75.75 0 1 0-1.06-1.06l-1.06 1.06a.75.75 0 0 0 1.06 1.06l1.06-1.06ZM18 10a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 18 10ZM5 10a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 5 10Zm9.596 5.657a.75.75 0 0 0 1.06-1.06l-1.06-1.061a.75.75 0 1 0-1.06 1.06l1.06 1.06ZM5.404 6.464a.75.75 0 0 0 1.06-1.06l-1.06-1.06a.75.75 0 1 0-1.061 1.06l1.06 1.06Z" />
          </svg>
        ) : (
          <svg key="moon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="icon-swap size-4">
            <path fillRule="evenodd" d="M7.455 2.004a.75.75 0 0 1 .26.77 7 7 0 0 0 9.958 7.967.75.75 0 0 1 1.067.853A8.5 8.5 0 1 1 6.647 1.921a.75.75 0 0 1 .808.083Z" clipRule="evenodd" />
          </svg>
        )}
        <span className="hidden 2xl:inline">{theme === "dark" ? "Light" : "Dark"}</span>
      </Button>
    </Hint>
  );
}
