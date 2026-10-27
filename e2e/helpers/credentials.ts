import { expect, type Page } from "@playwright/test";

/** Adds an AI provider key from the Credentials page's single "Add AI provider" form (saves, then checks it). */
export async function addAiKey(page: Page, provider: "CLAUDE" | "OPENROUTER" | "OPENCODE", key: string) {
  await page.getByRole("button", { name: /Add AI provider/ }).click();
  const panel = page.getByRole("region", { name: "Add AI provider" });
  // Provider options are the backend registry's ids.
  await panel.getByLabel("Provider").selectOption(provider.toLowerCase());
  await panel.getByLabel("API key").fill(key);
  await panel.getByRole("button", { name: "Save & validate" }).click();
  // The panel closes once the key is saved and checked.
  await expect(panel).toHaveCount(0);
}

/** Connects Solidtime from the Add credential page (Platform: Solidtime) and returns to Credentials. */
export async function connectSolidtime(page: Page, address: string, token: string) {
  await page.goto("/credentials/new?platform=solidtime");
  await expect(page.getByLabel("Platform")).toHaveValue("solidtime");
  const form = page.getByRole("form", { name: "Connect Solidtime" });
  await form.getByLabel("Solidtime address").fill(address);
  await form.getByLabel("API token").fill(token);
  await form.getByRole("button", { name: "Save credential" }).click();
  await expect(page).toHaveURL("/credentials");
}
