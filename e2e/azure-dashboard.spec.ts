import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { choose, openOptions } from "./helpers/select.js";

const BACKEND = "http://localhost:3100";
const FAKE_ORG_URL = "https://dev.azure.com/fake-org";
const FAKE_PAT = "fake-pat-token-0123456789abcdefghij";

interface RecordedRequest {
  method: string;
  path: string;
  isWrite: boolean;
  body: unknown;
}

async function azureWrites(request: APIRequestContext): Promise<RecordedRequest[]> {
  const response = await request.get(`${BACKEND}/__e2e/requests`);
  const { requests } = (await response.json()) as { requests: RecordedRequest[] };
  return requests.filter((entry) => entry.isWrite);
}

async function fakeWorkItem(request: APIRequestContext, id: number) {
  const response = await request.get(`${BACKEND}/__e2e/work-items/${id}`);
  return (await response.json()) as {
    workItem: { fields: Record<string, unknown> } | null;
    comments: Array<{ text: string }>;
  };
}

async function signUpWithCredential(page: Page) {
  await page.goto("/register");
  await page.getByLabel("Name").fill("E2E Developer");
  await page.getByLabel("Email").fill(`e2e-${Date.now()}@example.com`);
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

test.beforeEach(async ({ request }) => {
  await request.post(`${BACKEND}/__e2e/reset`);
  await request.post(`${BACKEND}/__e2e/rulebook`);
});

test("discovers projects, prioritizes work and never writes without approval", async ({ page, request }) => {
  await signUpWithCredential(page);

  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Azure DevOps", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Azure DevOps" })).toBeVisible();

  // Project discovery
  const projectSelect = page.getByLabel("Project");
  await expect(await openOptions(projectSelect)).toHaveText(["All projects", "Alpha", "Beta"]);
  await page.keyboard.press("Escape");

  // Prioritized dashboard, compliance and degraded-free sections
  await expect(page.getByRole("link", { name: /^alpha-ci #2026\.501/ })).toBeVisible();
  await expect(page.getByRole("list", { name: "My work items" }).getByRole("link", { name: "103 Crash on save" })).toBeVisible();
  await expect(page.getByRole("list", { name: "My work items" }).getByRole("link", { name: "102 Fix flaky test" })).toBeVisible();
  // SOP rule T-01 (estimate) fails for the started tickets #102 and #103; #106 is still New, so it is not flagged.
  await expect(page.getByRole("list", { name: "My work items" }).getByText("No original estimate (hours)")).toHaveCount(2);
  await expect(page.getByRole("link", { name: "PR 1 Login flow", exact: true }).first()).toBeVisible();
  await expect(page.getByText("2 unresolved", { exact: true })).toBeVisible();

  expect(await azureWrites(request)).toEqual([]);

  // Propose → reject: nothing reaches Azure. Alpha's SOP has no Testing stage, so closing after merge is offered.
  await page.getByRole("list", { name: "My work items" }).getByRole("link", { name: "103 Crash on save" }).click();
  await page.getByRole("button", { name: "Close after merge…" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Close #103 Crash on save (all linked PRs merged)")).toBeVisible();
  await expect(dialog.getByRole("cell", { name: "Resolved" })).toBeVisible();
  expect(await azureWrites(request)).toEqual([]);

  await dialog.getByRole("button", { name: "Reject" }).click();
  await expect(dialog.getByText("Rejected. Nothing was changed in Azure DevOps.")).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();
  expect(await azureWrites(request)).toEqual([]);
  expect((await fakeWorkItem(request, 103)).workItem?.fields["System.State"]).toBe("Resolved");

  // Propose → approve: exactly one write, verified in Azure
  await page.getByRole("button", { name: "Close after merge…" }).click();
  await dialog.getByRole("button", { name: "Approve & execute" }).click();
  await expect(dialog.getByText("Executed in Azure DevOps.")).toBeVisible();
  await expect(dialog.getByText("✓ Verified: System.State")).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();

  const writes = await azureWrites(request);
  expect(writes).toHaveLength(1);
  expect(writes[0]?.method).toBe("PATCH");
  expect((await fakeWorkItem(request, 103)).workItem?.fields).toMatchObject({
    "System.State": "Closed",
    "Microsoft.VSTS.Scheduling.RemainingWork": 0,
  });

  // Audit trail
  await page.getByRole("link", { name: "Approvals & audit" }).click();
  await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();
  for (const event of ["proposed", "rejected", "approved", "execution started", "execution succeeded"]) {
    await expect(page.getByRole("cell", { name: event, exact: true }).first()).toBeVisible();
  }
});

test("My work groups my tickets under their story, and a ticket page shows where it belongs", async ({ page, request }) => {
  await request.post(`${BACKEND}/__e2e/hierarchy`);
  await signUpWithCredential(page);
  await page.goto("/azure");
  const list = page.getByRole("list", { name: "My work items" });

  // Someone else's story heads my tickets with their name on it; their own ticket under it is not listed.
  // #102 is in progress and #103 resolved, so the story heads a group in both sections.
  await expect(list.getByRole("link", { name: "120 Checkout flow" })).toHaveCount(2);
  await expect(list.getByText("Assigned to Reviewer Two").first()).toBeVisible();
  const checkout = list.getByRole("list", { name: "Under #120" });
  await expect(checkout.getByRole("link", { name: "102 Fix flaky test" })).toBeVisible();
  await expect(checkout.getByRole("link", { name: "103 Crash on save" })).toBeVisible();
  await expect(page.getByText("Someone else's task")).toHaveCount(0);
  // My own story, with my ticket under it.
  await expect(list.getByText("Assigned to you").first()).toBeVisible();
  await expect(list.getByRole("list", { name: "Under #121" }).getByRole("link", { name: "106 Waiting on vendor" })).toBeVisible();

  // A story folds away.
  await list.getByRole("button", { name: "Collapse #120 Checkout flow" }).first().click();
  await expect(checkout).toHaveCount(0);
  await list.getByRole("button", { name: "Expand #120 Checkout flow" }).first().click();

  // The ticket page names its story and whose it is.
  await checkout.getByRole("link", { name: "102 Fix flaky test" }).click();
  await expect(page.getByText(/^Part of/)).toContainText("#120 Checkout flow");
  await expect(page.getByText("· assigned to Reviewer Two")).toBeVisible();
  expect(await azureWrites(request)).toEqual([]);
});

test("updates a work item through the approval flow", async ({ page, request }) => {
  await signUpWithCredential(page);
  await page.goto("/azure");
  await page.getByRole("list", { name: "My work items" }).getByRole("link", { name: "102 Fix flaky test" }).click();

  await expect(page.getByRole("heading", { name: "#102 Fix flaky test" })).toBeVisible();
  await expect(page.getByText("No original estimate (hours).")).toBeVisible();

  // Each change opens its own form from the ticket's action buttons.
  await page.getByRole("button", { name: "Comment", exact: true }).click();
  await page.getByRole("textbox", { name: "Comment" }).fill("Approach: quarantine the flaky test, then fix the race");
  await page.getByRole("button", { name: "Review comment…" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("cell", { name: "Approach: quarantine the flaky test, then fix the race" })).toBeVisible();
  expect(await azureWrites(request)).toEqual([]);

  await dialog.getByRole("button", { name: "Approve & execute" }).click();
  await expect(dialog.getByText("Executed in Azure DevOps.")).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();

  const { comments } = await fakeWorkItem(request, 102);
  expect(comments.at(-1)?.text).toBe("Approach: quarantine the flaky test, then fix the race");

  // The refreshed detail page reflects the new comment.
  await expect(page.getByText("Approach: quarantine the flaky test, then fix the race").first()).toBeVisible();
});

test("shows pipeline failures and only proposes pipeline actions", async ({ page, request }) => {
  await signUpWithCredential(page);
  await page.goto("/azure");
  await choose(page.getByLabel("Project"), { label: "Alpha" });
  await page.getByRole("link", { name: "Project overview" }).click();

  await expect(page.getByRole("heading", { name: "Alpha" })).toBeVisible();
  await page.getByRole("tab", { name: "PRs & pipelines" }).click();
  await page.getByRole("button", { name: /alpha-ci/ }).click();
  await page.getByRole("button", { name: /#2026\.501/ }).click();
  await expect(page.getByText("3 tests failed")).toBeVisible();
  await expect(page.getByText("staging")).toBeVisible();
  await expect(page.getByText("Release-70")).toBeVisible();

  await page.getByRole("button", { name: "Retry stage…" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Approval required · Retry failed stage")).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();

  expect(await azureWrites(request)).toEqual([]);
});

test("the sprint header sums up my tickets in the current sprint and jumps to a status", async ({ page, request }) => {
  await request.post(`${BACKEND}/__e2e/sprint`);
  await signUpWithCredential(page);
  await page.goto("/azure");

  const header = page.getByRole("region", { name: "Sprint overview" });
  await expect(header.getByRole("heading", { name: "Sprint 12" })).toBeVisible();
  await expect(header).toContainText(/working days? left|ended/);
  await expect(header).toContainText(/ h left/);
  // The counts are my tickets in the sprint; one click goes to that status in the list.
  await header.getByRole("button", { name: /in progress$/ }).click();
  await expect(page.locator("#section-inProgress")).toBeInViewport();
  expect(await azureWrites(request)).toEqual([]);
});

test("notifications: read and abandoned ones stay listed, survive a reload, and can be restored", async ({ page, request }) => {
  await signUpWithCredential(page);
  await page.goto("/azure");

  const button = page.getByRole("button", { name: /^Notifications, \d+ unread$/ });
  await expect(button).toHaveAccessibleName("Notifications, 3 unread");
  await button.click();
  const panel = page.getByRole("tabpanel");
  await expect(panel).toContainText("PR 3 Refactor settings");
  await expect(panel).toContainText("PR 1 Login flow");
  await expect(panel).toContainText("alpha-ci #2026.501 failed");

  await page.getByRole("button", { name: "Mark as read: PR 1 Login flow" }).click();
  await page.getByRole("button", { name: "Abandon: alpha-ci #2026.501 failed" }).click();
  await expect(page.getByRole("tab", { name: "Unread 1" })).toBeVisible();

  // Stored, not hidden: after a reload they are in their tabs.
  await page.reload();
  await page.getByRole("button", { name: "Notifications, 1 unread" }).click();
  await page.getByRole("tab", { name: /^Read/ }).click();
  await expect(page.getByRole("tabpanel")).toContainText("PR 1 Login flow");
  await page.getByRole("tab", { name: /^Abandoned/ }).click();
  await page.getByRole("button", { name: "Restore: alpha-ci #2026.501 failed" }).click();
  await expect(page.getByRole("tab", { name: "Unread 2" })).toBeVisible();

  // Open goes to the page of what it is about.
  await page.getByRole("tab", { name: /^Unread/ }).click();
  await page.getByRole("link", { name: "Open PR 3 Refactor settings" }).click();
  await expect(page).toHaveURL(/\/pull-requests\/3$/);
  expect(await azureWrites(request)).toEqual([]);
});

test("tabs work and project overview shows the whole team while My work stays mine", async ({ page }) => {
  await signUpWithCredential(page);
  await page.goto("/azure");
  const tabs = page.getByRole("navigation", { name: "Azure DevOps" });

  // My work: only my items
  await expect(page.getByRole("list", { name: "My work items" }).getByRole("link", { name: "102 Fix flaky test" })).toBeVisible();
  await expect(page.getByText("Someone else's task")).toHaveCount(0);

  // Project overview with "All projects" in the header → opens the first project directly
  await tabs.getByRole("link", { name: "Project overview" }).click();
  await expect(page.getByRole("heading", { name: "Alpha", exact: true })).toBeVisible();
  await expect(page.getByLabel("Project")).toHaveAttribute("data-value", /aaaaaaaa/);

  // Team-wide work items and PRs
  await expect(page.getByRole("heading", { name: "Team work items" })).toBeVisible();
  const teamTable = page.getByRole("list", { name: "Team work items" });
  await expect(teamTable.getByRole("link", { name: "105 Someone else's task" })).toBeVisible();
  await expect(teamTable.getByText("Reviewer Two")).toBeVisible();
  await page.getByRole("button", { name: /^Filter/ }).click();
  await choose(page.getByLabel("Assignee"), { label: "Me (4)" });
  await page.keyboard.press("Escape");
  await expect(teamTable.getByText("Someone else's task")).toHaveCount(0);
  await expect(teamTable.getByRole("link", { name: "102 Fix flaky test" })).toBeVisible();

  await page.getByRole("tab", { name: "PRs & pipelines" }).click();
  await expect(page.getByRole("heading", { name: "Active pull requests" })).toBeVisible();
  await expect(page.getByRole("link", { name: "PR 3 Refactor settings", exact: true })).toBeVisible();

  // Approvals & audit tab
  await tabs.getByRole("link", { name: "Approvals & audit" }).click();
  await expect(page.getByRole("heading", { name: "Awaiting your approval" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();

  // Back to My work
  await tabs.getByRole("link", { name: "My work" }).click();
  await expect(page.getByRole("heading", { name: /^My work/ })).toBeVisible();

  // The last viewed project is remembered: view Beta, go home, reopen the tab
  await choose(page.getByLabel("Project"), { label: "Beta" });
  await tabs.getByRole("link", { name: "Project overview" }).click();
  await expect(page.getByRole("heading", { name: "Beta", exact: true })).toBeVisible();

  // "All projects" is not selectable on Project overview, so the tab never changes
  const allOption = (await openOptions(page.getByLabel("Project"))).and(page.locator('[data-value=""]'));
  await expect(allOption).toHaveAttribute("aria-disabled", "true");
  await expect(allOption).toHaveText("All projects (My work & Approvals only)");
  await page.keyboard.press("Escape");

  await tabs.getByRole("link", { name: "My work" }).click();
  await choose(page.getByLabel("Project"), { label: "All projects" });
  await expect(page.getByRole("heading", { name: /^My work/ })).toBeVisible();
  await tabs.getByRole("link", { name: "Project overview" }).click();
  await expect(page.getByRole("heading", { name: "Beta", exact: true })).toBeVisible();
});

test("keeps the selected project across tabs and filters lists", async ({ page }) => {
  await signUpWithCredential(page);
  await page.goto("/azure");
  const tabs = page.getByRole("navigation", { name: "Azure DevOps" });
  const projectSelect = page.getByLabel("Project");

  await choose(projectSelect, { label: "Alpha" });
  await expect(page).toHaveURL(/\?project=aaaaaaaa/);

  await tabs.getByRole("link", { name: "Project overview" }).click();
  await expect(page.getByRole("heading", { name: "Alpha", exact: true })).toBeVisible();

  await tabs.getByRole("link", { name: "Approvals & audit" }).click();
  await expect(page).toHaveURL(/\/actions\?project=aaaaaaaa/);
  await expect(page.getByText("Showing changes for Alpha")).toBeVisible();
  await expect(projectSelect).toHaveAttribute("data-value", /aaaaaaaa/);

  // Still Alpha after leaving the cockpit and coming back
  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Credentials" }).click();
  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Azure DevOps", exact: true }).click();
  await expect(page).toHaveURL(/\?project=aaaaaaaa/);
  await expect(projectSelect).toHaveAttribute("data-value", /aaaaaaaa/);

  // Filters on My work
  const table = page.getByRole("list", { name: "My work items" });
  await page.getByRole("button", { name: /^Filter/ }).click();
  await choose(page.getByLabel("Type"), { label: "Bug (1)" });
  await expect(table.getByRole("link", { name: "103 Crash on save" })).toBeVisible();
  await expect(table.getByRole("link", { name: "102 Fix flaky test" })).toHaveCount(0);
  await page.getByRole("button", { name: "Clear filters" }).click();
  await choose(page.getByLabel("Checks"), { label: "T-01 · Estimate exists (2)" });
  await expect(table.getByRole("link", { name: "102 Fix flaky test" })).toBeVisible();
  await expect(table.getByRole("link", { name: "101 Implement login" })).toHaveCount(0);
  await expect(table.getByRole("link", { name: /^\d+ / })).toHaveCount(2);

  // Only the tickets that need something from me.
  await page.getByRole("button", { name: "Clear filters" }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^Needs attention/ }).click();
  await expect(table.getByRole("link", { name: "103 Crash on save" })).toBeVisible();
  await expect(table.getByRole("link", { name: "101 Implement login" })).toHaveCount(0);
  await page.getByRole("button", { name: "All my work" }).click();

  // Choosing "All projects" sticks too
  await choose(projectSelect, { label: "All projects" });
  await tabs.getByRole("link", { name: "Approvals & audit" }).click();
  await expect(page).toHaveURL(/\/actions$/);
});

test("switching project or organization keeps the current tab", async ({ page }) => {
  await signUpWithCredential(page);
  await page.goto("/credentials/new");
  await page.getByLabel("Organization URL").fill("https://dev.azure.com/fake-org-2");
  await page.getByLabel("Personal access token").fill(FAKE_PAT);
  await page.getByRole("button", { name: "Save credential" }).click();
  await expect(page).toHaveURL("/credentials");

  await page.goto("/azure");
  await expect(page.getByRole("heading", { name: "Choose an organization" })).toBeVisible();
  await page.getByText("https://dev.azure.com/fake-org", { exact: true }).click();

  const tabs = page.getByRole("navigation", { name: "Azure DevOps" });
  const projectSelect = page.getByLabel("Project");
  const orgSelect = page.getByLabel("Organization");

  // Project change on Project overview stays on Project overview
  await tabs.getByRole("link", { name: "Project overview" }).click();
  await expect(page.getByRole("heading", { name: "Alpha", exact: true })).toBeVisible();
  await choose(projectSelect, { label: "Beta" });
  await expect(page.getByRole("heading", { name: "Beta", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/projects\/bbbbbbbb/);

  // Organization change on Project overview opens the other org's project overview
  await choose(orgSelect, { label: "fake-org-2" });
  await expect(page.getByRole("heading", { name: "Gamma", exact: true })).toBeVisible();
  await expect(projectSelect).toHaveAttribute("data-value", /eeeeeeee/);

  // ...and back: the first org remembers Beta
  await choose(orgSelect, { label: "fake-org" });
  await expect(page.getByRole("heading", { name: "Beta", exact: true })).toBeVisible();

  // Organization change on Approvals stays on Approvals
  await tabs.getByRole("link", { name: "Approvals & audit" }).click();
  await expect(page).toHaveURL(/\/actions\?project=bbbbbbbb/);
  await choose(orgSelect, { label: "fake-org-2" });
  await expect(page).toHaveURL(/fake|\/actions/);
  await expect(page.getByRole("heading", { name: "Awaiting your approval" })).toBeVisible();
  await expect(page).toHaveURL(/\/actions\?project=eeeeeeee/);

  // Project change on My work stays on My work
  await tabs.getByRole("link", { name: "My work" }).click();
  await expect(page.getByRole("heading", { name: /^My work/ })).toBeVisible();
  await choose(orgSelect, { label: "fake-org" });
  await expect(page.getByRole("heading", { name: /^My work/ })).toBeVisible();
  await choose(projectSelect, { label: "Alpha" });
  await expect(page.getByRole("heading", { name: /^My work/ })).toBeVisible();
  await expect(page).toHaveURL(/\?project=aaaaaaaa/);
});
