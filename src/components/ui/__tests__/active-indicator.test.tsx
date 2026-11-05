import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ActiveIndicator } from "../active-indicator";

const rect = (left: number, width: number) =>
  ({ left, width, top: 0, height: 40, right: left + width, bottom: 40, x: left, y: 0, toJSON: () => ({}) }) as DOMRect;

describe("ActiveIndicator", () => {
  afterEach(() => vi.restoreAllMocks());

  it("follows the active tab's exact (fractional) box, so it never ends past the last tab", () => {
    // jsdom has no layout. The bar is 321px wide at x=10; the last tab starts 207.6px in and is 113.4px wide,
    // which offsetLeft/offsetWidth would round to 208 + 114 = 322: one pixel past the bar's end.
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.tagName === "NAV") return rect(10, 321);
      return this.getAttribute("aria-current") === "page" ? rect(217.6, 113.4) : rect(10, 60);
    });
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(114);

    const { container } = render(
      <nav style={{ position: "relative" }}>
        <ActiveIndicator variant="underline" />
        <a href="/one">One</a>
        <a href="/last" aria-current="page">
          Last
        </a>
      </nav>
    );

    const indicator = container.querySelector<HTMLElement>(".active-indicator")!;
    expect(indicator.style.width).toBe("113.4px");
    expect(indicator.style.transform).toBe("translateX(207.6px)");
  });
});
