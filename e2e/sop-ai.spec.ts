import { expect, test } from "@playwright/test";
import { addAiKey } from "./helpers/credentials.js";
import { choose, openOptions } from "./helpers/select.js";

const BACKEND = "http://localhost:3100";
// Accepted by the fake provider in backend/tests/support/fake-ai.ts; it fails every AI rule it is asked about.
const CLAUDE_KEY = "sk-ant-test-valid-key-0123456789abcdef";

test.beforeEach(async ({ request }) => {
  await request.post(`${BACKEND}/__e2e/reset`);
  await request.post(`${BACKEND}/__e2e/rulebook`);
});

test("opening a ticket reviews it with the developer's own AI model; My work never calls the AI", async ({ page, request }) => {
  await page.goto("/register");
  await page.getByLabel("Name").fill("AI Tester");
  await page.getByLabel("Email").fill(`ai-${Date.now()}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill("password123");
  await page.getByLabel("Confirm password").fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL("/");

  await page.goto("/credentials/new");
  await page.getByLabel("Organization URL").fill("https://dev.azure.com/fake-org");
  await page.getByLabel("Personal access token").fill("fake-pat-token-0123456789abcdefghij");
  await page.getByRole("button", { name: "Save credential" }).click();
  await expect(page).toHaveURL("/credentials");

  // Before AI is set up, the ticket page points to the setup.
  await page.goto("/azure");
  await page.getByRole("list", { name: "My work items" }).getByRole("link", { name: "101 Implement login" }).click();
  // #101 passes its code rules, so the SOP details wait in their tab.
  await page.getByRole("tab", { name: "SOP checks" }).click();
  await expect(page.getByRole("link", { name: "Set up your AI model" })).toBeVisible();

  await page.goto("/credentials");
  await addAiKey(page, "CLAUDE", CLAUDE_KEY);
  await expect(page.getByText(/Key works/)).toBeVisible();
  await choose(page.getByLabel("Provider", { exact: true }), "CLAUDE");
  await choose(page.getByLabel("Model", { exact: true }), "claude-haiku-5-5");
  await page.getByRole("button", { name: "Save AI settings" }).click();
  await expect(page.getByText(/^Saved /)).toBeVisible();

  // My work never calls the AI: no ticket has an AI result until it is opened.
  await page.goto("/azure");
  const table = page.getByRole("list", { name: "My work items" });
  await expect(table.getByRole("link", { name: "101 Implement login" })).toBeVisible();
  // #101 has no code-rule gap and no AI result yet: nothing about SOP on its row.
  await expect(table.getByRole("listitem").filter({ hasText: "101 Implement login" }).last()).not.toContainText("Fake verdict");

  // Opening a ticket reviews it with the AI; its verdict on the AI-only rule shows once it lands.
  await table.getByRole("link", { name: "101 Implement login" }).click();
  await expect(page.getByText("Fake verdict for T-05.")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("AI review", { exact: true }).locator("..")).toContainText("claude-haiku-5-5");

  await page.getByRole("button", { name: "Review again" }).click();
  await expect(page.getByRole("button", { name: "Review again" })).toBeEnabled({ timeout: 15_000 });
  await expect(page.getByText("Fake verdict for T-05.")).toBeVisible();

  // Back on My work, the saved review counts for that ticket only.
  await page.goto("/azure");
  // The AI's gap on the AI-only rule now counts on that row.
  await expect(page.getByRole("list", { name: "My work items" }).getByRole("listitem").filter({ hasText: "101 Implement login" }).last()).toContainText("Fake verdict for T-05");
  await page.getByRole("button", { name: /^Filter/ }).click();
  await expect((await openOptions(page.getByLabel("Checks"))).filter({ hasText: "T-05 · Approach is described (1)" })).toHaveCount(1);
  await page.keyboard.press("Escape");

  const response = await request.get(`${BACKEND}/__e2e/requests`);
  const { requests } = (await response.json()) as { requests: Array<{ isWrite: boolean }> };
  expect(requests.filter((entry) => entry.isWrite)).toEqual([]);
});

test("an AI fix is applied only through the approval dialog", async ({ page, request }) => {
  await request.post(`${BACKEND}/__e2e/ai-fix`, { data: { target: "comment", text: "Approach:\n1. Add the form\n2. Call the auth API" } });

  await page.goto("/register");
  await page.getByLabel("Name").fill("AI Fixer");
  await page.getByLabel("Email").fill(`fix-${Date.now()}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill("password123");
  await page.getByLabel("Confirm password").fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL("/");
  await page.goto("/credentials/new");
  await page.getByLabel("Organization URL").fill("https://dev.azure.com/fake-org");
  await page.getByLabel("Personal access token").fill("fake-pat-token-0123456789abcdefghij");
  await page.getByRole("button", { name: "Save credential" }).click();
  await expect(page).toHaveURL("/credentials");
  await addAiKey(page, "CLAUDE", CLAUDE_KEY);
  await expect(page.getByText(/Key works/)).toBeVisible();
  await choose(page.getByLabel("Provider", { exact: true }), "CLAUDE");
  await choose(page.getByLabel("Model", { exact: true }), "claude-haiku-5-5");
  await page.getByRole("button", { name: "Save AI settings" }).click();
  await expect(page.getByText(/^Saved /)).toBeVisible();

  await page.goto("/azure");
  await page.getByRole("list", { name: "My work items" }).getByRole("link", { name: "102 Fix flaky test" }).click();
  await expect(page.getByText("Suggestion:").first()).toBeVisible({ timeout: 15_000 });
  const draft = page.getByLabel(/Ready to post · Add comment/);
  await expect(draft).toHaveValue("Approach:\n1. Add the form\n2. Call the auth API");
  // The developer can adjust the AI's draft before proposing it.
  await draft.fill("Approach:\n1. Add the form\n2. Call the auth API\n3. Show errors inline");
  await page.getByRole("button", { name: "Use this text…" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("cell", { name: /Approach:\s+1\. Add the form/ })).toBeVisible();
  let writes = ((await (await request.get(`${BACKEND}/__e2e/requests`)).json()) as { requests: Array<{ isWrite: boolean }> }).requests.filter((entry) => entry.isWrite);
  expect(writes).toEqual([]);

  await dialog.getByRole("button", { name: "Approve & execute" }).click();
  await expect(dialog.getByText("Executed in Azure DevOps.")).toBeVisible();
  writes = ((await (await request.get(`${BACKEND}/__e2e/requests`)).json()) as { requests: Array<{ isWrite: boolean }> }).requests.filter((entry) => entry.isWrite);
  expect(writes).toHaveLength(1);

  const item = (await (await request.get(`${BACKEND}/__e2e/work-items/102`)).json()) as { comments: Array<{ text: string }> };
  expect(item.comments.at(-1)?.text).toBe("Approach:<br>1. Add the form<br>2. Call the auth API<br>3. Show errors inline");
});
