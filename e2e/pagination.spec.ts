import { expect, test, type Page } from "@playwright/test";
import { choose } from "./helpers/select.js";

const BACKEND = "http://localhost:3100";

test.beforeEach(async ({ request }) => {
  await request.post(`${BACKEND}/__e2e/reset`);
  await request.post(`${BACKEND}/__e2e/rulebook`);
  // 4 open tickets of mine + 23 = 27 → pages of 10, 10, 7.
  await request.post(`${BACKEND}/__e2e/tickets`, { data: { count: 23 } });
});

async function signUpWithCredential(page: Page) {
  await page.goto("/register");
  await page.getByLabel("Name").fill("Pager");
  await page.getByLabel("Email").fill(`pager-${Date.now()}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill("password123");
  await page.getByLabel("Confirm password").fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL("/");
  await page.goto("/credentials/new");
  await page.getByLabel("Organization URL").fill("https://dev.azure.com/fake-org");
  await page.getByLabel("Personal access token").fill("fake-pat-token-0123456789abcdefghij");
  await page.getByRole("button", { name: "Save credential" }).click();
  await expect(page).toHaveURL("/credentials");
}

const rows = (page: Page) => page.getByRole("table").getByRole("row");

test("My work shows 10 tickets per page and survives tampered page numbers", async ({ page }) => {
  await signUpWithCredential(page);
  await page.goto("/azure");
  const pager = page.getByRole("navigation", { name: "My work pages" });

  await expect(pager.getByText("Showing 1–10 of 27")).toBeVisible();
  await expect(rows(page)).toHaveCount(11);

  await pager.getByRole("button", { name: "Next" }).click();
  await expect(page).toHaveURL(/[?&]page=2/);
  await expect(pager.getByText("Showing 11–20 of 27")).toBeVisible();

  await pager.getByRole("button", { name: "Page 3" }).click();
  await expect(pager.getByText("Showing 21–27 of 27")).toBeVisible();
  await expect(rows(page)).toHaveCount(8);

  // A page that does not exist goes to the last page; nonsense goes to the first.
  const base = new URL(page.url());
  base.searchParams.set("page", "999");
  await page.goto(base.toString());
  await expect(pager.getByText("Showing 21–27 of 27")).toBeVisible();
  await expect(page).toHaveURL(/[?&]page=3(&|$)/);

  for (const tampered of ["abc", "-2", "0", "1.5", "%3Cscript%3E"]) {
    await page.goto(`${base.origin}${base.pathname}?page=${tampered}`);
    await expect(pager.getByText("Showing 1–10 of 27")).toBeVisible();
    await expect(page).not.toHaveURL(/[?&]page=/);
  }

  // Filtering goes back to page 1 and pages the filtered list.
  await pager.getByRole("button", { name: "Page 2" }).click();
  await expect(page).toHaveURL(/[?&]page=2/);
  await choose(page.getByLabel("Type"), { label: "Type: Bug (1)" });
  await expect(rows(page)).toHaveCount(2);
  await expect(page).not.toHaveURL(/[?&]page=/);
  await expect(pager).toHaveCount(0);
});

test("Project overview and the team SOP report page their tickets", async ({ page }) => {
  await signUpWithCredential(page);
  await page.goto("/azure");
  await page.getByRole("link", { name: "Project overview" }).click();
  // Wait for the tab to open before choosing the project, or a slow run can still be on My work.
  await expect(page).toHaveURL(/\/projects\//);
  await choose(page.getByLabel("Project"), { label: "Alpha" });
  await expect(page.getByRole("heading", { name: "Alpha", exact: true })).toBeVisible();

  // Alpha: 101, 102, 103, 105, 106 + 23 = 28 tickets for the whole team.
  const team = page.getByRole("navigation", { name: "Team work item pages" });
  await expect(team.getByText("Showing 1–10 of 28")).toBeVisible();
  await team.getByRole("button", { name: "Page 3" }).click();
  await expect(team.getByText("Showing 21–28 of 28")).toBeVisible();
  await expect(page).toHaveURL(/[?&]page=3/);

  await page.getByRole("button", { name: "Run report" }).click();
  await page.getByText(/^Tickets with gaps \(\d+\)$/).click();
  const gaps = page.getByRole("navigation", { name: "Tickets with gaps pages" });
  await expect(gaps.getByText(/Showing 1–10 of \d+/)).toBeVisible({ timeout: 30_000 });
  await gaps.getByRole("button", { name: "Next" }).click();
  await expect(page).toHaveURL(/[?&]reportPage=2/);
  await expect(gaps.getByText(/Showing 11–20 of \d+/)).toBeVisible();
});
