import { expect, test, type Page } from "@playwright/test";
import { addAiKey, connectSolidtime } from "./helpers/credentials.js";
import { choose } from "./helpers/select.js";

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

  await connectSolidtime(page, SOLIDTIME_URL, SOLIDTIME_TOKEN);
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
  await page.getByRole("button", { name: /^By ticket/ }).click();
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

test("drafts yesterday from Azure, fills the missing hours with AI, and saves the day through one approval", async ({ page, request }) => {
  const { day } = (await (await request.post(`${BACKEND}/__e2e/draft-activity`)).json()) as { day: string };
  await setUp(page);

  // The developer's own AI model (the fake provider answers 1 h per ticket).
  await addAiKey(page, "CLAUDE", "sk-ant-test-valid-key-0123456789abcdef");
  await expect(page.getByText(/Key works/)).toBeVisible();
  await choose(page.getByLabel("Provider", { exact: true }), "CLAUDE");
  await choose(page.getByLabel("Model", { exact: true }), "claude-haiku-5-5");
  await page.getByRole("button", { name: "Save AI settings" }).click();
  await expect(page.getByText(/^Saved /)).toBeVisible();

  await page.goto("/time");
  await page.getByRole("tab", { name: "Draft from Azure" }).click();
  await page.getByRole("button", { name: "Previous day" }).click();
  await expect(page.getByLabel("Day", { exact: true })).toHaveAttribute("data-value", day);
  const list = page.getByRole("list", { name: "Drafted entries" });

  // #102: hours from Completed Work, placed and ready; #103: activity only, waiting for hours.
  await expect(list.getByText("Completed Work +2 h")).toBeVisible();
  await expect(list.getByLabel("Hours for #102")).toHaveValue("2");
  await expect(list.getByLabel("End for #102")).toHaveValue("11:00");
  await expect(list.getByRole("checkbox", { name: "Include #103" })).not.toBeChecked();
  await expect(page.getByLabel("Day summary")).toContainText("0.5 h already in Solidtime");

  await page.getByRole("button", { name: "Suggest hours with AI" }).click();
  await expect(page.getByRole("status")).toContainText("claude-haiku-5-5");
  await expect(list.getByText("AI: Fake estimate for #103.")).toBeVisible();
  await expect(list.getByRole("checkbox", { name: "Include #103" })).toBeChecked();
  await expect(list.getByLabel("Hours for #103")).toHaveValue("1");
  // Ends at the last change on #103 (15:00).
  await expect(list.getByLabel("End for #103")).toHaveValue("15:00");

  // Nothing reached Solidtime yet; one approval saves the chosen rows.
  expect((await (await request.get(`${BACKEND}/__e2e/solidtime`)).json()).writes).toEqual([]);
  await page.getByRole("button", { name: /^Propose \d entr/ }).click();
  await approve(page);

  const { entries } = (await (await request.get(`${BACKEND}/__e2e/solidtime`)).json()) as { entries: Array<{ description: string; start: string; end: string }> };
  expect(entries).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ description: "#102 Fix flaky test", start: `${day}T09:00:00Z`, end: `${day}T11:00:00Z` }),
      expect.objectContaining({ description: "#103 Crash on save", start: `${day}T14:00:00Z`, end: `${day}T15:00:00Z` }),
    ])
  );
  const { requests } = (await (await request.get(`${BACKEND}/__e2e/requests`)).json()) as { requests: Array<{ isWrite: boolean }> };
  expect(requests.filter((entry) => entry.isWrite)).toEqual([]);
});

test("looks up a ticket's total time on the Time page, updates Azure from it, and checks it again on the ticket page", async ({ page, request }) => {
  await request.post(`${BACKEND}/__e2e/solidtime-entry`, { data: { description: "#101 Implement login", hours: 2 } });
  await setUp(page);

  await page.goto("/time");
  // The ticket ID search lives in Time → Compare with Azure.
  await page.getByRole("tab", { name: "Compare with Azure" }).click();
  const lookup = page.getByRole("form", { name: "Ticket time lookup" });
  await lookup.getByLabel("Ticket ID").fill("101");
  await lookup.getByRole("button", { name: "Check" }).click();
  // The ticket also appears in the Verify list below, so look inside the lookup's card.
  await expect(lookup.locator("xpath=..").getByRole("link", { name: "#101 Implement login" })).toBeVisible();
  // An Employee role sees only its own time: the update is offered with a warning.
  await expect(page.getByText("Total (your time)")).toBeVisible();
  await expect(page.getByRole("note").filter({ hasText: "Based on your own time only" })).toBeVisible();

  await page.getByRole("button", { name: "Update Azure to 2 h…" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Approve & execute" }).click();
  await expect(dialog.getByText("Executed in Azure DevOps.")).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();
  const { workItem } = (await (await request.get(`${BACKEND}/__e2e/work-items/101`)).json()) as { workItem: { fields: Record<string, unknown> } };
  expect(workItem.fields["Microsoft.VSTS.Scheduling.CompletedWork"]).toBe(2);
  expect(workItem.fields["Microsoft.VSTS.Scheduling.RemainingWork"]).toBe(6);

  // The ticket page reads the time when asked, and now matches.
  await lookup.locator("xpath=..").getByRole("link", { name: "#101 Implement login" }).click();
  await page.getByRole("button", { name: "Check time in Solidtime" }).click();
  await expect(page.getByText("Azure Completed Work already matches Solidtime (2 h).")).toBeVisible();
  await expect(page.getByRole("button", { name: "Azure already up to date" })).toBeDisabled();
});

test("verifies the period's tickets against Azure and updates the missing ones in one approval, never lowering Azure", async ({ page, request }) => {
  // #101 has 4 h in Azure but only 1 h in Solidtime; #102 and #103 have no Completed Work in Azure yet.
  await request.post(`${BACKEND}/__e2e/solidtime-entry`, { data: { description: "#101 Implement login", hours: 1 } });
  await request.post(`${BACKEND}/__e2e/solidtime-entry`, { data: { description: "#102 Fix flaky test", hours: 2 } });
  await request.post(`${BACKEND}/__e2e/solidtime-entry`, { data: { description: "#103 Crash on save", hours: 1 } });
  await setUp(page);

  await page.goto("/time");
  await page.getByRole("tab", { name: "Compare with Azure" }).click();
  await expect(page.getByText(/3 tickets/)).toBeVisible();
  await expect(page.getByText(/2 missing in Azure · 1 Azure higher/)).toBeVisible();
  const list = page.getByRole("list", { name: "Tickets" });
  await expect(list.getByRole("listitem").filter({ hasText: "#101 Implement login" })).toContainText("Azure has more; never lowered.");
  await expect(list.getByRole("listitem").filter({ hasText: "#102 Fix flaky test" })).toContainText("Gap+2 h");

  await page.getByRole("button", { name: "Update 2 in Azure…" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Update time on 2 tickets: #102, #103")).toBeVisible();
  await dialog.getByRole("button", { name: "Approve & execute" }).click();
  await expect(dialog.getByText("Executed in Azure DevOps.")).toBeVisible();
  await expect(dialog.getByText("#102: Completed Work 2 h")).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();

  const completed = async (id: number) =>
    ((await (await request.get(`${BACKEND}/__e2e/work-items/${id}`)).json()) as { workItem: { fields: Record<string, unknown> } }).workItem.fields["Microsoft.VSTS.Scheduling.CompletedWork"];
  expect(await completed(102)).toBe(2);
  expect(await completed(103)).toBe(1);
  expect(await completed(101)).toBe(4);
  await expect(page.getByText(/2 matched/)).toBeVisible();
  await expect(page.getByRole("button", { name: /in Azure…/ })).toHaveCount(0);
});
