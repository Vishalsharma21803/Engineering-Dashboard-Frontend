import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const BACKEND = "http://localhost:3100";
const FAKE_ORG_URL = "https://dev.azure.com/fake-org";
const FAKE_PAT = "fake-pat-token-0123456789abcdefghij";

async function azureWrites(request: APIRequestContext) {
  const response = await request.get(`${BACKEND}/__e2e/requests`);
  const { requests } = (await response.json()) as { requests: Array<{ isWrite: boolean }> };
  return requests.filter((entry) => entry.isWrite);
}

async function signUpWithCredential(page: Page) {
  await page.goto("/register");
  await page.getByLabel("Name").fill("E2E Developer");
  await page.getByLabel("Email").fill(`e2e-triage-${Date.now()}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill("password123");
  await page.getByLabel("Confirm password").fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL("/");

  await page.goto("/credentials/new");
  await page.getByLabel("Organization URL").fill(FAKE_ORG_URL);
  await page.getByLabel("Personal access token").fill(FAKE_PAT);
  await page.getByRole("button", { name: "Save credential" }).click();
  await expect(page).toHaveURL("/credentials");
}

async function triage(page: Page, label: string, action: string) {
  await page.getByRole("button", { name: `Triage ${label}`, exact: true }).first().click();
  await page.getByRole("dialog", { name: `Triage ${label}` }).getByRole("button", { name: action }).click();
}

const tile = (page: Page, label: string) => page.getByText(label, { exact: true }).locator("..");

test.beforeEach(async ({ request }) => {
  await request.post(`${BACKEND}/__e2e/reset`);
  // SOP rules for Alpha, so #103 shows up as an SOP gap to triage.
  await request.post(`${BACKEND}/__e2e/rulebook`);
});

test("snoozes, acknowledges and abandons dashboard items without touching Azure DevOps", async ({ page, request }) => {
  await signUpWithCredential(page);
  await page.goto("/azure");

  // SectionCard: card > header row > title block > heading.
  const prioritized = page.getByRole("heading", { name: "Prioritized actions" }).locator("xpath=ancestor::div[3]");
  const failedRun = page.getByRole("link", { name: "alpha-ci #2026.501 failed" });
  await expect(failedRun).toBeVisible();
  await expect(tile(page, "Failing pipelines")).toContainText("1");

  // Abandon a failing pipeline: gone from the priority list and the counts.
  await triage(page, "alpha-ci #2026.501 failed", "Abandon · hide until restored");
  await expect(failedRun).toHaveCount(0);
  await expect(tile(page, "Failing pipelines")).toContainText("1 hidden");

  // Acknowledge: still listed, but in its own group below active work.
  await triage(page, "#103 Crash on save", "Acknowledge · keep, move down");
  const acknowledged = page.getByRole("region", { name: "Acknowledged" });
  await expect(acknowledged.getByRole("link", { name: "#103 Crash on save" })).toBeVisible();

  // Snooze a pull request from its own section.
  const pr = page.getByRole("link", { name: "!1 Login flow", exact: true });
  await expect(pr).toBeVisible();
  await triage(page, "!1 Login flow", "Snooze · tomorrow");
  await expect(pr).toHaveCount(0);
  await expect(tile(page, "Active PRs")).toContainText("1 hidden");

  // Marks persist across reloads.
  await page.reload();
  await expect(page.getByRole("region", { name: "Acknowledged" }).getByRole("link", { name: "#103 Crash on save" })).toBeVisible();
  await expect(failedRun).toHaveCount(0);
  await expect(pr).toHaveCount(0);

  // Restore the pipeline from the hidden view.
  await prioritized.getByRole("button", { name: /Show snoozed & abandoned/ }).click();
  await expect(prioritized.getByText("Abandoned", { exact: true }).first()).toBeVisible();
  await triage(page, "alpha-ci #2026.501 failed", "Restore to my list");
  await expect(failedRun).toHaveCount(0);
  // The snoozed PR is still hidden, so switch back to the normal list.
  await prioritized.getByRole("button", { name: "Hide snoozed & abandoned" }).click();
  await expect(failedRun).toBeVisible();
  await expect(tile(page, "Failing pipelines")).not.toContainText("hidden");

  expect(await azureWrites(request)).toEqual([]);
});

test("abandoning a whole project hides all of its items until restored", async ({ page, request }) => {
  await signUpWithCredential(page);
  await page.goto("/azure");

  await expect(page.getByRole("table").getByRole("link", { name: "#102 Fix flaky test" })).toBeVisible();
  await triage(page, "#102 Fix flaky test", "Abandon project");

  await expect(page.getByText("Triaged projects").locator("..")).toContainText("Alpha · abandoned");
  await expect(page.getByRole("link", { name: "#103 Crash on save" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "alpha-ci #2026.501 failed" })).toHaveCount(0);
  await expect(page.getByRole("table").getByRole("link", { name: "#102 Fix flaky test" })).toHaveCount(0);

  await page.getByRole("button", { name: "Restore project Alpha" }).click();
  await expect(page.getByRole("link", { name: "#103 Crash on save" }).first()).toBeVisible();
  await expect(page.getByText("Triaged projects")).toHaveCount(0);

  expect(await azureWrites(request)).toEqual([]);
});
