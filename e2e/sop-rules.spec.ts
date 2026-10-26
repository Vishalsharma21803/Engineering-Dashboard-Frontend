import { expect, test, type Page } from "@playwright/test";

const BACKEND = "http://localhost:3100";

test.beforeEach(async ({ request }) => {
  await request.post(`${BACKEND}/__e2e/reset`);
});

async function register(page: Page, email: string) {
  await page.goto("/register");
  await page.getByLabel("Name").fill("Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("password123");
  await page.getByLabel("Confirm password").fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL("/");
}

test("a developer tunes their own rules; the default rules stay read-only", async ({ page }) => {
  await register(page, "dev@example.com");
  await page.getByRole("link", { name: "SOP rules" }).first().click();
  await expect(page.getByRole("heading", { name: "SOP rules" })).toBeVisible();

  const editor = page.getByLabel("My rules");
  await editor.fill("---\nid: NOPE-01\nseverity: off\n---\n");
  await expect(page.getByText(/no default rule/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Save as new version" })).toBeDisabled();

  await editor.fill("---\nid: DEV-01\nseverity: off\n---\n");
  await expect(page.getByText(/✓ Valid · 0 rules · 1 overrides/)).toBeVisible();
  await page.getByRole("button", { name: "Save as new version" }).click();
  await expect(page.getByText("Active version")).toContainText("1");

  await page.getByRole("tab", { name: "Rules that apply to me" }).click();
  const dev01 = page.getByRole("row", { name: /DEV-01/ });
  await expect(dev01).toContainText("yours");
  await expect(dev01).toContainText("off");

  await page.getByRole("tab", { name: "Default rules" }).click();
  await expect(page.getByText("Only SOP owners can change the default rules.", { exact: false })).toBeVisible();
  await expect(page.getByLabel("Default rulebook")).toHaveAttribute("readonly", "");
});

test("an SOP owner saves a new default version with a note", async ({ page }) => {
  await register(page, "owner@example.com");
  await page.goto("/sop-rules");
  await page.getByRole("tab", { name: "Default rules" }).click();

  const editor = page.getByLabel("Default rulebook");
  await expect(editor).toHaveValue(/id: STR-01/);
  const content = await editor.inputValue();
  await editor.fill(content.replace("title: Title is a short phrase", "title: Title is short"));
  await expect(page.getByText(/✓ Valid · \d+ rules/)).toBeVisible();

  await page.getByLabel("Change note").fill("Shorter STR-01 title");
  await page.getByRole("button", { name: "Save as new version" }).click();
  await expect(page.getByText(/Active version/)).toContainText("1");
  await expect(page.locator("#versions-default option", { hasText: "Shorter STR-01 title" })).toHaveCount(1);
});

test("rules are tried on a real ticket and shown on the work item page", async ({ page, request }) => {
  await request.post(`${BACKEND}/__e2e/rulebook`);
  await register(page, "tester@example.com");
  await page.goto("/credentials/new");
  await page.getByLabel("Organization URL").fill("https://dev.azure.com/fake-org");
  await page.getByLabel("Personal access token").fill("fake-pat-token-0123456789abcdefghij");
  await page.getByRole("button", { name: "Save credential" }).click();
  await expect(page).toHaveURL("/credentials");

  // The work item page explains the gap with the rule id and title.
  await page.goto("/azure");
  await page.getByRole("table").getByRole("link", { name: "#102 Fix flaky test" }).click();
  await expect(page.getByText("Estimate exists")).toBeVisible();
  await expect(page.getByText("No original estimate (hours).")).toBeVisible();

  // An unsaved personal draft that switches T-01 off is tried on the same ticket.
  await page.goto("/sop-rules");
  await page.getByLabel("My rules").fill("---\nid: T-01\nseverity: off\n---\n");
  await expect(page.getByText(/✓ Valid/)).toBeVisible();
  await expect(page.getByLabel("Project")).toHaveValue(/aaaaaaaa/);
  await page.getByLabel("Ticket number").fill("102");
  await page.getByRole("button", { name: "Run rules" }).click();
  await expect(page.getByText("#102 Fix flaky test · Task · Active")).toBeVisible();
  await expect(page.getByText("No SOP gaps found by the code rules.")).toBeVisible();

  // The saved rules still flag it.
  await page.getByLabel("Use the rules in the editor (unsaved)").uncheck();
  await page.getByRole("button", { name: "Run rules" }).click();
  await expect(page.getByText("No original estimate (hours).")).toBeVisible();

  const response = await request.get(`${BACKEND}/__e2e/requests`);
  const { requests } = (await response.json()) as { requests: Array<{ isWrite: boolean }> };
  expect(requests.filter((entry) => entry.isWrite)).toEqual([]);
});

test("the team SOP report uses the default rules for everyone in the project", async ({ page, request }) => {
  await request.post(`${BACKEND}/__e2e/rulebook`);
  await register(page, "lead@example.com");
  await page.goto("/credentials/new");
  await page.getByLabel("Organization URL").fill("https://dev.azure.com/fake-org");
  await page.getByLabel("Personal access token").fill("fake-pat-token-0123456789abcdefghij");
  await page.getByRole("button", { name: "Save credential" }).click();
  await expect(page).toHaveURL("/credentials");

  // A personal override does not change the team report.
  await page.goto("/sop-rules");
  await page.getByLabel("My rules").fill("---\nid: T-01\nseverity: off\n---\n");
  await expect(page.getByText(/✓ Valid/)).toBeVisible();
  await page.getByRole("button", { name: "Save as new version" }).click();
  await expect(page.getByText("Saved as version 1.")).toBeVisible();

  await page.goto("/azure");
  await page.getByRole("link", { name: "Project overview" }).click();
  // Wait for the tab to open before choosing the project, or a slow run can still be on My work.
  await expect(page).toHaveURL(/\/projects\//);
  await page.getByLabel("Project").selectOption({ label: "Alpha" });
  await expect(page.getByRole("heading", { name: "Alpha", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Build report" }).click();

  const byRule = page.getByRole("table", { name: "Gaps by rule" });
  // #106 is still New, so only the 4 started tickets are checked.
  await expect(byRule.getByRole("row", { name: /T-01 Estimate exists 3 4/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("table", { name: "Gaps by person" }).getByRole("row", { name: /Reviewer Two 1 1 2/ })).toBeVisible();
  await expect(page.getByText("Tickets checked").locator("..")).toContainText("5");
});

test("projects are set up from Azure and each developer chooses theirs; new tickets are not flagged", async ({ page, request }) => {
  await request.post(`${BACKEND}/__e2e/rulebook`);
  await register(page, "projects@example.com");
  await page.goto("/credentials/new");
  await page.getByLabel("Organization URL").fill("https://dev.azure.com/fake-org");
  await page.getByLabel("Personal access token").fill("fake-pat-token-0123456789abcdefghij");
  await page.getByRole("button", { name: "Save credential" }).click();
  await expect(page).toHaveURL("/credentials");

  // New ticket #106 has no estimate but is not flagged; active #102 is.
  await page.goto("/azure");
  const table = page.getByRole("table");
  await expect(table.getByRole("row", { name: /#102 Fix flaky test/ })).toContainText("T-01");
  await expect(table.getByRole("row", { name: /#106 Waiting on vendor/ })).toContainText("SOP OK");

  await page.goto("/sop-rules?tab=projects");
  const projects = page.getByRole("table", { name: "SOP projects" });
  await expect(projects.getByRole("row", { name: /Alpha/ })).toContainText("Set up");

  // Set Beta up from its Azure states.
  await projects.getByRole("row", { name: /Beta/ }).getByRole("button", { name: "Set up" }).click();
  const form = page.getByRole("form", { name: "Set up Beta" });
  await expect(form.getByLabel("Stage for Active")).toHaveValue("active");
  await form.getByLabel("Team time zone").fill("Asia/Kolkata");
  await form.getByRole("button", { name: "Set up project" }).click();
  await expect(projects.getByRole("row", { name: /Beta/ })).toContainText("Set up");

  // Switch Alpha off for me: My work shows it as off instead of checking it.
  await projects.getByRole("checkbox", { name: "Check Alpha for me" }).uncheck();
  await expect(projects.getByRole("checkbox", { name: "Check Alpha for me" })).not.toBeChecked();
  await page.goto("/azure");
  await expect(page.getByRole("table").getByRole("row", { name: /#102 Fix flaky test/ })).toContainText("SOP off");

  const response = await request.get(`${BACKEND}/__e2e/requests`);
  const { requests } = (await response.json()) as { requests: Array<{ isWrite: boolean }> };
  expect(requests.filter((entry) => entry.isWrite)).toEqual([]);
});
