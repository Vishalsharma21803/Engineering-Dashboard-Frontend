import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { AuthContext } from "@/features/auth/context/auth-context";
import { mockBackend, renderWithProviders } from "@/test/render";
import { chooseOption } from "@/test/select";
import { ProjectsTab } from "../components/projects-tab";
import type { ProjectSettings } from "../types/sop.types";

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

function setup() {
  return mockBackend([
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
      body: { projects: [{ projectName: "Alpha", settings: alphaSettings, createdBy: "Ann", updatedBy: "Ann", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), checkedForMe: true }] },
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
  });
});
