import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { mockBackend, renderWithProviders } from "@/test/render";
import { AddAiProviderForm } from "../components/add-ai-provider-form";
import { AiProviderCard } from "../components/ai-provider-card";
import { AiSettingsCard } from "../components/ai-settings-card";
import type { AiCredential, AiModelOption } from "../types/ai.types";

const KEY = "sk-or-v1-secret-key-value-0123456789";

const openRouterCredential: AiCredential = {
  id: "11111111-1111-4111-8111-111111111111",
  provider: "OPENROUTER",
  label: null,
  keyHint: "6789",
  lastValidatedAt: null,
  lastValidationStatus: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const freeModel: AiModelOption = {
  provider: "OPENROUTER",
  id: "deepseek/deepseek-chat:free",
  label: "DeepSeek Chat (free)",
  description: null,
  free: true,
  inputPerMTok: 0,
  outputPerMTok: 0,
  cacheReadPerMTok: null,
  contextLength: 128000,
  efforts: [],
  mayCollectData: true,
};

describe("AddAiProviderForm", () => {
  const providers = [
    { id: "claude", category: "ai", aiProvider: "CLAUDE", label: "Claude (Anthropic)", description: "", fields: [{ name: "apiKey", label: "API key", type: "secret", required: true }] },
    { id: "openrouter", category: "ai", aiProvider: "OPENROUTER", label: "OpenRouter", description: "", fields: [{ name: "apiKey", label: "API key", type: "secret", required: true }] },
  ];

  it("adds a key for a provider from the registry with an optional label, checks it, and never displays it", async () => {
    const calls = mockBackend([
      { path: "/api/credentials/platforms", body: { platforms: providers } },
      { method: "POST", path: "/api/credentials/connect", status: 201, body: { kind: "ai", id: openRouterCredential.id, name: "OpenRouter", record: openRouterCredential } },
      {
        method: "POST",
        path: `/api/ai/credentials/${openRouterCredential.id}/validate`,
        body: { valid: true, details: { freeRequestsToday: 3, freeRequestsDailyLimit: 50 }, lastValidatedAt: new Date().toISOString() },
      },
      { path: /\/api\/(credentials|ai|solidtime)/, body: {} },
    ]);
    const onDone = vi.fn();
    renderWithProviders(<AddAiProviderForm existing={new Set(["CLAUDE"])} onDone={onDone} onCancel={vi.fn()} />);

    // A provider that already has a key cannot be added twice; the first free one is chosen.
    expect(await screen.findByRole("option", { name: "Claude (Anthropic) (already added)" })).toBeDisabled();
    expect(screen.getByLabelText("Provider")).toHaveValue("openrouter");
    await userEvent.type(screen.getByLabelText("Label (optional)"), "Team key");
    await userEvent.type(screen.getByLabelText("API key"), KEY);
    await userEvent.click(screen.getByRole("button", { name: "Save & validate" }));

    await waitFor(() => expect(onDone).toHaveBeenCalledWith("OPENROUTER", { tone: "success", text: "Key works. Free-model requests today: 3 of 50." }));
    expect(calls.find((call) => call.url === "/api/credentials/connect")?.body).toEqual({ platform: "openrouter", label: "Team key", fields: { apiKey: KEY } });
    expect(screen.queryByDisplayValue(KEY)).not.toBeInTheDocument();
  });
});

describe("AiProviderCard", () => {
  it("explains a rejected key", async () => {
    mockBackend([
      {
        method: "POST",
        path: `/api/ai/credentials/${openRouterCredential.id}/validate`,
        body: { valid: false, reason: "AI_KEY_INVALID", lastValidatedAt: new Date().toISOString() },
      },
      { path: "/api/ai/credentials", body: { credentials: [] } },
      { path: "/api/ai/preferences", body: { preference: null } },
      { path: "/api/ai/usage", body: { usage: null } },
    ]);
    renderWithProviders(<AiProviderCard credential={openRouterCredential} />);

    expect(screen.getByText("Key ending …6789")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Validate OpenRouter" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The provider rejected this key");
  });

  it("tells OpenCode users whether free models work outside the OpenCode app", async () => {
    const credential = { ...openRouterCredential, provider: "OPENCODE" as const };
    mockBackend([
      {
        method: "POST",
        path: `/api/ai/credentials/${credential.id}/validate`,
        body: { valid: true, details: { freeModelsUsable: false }, lastValidatedAt: new Date().toISOString() },
      },
      { path: "/api/ai/credentials", body: { credentials: [] } },
      { path: "/api/ai/preferences", body: { preference: null } },
      { path: "/api/ai/usage", body: { usage: null } },
    ]);
    renderWithProviders(<AiProviderCard credential={credential} />);

    expect(screen.getByRole("heading", { name: /OpenCode/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Validate OpenCode" }));
    expect(await screen.findByText(/free models only inside the OpenCode app/)).toBeInTheDocument();
  });
});

describe("AiSettingsCard", () => {
  function setup() {
    return mockBackend([
      { path: "/api/ai/credentials", body: { credentials: [openRouterCredential] } },
      {
        path: "/api/ai/preferences",
        body: { preference: { provider: null, model: null, effort: "MEDIUM", dailyLimitUsd: 2, dataCollectionAcceptedAt: null, updatedAt: null } },
      },
      { path: "/api/ai/usage", body: { usage: { todayUsd: 0.12, monthUsd: 1.5, callsToday: 4, resetsAt: new Date().toISOString() } } },
      { path: "/api/ai/models", body: { models: [freeModel] } },
      {
        method: "PUT",
        path: "/api/ai/preferences",
        body: { preference: { provider: "OPENROUTER", model: freeModel.id, effort: "MEDIUM", dailyLimitUsd: 0, dataCollectionAcceptedAt: new Date().toISOString(), updatedAt: new Date().toISOString() } },
      },
    ]);
  }

  it("requires the data notice before a free model can be saved", async () => {
    const calls = setup();
    renderWithProviders(<AiSettingsCard />);

    await userEvent.selectOptions(await screen.findByLabelText("Provider"), "OPENROUTER");
    await waitFor(() => expect(screen.getByLabelText("Model")).not.toBeDisabled());
    await userEvent.selectOptions(screen.getByLabelText("Model"), freeModel.id);

    expect(screen.getByText(/This model doesn't offer an effort setting/)).toBeInTheDocument();
    expect(screen.getByText(/Data notice/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save AI settings" })).toBeDisabled();

    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.clear(screen.getByLabelText("Daily spend limit (USD)"));
    await userEvent.type(screen.getByLabelText("Daily spend limit (USD)"), "0");
    await userEvent.click(screen.getByRole("button", { name: "Save AI settings" }));

    await waitFor(() =>
      expect(calls.find((call) => call.method === "PUT")?.body).toEqual({
        provider: "OPENROUTER",
        model: freeModel.id,
        effort: "MEDIUM",
        dailyLimitUsd: 0,
        acceptDataCollection: true,
      })
    );
  });

  it("enables Save only when something changed, and disables it again when changes are undone", async () => {
    const calls = setup();
    renderWithProviders(<AiSettingsCard />);

    const save = await screen.findByRole("button", { name: "Save AI settings" });
    const limit = screen.getByLabelText("Daily spend limit (USD)");
    expect(save).toBeDisabled();

    await userEvent.clear(limit);
    await userEvent.type(limit, "5");
    expect(save).toBeEnabled();
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();

    // Same value written differently is not a change.
    await userEvent.clear(limit);
    await userEvent.type(limit, "2.0");
    expect(save).toBeDisabled();

    // An empty limit is a change but cannot be saved.
    await userEvent.clear(limit);
    expect(save).toBeDisabled();
    expect(screen.getByText(/Unsaved changes: choose a model/)).toBeInTheDocument();

    // Choosing a provider without a model is not saveable either.
    await userEvent.type(limit, "2");
    await userEvent.selectOptions(screen.getByLabelText("Provider"), "OPENROUTER");
    expect(save).toBeDisabled();
    await userEvent.selectOptions(screen.getByLabelText("Provider"), "");
    expect(save).toBeDisabled();
    expect(calls.some((call) => call.method === "PUT")).toBe(false);
  });

  it("shows an error with a retry instead of loading forever when the saved settings cannot be read", async () => {
    mockBackend([
      { path: "/api/ai/credentials", body: { credentials: [openRouterCredential] } },
      { path: "/api/ai/preferences", status: 500, body: { message: "Database unavailable" } },
    ]);
    renderWithProviders(<AiSettingsCard />);

    const alert = await screen.findByRole("alert");
    expect(screen.queryByText(/Loading AI settings/)).not.toBeInTheDocument();

    setup();
    await userEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("button", { name: "Save AI settings" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("says usage could not be loaded instead of showing empty figures", async () => {
    mockBackend([
      { path: "/api/ai/credentials", body: { credentials: [openRouterCredential] } },
      {
        path: "/api/ai/preferences",
        body: { preference: { provider: null, model: null, effort: "MEDIUM", dailyLimitUsd: 2, dataCollectionAcceptedAt: null, updatedAt: null } },
      },
      { path: "/api/ai/usage", status: 500, body: { message: "Database unavailable" } },
    ]);
    renderWithProviders(<AiSettingsCard />);

    expect(await screen.findByRole("alert")).toHaveTextContent("AI usage could not be loaded.");
    expect(screen.queryByLabelText("AI usage")).not.toBeInTheDocument();
  });

  it("only offers providers the user has a key for, and shows usage", async () => {
    setup();
    renderWithProviders(<AiSettingsCard />);

    const claudeOption = (await screen.findByRole("option", { name: /Claude \(Anthropic\) \(add a key first\)/ })) as HTMLOptionElement;
    expect(claudeOption.disabled).toBe(true);
    const strip = screen.getByLabelText("AI usage");
    await waitFor(() => expect(strip).toHaveTextContent("Spent today$0.12 of $2.00"));
    expect(strip).toHaveTextContent("Calls today4");
    expect(strip).toHaveTextContent("This month$1.50");
  });
});
