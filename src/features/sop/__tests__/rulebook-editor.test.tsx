import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { mockBackend, renderWithProviders } from "@/test/render";
import { RulebookEditor } from "../components/rulebook-editor";
import type { CardSummary, ValidationResult } from "../types/sop.types";

const card: CardSummary = {
  id: "MY-01",
  title: "Bugs name the browser",
  checker: "ai",
  uses: null,
  appliesTo: ["bug"],
  when: "always",
  severity: "warn",
  origin: "personal",
};

const valid: ValidationResult = { valid: true, errors: [], summary: { projects: [], cards: [card], overrides: [] } };
const invalid: ValidationResult = {
  valid: false,
  errors: [{ field: "line 2", message: 'MY-01: "nope" is not a built-in check' }],
  summary: { projects: [], cards: [], overrides: [] },
};

const empty = { version: 0, content: "", createdAt: null };

describe("RulebookEditor", () => {
  it("validates as you type and saves a valid personal rulebook", async () => {
    const calls = mockBackend([
      { method: "POST", path: "/api/sop/validate", body: valid },
      { path: "/api/sop/my-rules/versions", body: { versions: [] } },
      { method: "PUT", path: "/api/sop/my-rules", body: { rulebook: { version: 1, content: "x", createdAt: new Date().toISOString() } } },
    ]);
    renderWithProviders(<RulebookEditor scope="personal" initial={empty} canSave />);

    fireEvent.change(screen.getByLabelText("My rules"), { target: { value: "---\nid: MY-01\n---" } });
    expect(await screen.findByText(/✓ Valid · 1 rules · 0 overrides/, {}, { timeout: 2000 })).toBeInTheDocument();
    expect(screen.getByText("Bugs name the browser")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Save as new version" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Saved as version 1.");
    expect(calls.find((call) => call.method === "PUT")?.body).toEqual({ content: "---\nid: MY-01\n---" });
  });

  it("shows problems with line numbers and blocks saving", async () => {
    mockBackend([
      { method: "POST", path: "/api/sop/validate", body: invalid },
      { path: "/api/sop/my-rules/versions", body: { versions: [] } },
    ]);
    renderWithProviders(<RulebookEditor scope="personal" initial={empty} canSave />);

    fireEvent.change(screen.getByLabelText("My rules"), { target: { value: "---\nbad\n---" } });
    expect(await screen.findByText(/1 problem\(s\) to fix/, {}, { timeout: 2000 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Line 2" })).toBeInTheDocument();
    expect(screen.getByText(/"nope" is not a built-in check/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save as new version" })).toBeDisabled();
  });

  it("is read-only for non-owners on the default rulebook", async () => {
    mockBackend([
      { method: "POST", path: "/api/sop/validate", body: valid },
      { path: "/api/sop/rulebook/versions", body: { versions: [] } },
    ]);
    renderWithProviders(
      <RulebookEditor scope="default" initial={{ ...empty, content: "rules" }} canSave={false} readOnlyReason="Only SOP owners can change the default rules." />
    );

    expect(screen.getByText("Only SOP owners can change the default rules.")).toBeInTheDocument();
    expect(screen.getByLabelText("Default rulebook")).toHaveAttribute("readonly");
    expect(screen.queryByRole("button", { name: "Save as new version" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Import .md" })).not.toBeInTheDocument();
  });
});
