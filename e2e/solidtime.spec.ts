import { expect, test, type Page } from "@playwright/test";

const BACKEND = "http://localhost:3100";
// Accepted by the fake Solidtime in backend/tests/support/fake-solidtime.ts (an Employee in one organization).
const SOLIDTIME_URL = "https://solidtime.test";
const SOLIDTIME_TOKEN = "st-employee-token-0123456789abcdefghijklmnop";

test.beforeEach(async ({ request }) => {
  await request.post(`${BACKEND}/__e2e/reset`);
  await request.post(`${BACKEND}/__e2e/rulebook`);
});

async function setUp(page: Page) {
  await page.goto("/register");
  await page.getByLabel("Name").fill("Time Tester");
  await page.getByLabel("Email").fill(`time-${Date.now()}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill("password123");
  await page.getByLabel("Confirm password").fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL("/");

  await page.goto("/credentials/new");
  await page.getByLabel("Organization URL").fill("https://dev.azure.com/fake-org");
  await page.getByLabel("Personal access token").fill("fake-pat-token-0123456789abcdefghij");
  await page.getByRole("button", { name: "Save credential" }).click();
  await expect(page).toHaveURL("/credentials");

  await page.getByRole("button", { name: "Connect Solidtime" }).click();
  const form = page.getByRole("form", { name: "Connect Solidtime" });
  await form.getByLabel("Solidtime address").fill(SOLIDTIME_URL);
  await form.getByLabel("API token").fill(SOLIDTIME_TOKEN);
  await form.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByText("Sifars · employee")).toBeVisible();
}

async function approve(page: Page) {
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Approve & execute" }).click();
  await expect(dialog.getByText("Executed in Solidtime.")).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();
}

test("connects Solidtime and tracks time on a ticket only through approval", async ({ page, request }) => {
  await setUp(page);

  // My work: each ticket has a timer; starting one only proposes it.
  await page.goto("/azure");
  const row = page.getByRole("row", { name: /#101 Implement login/ });
  await row.getByRole("button", { name: "Start timer…" }).click();
  await expect(page.getByRole("dialog").getByText("Start a timer: #101 Implement login")).toBeVisible();
  expect((await (await request.get(`${BACKEND}/__e2e/solidtime`)).json()).entries).toEqual([]);
  await approve(page);

  const stored = (await (await request.get(`${BACKEND}/__e2e/solidtime`)).json()).entries;
  expect(stored).toEqual([expect.objectContaining({ description: "#101 Implement login", end: null })]);

  // The ticket page shows the time and stops the timer, again through approval.
  await page.getByRole("table").getByRole("link", { name: "#101 Implement login" }).click();
  await expect(page.getByRole("heading", { name: "Time" })).toBeVisible();
  await page.getByRole("button", { name: "Stop timer…" }).click();
  await approve(page);
  const stopped = (await (await request.get(`${BACKEND}/__e2e/solidtime`)).json()).entries;
  expect(stopped[0].end).not.toBeNull();

  // The Time page lists it, attributed to the ticket.
  await page.getByRole("link", { name: "Time", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Time", exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "Time per ticket" })).toContainText("#101 Implement login");
});

test("adds a manual entry and fixes an entry with no ticket", async ({ page, request }) => {
  await setUp(page);
  await page.goto("/time");

  await page.getByRole("button", { name: "Add entry" }).click();
  const form = page.getByRole("form", { name: "Add time entry" });
  await form.getByLabel(/Description/).fill("Standup");
  await form.getByRole("button", { name: "Propose entry…" }).click();
  await approve(page);

  await page.getByRole("tab", { name: "No ticket" }).click();
  const unlinked = page.getByRole("list", { name: "Entries without a ticket" });
  await unlinked.getByRole("textbox").fill("#102 Fix flaky test");
  await unlinked.getByRole("button", { name: "Fix…" }).click();
  await approve(page);

  const entries = (await (await request.get(`${BACKEND}/__e2e/solidtime`)).json()).entries;
  expect(entries).toEqual([expect.objectContaining({ description: "#102 Fix flaky test" })]);
  await expect(page.getByText("Every entry names a ticket.")).toBeVisible();
});
