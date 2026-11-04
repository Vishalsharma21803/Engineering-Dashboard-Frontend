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


test.beforeEach(async ({ request }) => {
  await request.post(`${BACKEND}/__e2e/reset`);
  // SOP rules for Alpha, so #103 shows up as an SOP gap to triage.
  await request.post(`${BACKEND}/__e2e/rulebook`);
});

test("snoozes, acknowledges and abandons dashboard items without touching Azure DevOps", async ({ page, request }) => {
  await signUpWithCredential(page);
  await page.goto("/azure");

  // SectionCard: card > header row > title block > heading.
  const section = (title: RegExp) => page.getByRole("heading", { name: title }).locator("xpath=ancestor::div[3]");
  const myWork = section(/^My work/);
  const pipelines = section(/^Pipeline runs/);
  const failedRun = pipelines.getByRole("link", { name: /^alpha-ci #2026\.501/ });
  await expect(failedRun).toBeVisible();

  // Abandon a failing pipeline: gone from its list. Notifications keep their own status, so it is still there.
  await triage(page, "alpha-ci on main", "Abandon · hide until restored");
  await expect(failedRun).toHaveCount(0);
  await page.getByRole("button", { name: /^Notifications, \d+ unread$/ }).click();
  await expect(page.getByRole("tabpanel", { name: /^Unread/ })).toContainText("alpha-ci #2026.501 failed");
  await page.keyboard.press("Escape");

  // Acknowledge a ticket: still listed in My work, with its mark.
  await triage(page, "#103 Crash on save", "Acknowledge · keep, move down");
  const ticket = myWork.getByRole("listitem").filter({ hasText: "103 Crash on save" }).last();
  await expect(ticket).toContainText("Acknowledged");

  // Snooze a pull request from its own section.
  const pr = page.getByRole("link", { name: "PR 1 Login flow", exact: true });
  await expect(pr.first()).toBeVisible();
  await triage(page, "PR 1 Login flow", "Snooze · tomorrow");
  await expect(pr).toHaveCount(0);

  // Marks persist across reloads.
  await page.reload();
  await expect(myWork.getByRole("listitem").filter({ hasText: "103 Crash on save" }).last()).toContainText("Acknowledged");
  await expect(failedRun).toHaveCount(0);
  await expect(pr).toHaveCount(0);

  // Restore the pipeline from the hidden view.
  await pipelines.getByRole("button", { name: /Show snoozed & abandoned/ }).click();
  await expect(pipelines.getByText("Abandoned", { exact: true }).first()).toBeVisible();
  await triage(page, "alpha-ci on main", "Restore to my list");
  await expect(failedRun).toBeVisible();

  expect(await azureWrites(request)).toEqual([]);
});

test("abandoning a whole project hides all of its items until restored", async ({ page, request }) => {
  await signUpWithCredential(page);
  await page.goto("/azure");

  await expect(page.getByRole("list", { name: "My work items" }).getByRole("link", { name: "102 Fix flaky test" })).toBeVisible();
  await triage(page, "#102 Fix flaky test", "Abandon project");

  await expect(page.getByText("Triaged projects").locator("..")).toContainText("Alpha · abandoned");
  await expect(page.getByRole("link", { name: "103 Crash on save" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "alpha-ci #2026.501 failed" })).toHaveCount(0);
  await expect(page.getByRole("list", { name: "My work items" }).getByRole("link", { name: "102 Fix flaky test" })).toHaveCount(0);

  await page.getByRole("button", { name: "Restore project Alpha" }).click();
  await expect(page.getByRole("link", { name: "103 Crash on save" }).first()).toBeVisible();
  await expect(page.getByText("Triaged projects")).toHaveCount(0);

  expect(await azureWrites(request)).toEqual([]);
});
