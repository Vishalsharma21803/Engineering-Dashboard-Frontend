import { expect, test } from "@playwright/test";
import { addAiKey } from "./helpers/credentials.js";

const BACKEND = "http://localhost:3100";
// Keys accepted by the fake providers in backend/tests/support/fake-ai.ts.
const CLAUDE_KEY = "sk-ant-test-valid-key-0123456789abcdef";
const OPENROUTER_KEY = "sk-or-v1-test-valid-key-0123456789abcd";

test.beforeEach(async ({ request }) => {
  await request.post(`${BACKEND}/__e2e/reset`);
});

test("a developer adds their own AI keys and picks a free model with consent", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Name").fill("Owner");
  await page.getByLabel("Email").fill("owner@example.com");
  await page.getByLabel("Password", { exact: true }).fill("password123");
  await page.getByLabel("Confirm password").fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL("/");

  await page.goto("/credentials");
  await expect(page.getByRole("heading", { name: "AI providers" })).toBeVisible();

  // Claude key: saved, validated, never shown again
  await addAiKey(page, "CLAUDE", CLAUDE_KEY);
  await expect(page.getByText(/Key works\. Models available: Claude Opus 5\.5/)).toBeVisible();
  await expect(page.getByText("…cdef")).toBeVisible();
  await expect(page.locator(`input[value="${CLAUDE_KEY}"]`)).toHaveCount(0);

  // OpenRouter key
  await addAiKey(page, "OPENROUTER", OPENROUTER_KEY);
  await expect(page.getByText(/Free-model requests today: 3 of 50/)).toBeVisible();

  // Settings: free model requires the data notice
  await page.getByLabel("Provider", { exact: true }).selectOption("OPENROUTER");
  await page.getByLabel("Model", { exact: true }).selectOption("deepseek/deepseek-chat:free");
  const save = page.getByRole("button", { name: "Save AI settings" });
  await expect(save).toBeDisabled();
  await page.getByRole("checkbox", { name: /Data notice/ }).check();
  await save.click();
  await expect(page.getByText(/^Saved /)).toBeVisible();

  // Switch to Claude Sonnet with High effort
  await page.getByLabel("Provider", { exact: true }).selectOption("CLAUDE");
  await page.getByLabel("Model", { exact: true }).selectOption("claude-sonnet-5-5");
  await page.getByLabel("Effort", { exact: true }).selectOption("HIGH");
  await save.click();
  await expect(page.getByText(/^Saved /)).toBeVisible();
  await expect(page.getByLabel("Effort", { exact: true })).toHaveValue("HIGH");
  await page.reload();
  await expect(page.getByLabel("Model", { exact: true })).toHaveValue("claude-sonnet-5-5");

  // SOP owner can restrict OpenRouter models
  await expect(page.getByRole("heading", { name: /OpenRouter models offered/ })).toBeVisible();
  await page.getByRole("checkbox", { name: /deepseek\/deepseek-r1/ }).check();
  await page.getByRole("button", { name: "Save model list" }).click();
  await expect(page.getByText("1 models allowed.")).toBeVisible();
});

test("a developer adds an OpenCode key and picks a paid OpenCode model", async ({ page }) => {
  // Accepted by the fake OpenCode in backend/tests/support/fake-ai.ts, which refuses free models like the real one.
  const OPENCODE_KEY = "oc-test-valid-key-0123456789abcdef";

  await page.goto("/register");
  await page.getByLabel("Name").fill("OC User");
  await page.getByLabel("Email").fill(`oc-${Date.now()}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill("password123");
  await page.getByLabel("Confirm password").fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL("/");

  await page.goto("/credentials");
  await addAiKey(page, "OPENCODE", OPENCODE_KEY);
  await expect(page.getByText(/free models only inside the OpenCode app/)).toBeVisible();
  await expect(page.locator(`input[value="${OPENCODE_KEY}"]`)).toHaveCount(0);

  await page.getByLabel("Provider", { exact: true }).selectOption("OPENCODE");
  await page.getByLabel("Model", { exact: true }).selectOption("glm-5.3-flash");
  await page.getByRole("button", { name: "Save AI settings" }).click();
  await expect(page.getByText(/^Saved /)).toBeVisible();
});
