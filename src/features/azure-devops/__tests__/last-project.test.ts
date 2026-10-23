import { beforeEach, describe, expect, it } from "vitest";

import { resolveDefaultProject, saveSelectedProject } from "../utils/last-project";

const projects = [
  { id: "a", name: "Alpha" },
  { id: "b", name: "Beta" },
];

describe("resolveDefaultProject", () => {
  beforeEach(() => window.localStorage.clear());

  it("prefers the current selection, by id or name", () => {
    expect(resolveDefaultProject("org", "b", projects)).toBe("b");
    expect(resolveDefaultProject("org", "Beta", projects)).toBe("Beta");
  });

  it("falls back to the remembered project for this organization only", () => {
    saveSelectedProject("org", "b");
    expect(resolveDefaultProject("org", "", projects)).toBe("b");
    expect(resolveDefaultProject("other-org", "", projects)).toBe("a");
  });

  it("ignores remembered projects that no longer exist", () => {
    saveSelectedProject("org", "gone");
    expect(resolveDefaultProject("org", "", projects)).toBe("a");
    expect(resolveDefaultProject("org", "gone", projects)).toBe("a");
  });

  it("returns null when the organization has no projects", () => {
    expect(resolveDefaultProject("org", "", [])).toBeNull();
  });
});
