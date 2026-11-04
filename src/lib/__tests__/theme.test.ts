import { afterEach, describe, expect, it } from "vitest";

import { setTheme } from "../theme";

afterEach(() => {
  document.head.querySelector('meta[name="theme-color"]')?.remove();
  delete document.documentElement.dataset.theme;
});

describe("setTheme", () => {
  it("colours the browser bar like the page: light on light, dark on dark", () => {
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.append(meta);

    setTheme("light");
    expect(meta.content).toBe("#f8fafc");
    expect(document.documentElement.dataset.theme).toBe("light");

    setTheme("dark");
    expect(meta.content).toBe("#0b1120");
  });
});
