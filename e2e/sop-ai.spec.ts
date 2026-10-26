import { expect, test } from "@playwright/test";

const BACKEND = "http://localhost:3100";
// Accepted by the fake provider in backend/tests/support/fake-ai.ts; it fails every AI rule it is asked about.
const CLAUDE_KEY = "sk-ant-test-valid-key-0123456789abcdef";

test.beforeEach(async ({ request }) => {
  await request.post(`${BACKEND}/__e2e/reset`);
  await request.post(`${BACKEND}/__e2e/rulebook`);
});

test("My work checks wording rules with the developer's own AI model", async ({ page, request }) => {
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
  await page.getByRole("table").getByRole("link", { name: "#101 Implement login" }).click();
  await expect(page.getByRole("link", { name: "Set up your AI model" })).toBeVisible();

  await page.goto("/credentials");
  await page.locator("#ai-key-CLAUDE").fill(CLAUDE_KEY);
  await page.getByRole("button", { name: "Save & validate" }).first().click();
  await expect(page.getByText(/Key works/)).toBeVisible();
  await page.getByLabel("Provider", { exact: true }).selectOption("CLAUDE");
  await page.getByLabel("Model", { exact: true }).selectOption("claude-haiku-5-5");
  await page.getByRole("button", { name: "Save AI settings" }).click();
  await expect(page.getByText(/^Saved /)).toBeVisible();

  // My work queues AI checks for the open Alpha tasks and shows the gaps when they finish.
  await page.goto("/azure");
  const table = page.getByRole("table");
  await expect(table.getByText("T-05 · AI")).toHaveCount(3, { timeout: 15_000 });
  await expect(page.getByLabel("SOP")).toContainText("T-05 · Approach is described (3)");

  await table.getByRole("link", { name: "#101 Implement login" }).click();
  await expect(page.getByText("Fake verdict for T-05.")).toBeVisible();
  await expect(page.getByText("AI checks").locator("..")).toContainText("claude-haiku-5-5");

  await page.getByRole("button", { name: "Re-check with AI" }).click();
  await expect(page.getByRole("button", { name: "Re-check with AI" })).toBeEnabled({ timeout: 15_000 });
  await expect(page.getByText("Fake verdict for T-05.")).toBeVisible();

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
  await page.locator("#ai-key-CLAUDE").fill(CLAUDE_KEY);
  await page.getByRole("button", { name: "Save & validate" }).first().click();
  await expect(page.getByText(/Key works/)).toBeVisible();
  await page.getByLabel("Provider", { exact: true }).selectOption("CLAUDE");
  await page.getByLabel("Model", { exact: true }).selectOption("claude-haiku-5-5");
  await page.getByRole("button", { name: "Save AI settings" }).click();
  await expect(page.getByText(/^Saved /)).toBeVisible();

  await page.goto("/azure");
  await page.getByRole("table").getByRole("link", { name: "#102 Fix flaky test" }).click();
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
