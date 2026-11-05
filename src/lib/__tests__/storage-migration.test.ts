import { beforeEach, describe, expect, it } from "vitest";

import { migrateLegacyKeys, migrateLegacyStorage } from "../storage-migration";

describe("migrateLegacyKeys", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("moves every old cockpit setting to its relay key once, keeping its value", () => {
    window.localStorage.setItem("cockpit-theme", "dark");
    window.localStorage.setItem("cockpit:my-work-filters:c1", '{"types":["Bug"]}');
    window.localStorage.setItem("cockpit:tips-dismissed", "1");
    window.localStorage.setItem("unrelated", "kept");

    migrateLegacyKeys(window.localStorage);

    expect(window.localStorage.getItem("relay-theme")).toBe("dark");
    expect(window.localStorage.getItem("relay:my-work-filters:c1")).toBe('{"types":["Bug"]}');
    expect(window.localStorage.getItem("relay:tips-dismissed")).toBe("1");
    expect(window.localStorage.getItem("cockpit-theme")).toBeNull();
    expect(window.localStorage.getItem("cockpit:tips-dismissed")).toBeNull();
    expect(window.localStorage.getItem("unrelated")).toBe("kept");
  });

  it("never overwrites a setting already saved under the new key", () => {
    window.localStorage.setItem("relay-theme", "light");
    window.localStorage.setItem("cockpit-theme", "dark");

    migrateLegacyKeys(window.localStorage);

    expect(window.localStorage.getItem("relay-theme")).toBe("light");
    expect(window.localStorage.getItem("cockpit-theme")).toBeNull();
  });

  it("also moves unsaved edits kept in sessionStorage when the app starts", () => {
    window.sessionStorage.setItem("cockpit:unsaved:u1:rulebook", "draft text");
    window.localStorage.setItem("cockpit:collapsed:c1", "[50]");

    migrateLegacyStorage();

    expect(window.sessionStorage.getItem("relay:unsaved:u1:rulebook")).toBe("draft text");
    expect(window.sessionStorage.getItem("cockpit:unsaved:u1:rulebook")).toBeNull();
    expect(window.localStorage.getItem("relay:collapsed:c1")).toBe("[50]");
  });
});
