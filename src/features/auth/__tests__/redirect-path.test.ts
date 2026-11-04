import { describe, expect, it } from "vitest";

import { getPostLoginRedirect } from "../utils/redirect-path";

describe("getPostLoginRedirect", () => {
  it("returns to the exact page, with its filters and anchor", () => {
    expect(getPostLoginRedirect({ from: { pathname: "/azure/c1", search: "?project=a&page=2", hash: "#pipelines" } })).toBe("/azure/c1?project=a&page=2#pipelines");
  });

  it("ignores a search or hash that is not one", () => {
    expect(getPostLoginRedirect({ from: { pathname: "/time", search: "project=a", hash: "x" } })).toBe("/time");
  });

  it("never leaves the app or loops back to sign-in", () => {
    expect(getPostLoginRedirect({ from: { pathname: "//evil.example", search: "?a=1" } })).toBe("/");
    expect(getPostLoginRedirect({ from: { pathname: "/\\evil.example" } })).toBe("/");
    expect(getPostLoginRedirect({ from: { pathname: "https://evil.example/" } })).toBe("/");
    expect(getPostLoginRedirect({ from: { pathname: "/login", search: "?x=1" } })).toBe("/");
    expect(getPostLoginRedirect(null)).toBe("/");
  });
});
