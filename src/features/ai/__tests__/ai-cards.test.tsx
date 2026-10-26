import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { mockBackend, renderWithProviders } from "@/test/render";
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

describe("AiProviderCard", () => {
  it("saves a new key, validates it, and never displays it", async () => {
    const calls = mockBackend([
      { method: "POST", path: "/api/ai/credentials", status: 201, body: { credential: openRouterCredential } },
      {
        method: "POST",
        path: `/api/ai/credentials/${openRouterCredential.id}/validate`,
        body: { valid: true, details: { freeRequestsToday: 3, freeRequestsDailyLimit: 50 }, lastValidatedAt: new Date().toISOString() },
      },
      { path: "/api/ai/credentials", body: { credentials: [] } },
      { path: "/api/ai/preferences", body: { preference: null } },
      { path: "/api/ai/usage", body: { usage: null } },
    ]);
    renderWithProviders(<AiProviderCard provider="OPENROUTER" credential={undefined} />);

    await userEvent.type(screen.getByLabelText("API key"), KEY);
    await userEvent.click(screen.getByRole("button", { name: "Save & validate" }));

    expect(await screen.findByText(/Key works\. Free-model requests today: 3 of 50\./)).toBeInTheDocument();
    expect(calls.find((call) => call.method === "POST" && call.url === "/api/ai/credentials")?.body).toEqual({
      provider: "OPENROUTER",
      apiKey: KEY,
    });
    expect(screen.queryByDisplayValue(KEY)).not.toBeInTheDocument();
  });

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
    renderWithProviders(<AiProviderCard provider="OPENROUTER" credential={openRouterCredential} />);

    expect(screen.getByText("…6789")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Validate" }));
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
    renderWithProviders(<AiProviderCard provider="OPENCODE" credential={credential} />);

    expect(screen.getByRole("heading", { name: /OpenCode/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Validate" }));
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

  it("only offers providers the user has a key for, and shows usage", async () => {
    setup();
    renderWithProviders(<AiSettingsCard />);

    const claudeOption = (await screen.findByRole("option", { name: /Claude \(Anthropic\) \(add a key first\)/ })) as HTMLOptionElement;
    expect(claudeOption.disabled).toBe(true);
    const usage = (await screen.findByText(/\(4 calls\)/)).closest("p");
    expect(usage).toHaveTextContent("Today $0.12 (4 calls) · This month $1.50");
  });
});
