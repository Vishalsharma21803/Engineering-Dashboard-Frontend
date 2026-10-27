import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { mockBackend, renderWithProviders } from "@/test/render";
import { CreateCredentialPage } from "../pages/create-credential-page";

/** A slice of the backend registry (GET /api/credentials/platforms). */
const platforms = [
  {
    id: "azure",
    category: "integration",
    label: "Azure DevOps",
    description: "Organization URL and PAT.",
    fields: [
      { name: "organizationUrl", label: "Organization URL", type: "url", required: true },
      { name: "patToken", label: "Personal access token", type: "secret", required: true },
    ],
  },
  {
    id: "solidtime",
    category: "integration",
    label: "Solidtime",
    description: "Server and API token.",
    fields: [
      { name: "baseUrl", label: "Solidtime address", type: "url", required: true },
      { name: "token", label: "API token", type: "secret", required: true },
    ],
  },
  { id: "claude", category: "ai", aiProvider: "CLAUDE", label: "Claude (Anthropic)", description: "", fields: [{ name: "apiKey", label: "API key", type: "secret", required: true }] },
];

describe("CreateCredentialPage", () => {
  it("draws the chosen platform's fields from the backend registry and sends them in one shape", async () => {
    const calls = mockBackend([
      { path: "/api/credentials/platforms", body: { platforms } },
      { method: "POST", path: "/api/credentials/connect", status: 201, body: { kind: "credential", id: "c1", name: "Team", record: {} } },
    ]);
    renderWithProviders(<CreateCredentialPage />, { path: "/credentials/new", route: "/credentials/new" });

    // Integrations only (AI providers have their own section); Azure DevOps first.
    const select = await screen.findByLabelText("Platform");
    expect(within(select).getAllByRole("option").map((option) => option.textContent)).toEqual(["Azure DevOps", "Solidtime"]);
    expect(screen.getByLabelText("Organization URL")).toBeInTheDocument();

    await userEvent.selectOptions(select, "solidtime");
    expect(screen.getByLabelText("Solidtime address")).toBeInTheDocument();
    expect(screen.queryByLabelText("Organization URL")).not.toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Platform"), "azure");
    await userEvent.type(screen.getByLabelText("Label (optional)"), "Team");
    await userEvent.type(screen.getByLabelText("Organization URL"), "https://dev.azure.com/acme");
    await userEvent.type(screen.getByLabelText("Personal access token"), "pat-0123456789abcdefghijkl");
    await userEvent.click(screen.getByRole("button", { name: "Save credential" }));

    await waitFor(() =>
      expect(calls.find((call) => call.method === "POST")?.body).toEqual({ platform: "azure", label: "Team", fields: { organizationUrl: "https://dev.azure.com/acme", patToken: "pat-0123456789abcdefghijkl" } })
    );
  });

  it("shows the backend's field errors under the matching fields", async () => {
    mockBackend([
      { path: "/api/credentials/platforms", body: { platforms } },
      { method: "POST", path: "/api/credentials/connect", status: 400, body: { message: "Validation failed", errors: [{ field: "baseUrl", message: "This Solidtime server is not allowed here" }] } },
    ]);
    renderWithProviders(<CreateCredentialPage />, { path: "/credentials/new", route: "/credentials/new?platform=solidtime" });

    expect(await screen.findByLabelText("Platform")).toHaveValue("solidtime");
    await userEvent.type(screen.getByLabelText("Solidtime address"), "https://evil.example");
    await userEvent.type(screen.getByLabelText("API token"), "st-token-0123456789abcdefghij");
    await userEvent.click(screen.getByRole("button", { name: "Save credential" }));

    expect(await screen.findByText("This Solidtime server is not allowed here")).toBeInTheDocument();
    expect(screen.getByLabelText("Solidtime address")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Check the highlighted fields.");
  });
});
