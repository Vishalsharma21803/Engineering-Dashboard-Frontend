import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AuthContext } from "@/features/auth/context/auth-context";
import { mockBackend, renderWithProviders, type MockRoute } from "@/test/render";
import { chooseOption } from "@/test/select";
import { ProjectsTab } from "../components/projects-tab";
import type { ProjectSettings, ProjectSetUp } from "../types/sop.types";

const credential = {
  id: "c1",
  platform: "AZURE",
  organizationUrl: "https://dev.azure.com/sifars",
  label: null,
  lastValidatedAt: null,
  lastValidationStatus: "VALID",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

/** Renders as a signed-in developer (not an SOP owner). */
function renderTab() {
  const user = { id: "u1", name: "Dev", email: "dev@example.com", isSopAdmin: false } as never;
  renderWithProviders(
    <AuthContext.Provider value={{ user, isAuthenticated: true, isLoading: false }}>
      <ProjectsTab />
    </AuthContext.Provider>
  );
}

const alphaSettings: ProjectSettings = {
  stageSource: "state",
  stages: { ready: ["New"], active: ["Active"], done: ["Closed"] },
  roles: { tl: [], qa: [], po: [] },
  fields: { category: null, targetCompletion: null },
  categories: {},
  workItemTypes: {},
  tagVocabulary: [],
  branchPattern: null,
  prTargetBranch: "develop",
  timeZone: "UTC",
};

/** The default set-up of Alpha: made by Ann, and the viewer may change it. */
function alphaSetUp(overrides: Partial<ProjectSetUp> = {}): ProjectSetUp {
  const now = new Date().toISOString();
  return { projectName: "Alpha", settings: alphaSettings, createdBy: "Ann", updatedBy: "Ann", createdAt: now, updatedAt: now, checkedForMe: true, canEdit: true, ...overrides };
}

/** `routes` come first, so they win over the defaults below. */
function setup({ alpha = alphaSetUp(), routes = [] }: { alpha?: ProjectSetUp; routes?: MockRoute[] } = {}) {
  return mockBackend([
    ...routes,
    { path: "/api/credentials", body: { credentials: [credential] } },
    {
      path: "/api/sop/azure-projects/c1",
      body: {
        projects: {
          items: [
            { id: "a", name: "Alpha", setUp: true, checkedForMe: true },
            { id: "b", name: "Beta", setUp: false, checkedForMe: false },
          ],
          page: 1,
          pageSize: 10,
          total: 2,
          totalPages: 1,
        },
        elsewhere: { items: [], page: 1, pageSize: 10, total: 0, totalPages: 1 },
      },
    },
    {
      path: "/api/sop/projects",
      body: { projects: [alpha] },
    },
    {
      path: "/api/sop/azure-projects/c1/b/suggestion",
      body: {
        suggestion: {
          projectName: "Beta",
          setUp: false,
          states: [
            { name: "New", category: "Proposed", types: ["Task"] },
            { name: "Estimations", category: "Proposed", types: ["Task"] },
            { name: "Active", category: "InProgress", types: ["Task"] },
            { name: "Closed", category: "Completed", types: ["Task"] },
          ],
          fieldCandidates: { category: ["Microsoft.VSTS.Common.Activity"], targetCompletion: [] },
          settings: {
            ...alphaSettings,
            stages: { ready: ["New"], estimation: ["Estimations"], active: ["Active"], done: ["Closed"] },
            fields: { category: "Microsoft.VSTS.Common.Activity", targetCompletion: null },
            categories: { Development: "Writing code." },
          },
        },
      },
    },
    { method: "PUT", path: "/api/sop/projects/Beta", body: { project: { projectName: "Beta" } } },
    { method: "PUT", path: "/api/sop/projects/Alpha/checked", body: { projectName: "Alpha", checked: false } },
  ]);
}

describe("ProjectsTab", () => {
  it("lists projects with their set-up and lets me switch one off for myself", async () => {
    const calls = setup();
    renderTab();

    const table = await screen.findByRole("table", { name: "SOP projects" });
    const alpha = within(table).getByRole("row", { name: /Alpha/ });
    expect(within(alpha).getByText("Set up")).toBeInTheDocument();
    expect(within(table).getByRole("checkbox", { name: "Check Beta for me" })).toBeDisabled();

    await userEvent.click(within(alpha).getByRole("checkbox", { name: "Check Alpha for me" }));
    await waitFor(() => expect(calls.find((call) => call.url === "/api/sop/projects/Alpha/checked")?.body).toEqual({ checked: false }));
  });

  it("sets a project up from Azure's states, with edits", async () => {
    const calls = setup();
    renderTab();

    const table = await screen.findByRole("table", { name: "SOP projects" });
    await userEvent.click(within(within(table).getByRole("row", { name: /Beta/ })).getByRole("button", { name: "Set up" }));

    const form = await screen.findByRole("form", { name: "Set up Beta" });
    // The form opens with the cursor in its first field.
    await waitFor(() => expect(within(form).getByLabelText("Stage for New")).toHaveFocus());
    expect(within(form).getByLabelText("Stage for Estimations")).toHaveAttribute("data-value", "estimation");
    await chooseOption(within(form).getByLabelText("Stage for Closed"), "done");
    await chooseOption(within(form).getByLabelText("Stage for New"), "");
    await userEvent.clear(within(form).getByLabelText("Team time zone"));
    await userEvent.type(within(form).getByLabelText("Team time zone"), "Asia/Kolkata");
    // Not an SOP owner: the branch pattern is shown read-only.
    expect(within(form).getByLabelText(/Branch name pattern/)).toHaveAttribute("readonly");
    await userEvent.click(within(form).getByRole("button", { name: "Set up project" }));

    await waitFor(() => expect(calls.some((call) => call.method === "PUT" && call.url === "/api/sop/projects/Beta")).toBe(true));
    const body = calls.find((call) => call.method === "PUT" && call.url === "/api/sop/projects/Beta")?.body as { settings: ProjectSettings };
    expect(body.settings).toMatchObject({
      stages: { estimation: ["Estimations"], active: ["Active"], done: ["Closed"] },
      fields: { category: "Microsoft.VSTS.Common.Activity", targetCompletion: null },
      categories: { Development: "Writing code." },
      timeZone: "Asia/Kolkata",
    });
    expect(body.settings.stages.ready).toBeUndefined();
  }, 15_000); // Steps through several dropdowns (Radix in jsdom): about 4 s when the whole suite runs in parallel.

  it("explains why a project that is not set up cannot be checked", async () => {
    setup();
    renderTab();

    const table = await screen.findByRole("table", { name: "SOP projects" });
    const checkbox = within(table).getByRole("checkbox", { name: "Check Beta for me" });
    expect(checkbox).toBeDisabled();
    expect(checkbox).toHaveAccessibleDescription("Set up first");
  });

  it("offers Edit and Remove on a set-up I may change, and asks before removing it", async () => {
    const calls = setup({ routes: [{ method: "DELETE", path: "/api/sop/projects/Alpha", body: {} }] });
    renderTab();

    const table = await screen.findByRole("table", { name: "SOP projects" });
    const alpha = within(table).getByRole("row", { name: /Alpha/ });
    expect(within(alpha).getByRole("button", { name: "Edit" })).toBeInTheDocument();
    await userEvent.click(within(alpha).getByRole("button", { name: "Remove" }));

    const confirm = await screen.findByRole("alertdialog");
    expect(confirm).toHaveTextContent("Stop SOP checks on Alpha for everyone?");
    expect(calls.some((call) => call.method === "DELETE")).toBe(false);
    await userEvent.click(within(confirm).getByRole("button", { name: "Stop checks" }));

    await waitFor(() => expect(calls.some((call) => call.method === "DELETE" && call.url === "/api/sop/projects/Alpha")).toBe(true));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });

  it("shows someone else's set-up read-only, saying who set it up", async () => {
    setup({ alpha: alphaSetUp({ canEdit: false }) });
    renderTab();

    const table = await screen.findByRole("table", { name: "SOP projects" });
    const alpha = within(table).getByRole("row", { name: /Alpha/ });
    expect(within(alpha).queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(within(alpha).queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
    expect(within(alpha).getByRole("button", { name: "History" })).toBeInTheDocument();
    expect(within(alpha).getByText("Set up by Ann; only they or an SOP owner can change it")).toBeInTheDocument();
    // Anyone may still set up a project nobody has set up, and switch checks off for themselves.
    expect(within(within(table).getByRole("row", { name: /Beta/ })).getByRole("button", { name: "Set up" })).toBeInTheDocument();
    expect(within(alpha).getByRole("checkbox", { name: "Check Alpha for me" })).toBeEnabled();
  });

  it("leaves a set-up moved from the old rulebook to SOP owners", async () => {
    setup({ alpha: alphaSetUp({ createdBy: null, canEdit: false }) });
    renderTab();

    const table = await screen.findByRole("table", { name: "SOP projects" });
    const alpha = within(table).getByRole("row", { name: /Alpha/ });
    expect(within(alpha).getByText("Set up before owners were recorded; only an SOP owner can change it")).toBeInTheDocument();
    expect(within(alpha).queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });

  it("names the project of each failed change, and a failed removal does not hide a failed toggle", async () => {
    setup({
      routes: [
        { method: "PUT", path: "/api/sop/projects/Alpha/checked", status: 500, body: { message: "Database unavailable" } },
        { method: "DELETE", path: "/api/sop/projects/Alpha", status: 403, body: { message: "Only the person who set up this project or an SOP owner can change it", reason: "PROJECT_SETUP_NOT_YOURS" } },
      ],
    });
    renderTab();

    const table = await screen.findByRole("table", { name: "SOP projects" });
    const alpha = within(table).getByRole("row", { name: /Alpha/ });
    await userEvent.click(within(alpha).getByRole("checkbox", { name: "Check Alpha for me" }));
    expect(await screen.findByText(/“Check for me” on Alpha was not saved: Database unavailable/)).toBeInTheDocument();

    await userEvent.click(within(alpha).getByRole("button", { name: "Remove" }));
    const confirm = await screen.findByRole("alertdialog");
    await userEvent.click(within(confirm).getByRole("button", { name: "Stop checks" }));
    // The dialog stays open and says why.
    expect(await within(confirm).findByRole("alert")).toHaveTextContent("Only the person who set up this project or an SOP owner can change it");
    await userEvent.click(within(confirm).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    const alerts = screen.getAllByRole("alert").map((alert) => alert.textContent);
    expect(alerts).toEqual(
      expect.arrayContaining([
        expect.stringContaining("“Check for me” on Alpha was not saved"),
        expect.stringContaining("Alpha was not removed: Only the person who set up this project or an SOP owner can change it"),
      ])
    );
  });
  it("says it is retrying while a failed history load is tried again", async () => {
    setup({ routes: [{ path: "/api/sop/projects/Alpha/history", status: 500, body: { message: "Database unavailable" } }] });
    renderTab();

    const table = await screen.findByRole("table", { name: "SOP projects" });
    await userEvent.click(within(within(table).getByRole("row", { name: /Alpha/ })).getByRole("button", { name: "History" }));
    expect(await screen.findByText(/Could not load the history/)).toBeInTheDocument();

    // The retry is still on its way.
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("button", { name: "Retrying…" })).toBeDisabled();
    expect(screen.getByText(/Could not load the history/)).toBeInTheDocument();
  });
});
