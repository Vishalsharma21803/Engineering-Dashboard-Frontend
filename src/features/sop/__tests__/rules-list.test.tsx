import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthContext } from "@/features/auth/context/auth-context";
import { mockBackend, renderWithProviders, type MockRoute } from "@/test/render";
import { chooseOption } from "@/test/select";
import { SopRulesPage } from "../pages/sop-rules-page";
import type { CheckInfo, RuleListItem, RulesList } from "../types/rules-list.types";

const checks: CheckInfo[] = [
  {
    name: "title-length",
    description: "Title length is within limits and does not end with a period.",
    aiReview: null,
    params: {
      type: "object",
      properties: {
        min: { default: 5, type: "integer", minimum: 1, maximum: 9007199254740991 },
        max: { default: 80, type: "integer", minimum: -9007199254740991, maximum: 255 },
      },
    },
  },
  {
    name: "stage-comment",
    description: "Around the latest move into a stage, the person who moved it comments with the listed details.",
    aiReview: "judge",
    params: {
      type: "object",
      properties: {
        stage: { type: "string", enum: ["active", "review", "testing"] },
        requires: { default: [], type: "array", items: { type: "string", enum: ["eta-date", "pr-number"] } },
        hours_after: { default: 24, type: "number", exclusiveMinimum: 0, maximum: 720 },
      },
      required: ["stage"],
    },
  },
  {
    name: "tags-present",
    description: "At least one tag.",
    aiReview: "draft",
    params: { type: "object", properties: { from_vocabulary: { default: false, type: "boolean" } } },
  },
];

function rule(overrides: Partial<RuleListItem> & Pick<RuleListItem, "id" | "title" | "when">): RuleListItem {
  return {
    checker: "code",
    uses: "title-length",
    params: { min: 5, max: 80 },
    appliesTo: ["story", "task", "bug", "feature", "epic", "impediment"],
    severity: "warn",
    rule: "Titles are short and clear.",
    passesWhen: null,
    failsWhen: null,
    origin: "default",
    custom: false,
    inStarter: true,
    defaults: null,
    ...overrides,
  };
}

const defaultRules: RuleListItem[] = [
  rule({ id: "STR-01", title: "Title length", when: "always" }),
  rule({ id: "DEV-02", title: "Stage comment at review", when: "at-review", uses: "stage-comment", params: { stage: "review", requires: ["pr-number"], hours_after: 24 } }),
  rule({ id: "EST-01", title: "Tags before work starts", when: "before-active", uses: "tags-present", params: { from_vocabulary: false }, severity: "fail" }),
];

const list: RulesList = {
  defaultVersion: 7,
  personalVersion: 3,
  canEditDefaults: false,
  issues: [],
  defaultRules,
  rules: [
    defaultRules[0]!,
    defaultRules[1]!,
    // My override of EST-01 (switched off), and one rule of my own.
    { ...defaultRules[2]!, severity: "off", origin: "personal", defaults: { severity: "fail", params: { from_vocabulary: false } } },
    rule({ id: "MY-01", title: "Bugs name the browser", when: "always", checker: "ai", uses: null, params: null, appliesTo: ["bug"], origin: "personal", custom: true }),
  ],
  checks,
};

const saved = { rulebook: { version: 4, content: "", createdAt: new Date().toISOString() } };

function renderPage(options: { owner?: boolean; route?: string; routes?: MockRoute[]; data?: RulesList } = {}) {
  const calls = mockBackend([{ path: "/api/sop/rules", body: options.data ?? list }, ...(options.routes ?? [])]);
  const user = { id: "u1", name: "Dev", email: "dev@example.com", isSopAdmin: options.owner ?? false } as never;
  renderWithProviders(
    <AuthContext.Provider value={{ user, isAuthenticated: true, isLoading: false }}>
      <SopRulesPage />
    </AuthContext.Provider>,
    { route: options.route ?? "/" }
  );
  return calls;
}

function row(name: string) {
  return screen.getByRole("listitem", { name });
}

const edits = (calls: ReturnType<typeof mockBackend>, path: string) => calls.filter((call) => call.method === "POST" && call.url === path).map((call) => call.body);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Rules list", () => {
  it("groups rules by stage, in the order a ticket meets them", async () => {
    renderPage();

    const groups = await screen.findAllByRole("region");
    expect(groups.map((group) => group.querySelector("h3")?.textContent)).toEqual(["Before work starts (1)", "At review (1)", "Always (2)"]);
    expect(within(groups[2]!).getByText("Bugs name the browser")).toBeInTheDocument();
    expect(within(row("Bugs name the browser")).getByText(/AI review only/)).toBeInTheDocument();
    expect(within(row("Tags before work starts")).getByText("yours")).toBeInTheDocument();

    // Search narrows the list; groups without matches disappear.
    await userEvent.type(screen.getByPlaceholderText("Search rule id or title"), "DEV-02");
    expect(screen.getAllByRole("region")).toHaveLength(1);
  });

  it("saves a level change at once as a set edit on the loaded version", async () => {
    const calls = renderPage({ routes: [{ method: "POST", path: "/api/sop/my-rules/edits", body: saved }] });

    await chooseOption(await screen.findByLabelText("Level for STR-01"), "off");

    expect(await within(row("Title length")).findByRole("status")).toHaveTextContent("Level set to Off.");
    expect(edits(calls, "/api/sop/my-rules/edits")).toEqual([{ baseVersion: 3, edits: [{ op: "set", id: "STR-01", severity: "off" }] }]);
  });

  it("builds settings inputs from the check's schema and saves only what changed", async () => {
    const calls = renderPage({ routes: [{ method: "POST", path: "/api/sop/my-rules/edits", body: saved }] });

    await screen.findByText("Stage comment at review");
    const stageRule = row("Stage comment at review");
    await userEvent.click(within(stageRule).getByRole("button", { name: "Settings" }));
    const form = within(stageRule).getByRole("form", { name: "Settings for DEV-02" });

    expect(within(stageRule).getByText(/the AI review can clear this when it is written another way/)).toBeInTheDocument();
    expect(within(form).getByLabelText("Stage")).toHaveAttribute("data-value", "review");
    expect(within(form).getByRole("checkbox", { name: "PR number" })).toBeChecked();
    expect(within(form).getByRole("checkbox", { name: "Eta date" })).not.toBeChecked();
    const hours = within(form).getByLabelText("Hours after");
    expect(hours).toHaveValue(24);
    expect(within(form).getByRole("button", { name: "Save settings" })).toBeDisabled();

    await userEvent.clear(hours);
    await userEvent.type(hours, "48");
    await userEvent.click(within(form).getByRole("checkbox", { name: "Eta date" }));
    await userEvent.click(within(form).getByRole("button", { name: "Save settings" }));

    expect(await within(stageRule).findByRole("status")).toHaveTextContent("Settings saved.");
    expect(edits(calls, "/api/sop/my-rules/edits")).toEqual([
      { baseVersion: 3, edits: [{ op: "set", id: "DEV-02", params: { requires: ["pr-number", "eta-date"], hours_after: 48 } }] },
    ]);
  });

  it("checks number settings before saving", async () => {
    const calls = renderPage();

    await screen.findByText("Title length");
    await userEvent.click(within(row("Title length")).getByRole("button", { name: "Settings" }));
    const max = within(row("Title length")).getByLabelText("Max");
    await userEvent.clear(max);
    await userEvent.type(max, "300");
    await userEvent.click(within(row("Title length")).getByRole("button", { name: "Save settings" }));

    expect(within(row("Title length")).getByText("Whole number, at most 255")).toBeInTheDocument();
    expect(edits(calls, "/api/sop/my-rules/edits")).toEqual([]);
  });

  it("resets my change to a default rule", async () => {
    const calls = renderPage({ routes: [{ method: "POST", path: "/api/sop/my-rules/edits", body: saved }] });

    await screen.findByText("Tags before work starts");
    // Only my changes to default rules can be reset; my own MY- rule is removed instead.
    expect(within(row("Title length")).queryByRole("button", { name: "Reset to default" })).not.toBeInTheDocument();
    expect(within(row("Bugs name the browser")).queryByRole("button", { name: "Reset to default" })).not.toBeInTheDocument();
    expect(within(row("Bugs name the browser")).getByRole("button", { name: "Remove" })).toBeInTheDocument();

    await userEvent.click(within(row("Tags before work starts")).getByRole("button", { name: "Reset to default" }));

    expect(await within(row("Tags before work starts")).findByRole("status")).toHaveTextContent("Back to the default.");
    expect(edits(calls, "/api/sop/my-rules/edits")).toEqual([{ baseVersion: 3, edits: [{ op: "reset", id: "EST-01" }] }]);
  });

  // Types a whole form key by key: slow under a parallel full run (15 s), not a hang.
  it("adds my rule that uses a built-in check", async () => {
    const calls = renderPage({ routes: [{ method: "POST", path: "/api/sop/my-rules/edits", body: saved }] });

    await userEvent.click(await screen.findByRole("button", { name: "Add my rule" }));
    const form = within(screen.getByRole("form", { name: "Add my rule" }));

    // Required fields are checked before anything is sent.
    await userEvent.click(form.getByRole("button", { name: "Add rule" }));
    expect(form.getByText("Choose a check")).toBeInTheDocument();
    expect(form.getByText("Choose at least one type")).toBeInTheDocument();
    expect(edits(calls, "/api/sop/my-rules/edits")).toEqual([]);

    await userEvent.type(form.getByLabelText("Title"), "Short titles");
    await chooseOption(form.getByLabelText("Check"), "title-length");
    expect(form.getByText(/does not end with a period/)).toBeInTheDocument();
    const max = form.getByLabelText("Max");
    await userEvent.clear(max);
    await userEvent.type(max, "60");
    await chooseOption(form.getByLabelText("When"), "before-active");
    await userEvent.click(form.getByRole("checkbox", { name: "Story" }));
    await chooseOption(form.getByLabelText("Level"), "fail");
    await userEvent.type(form.getByLabelText("Rule"), "Titles stay under 60 characters.");
    await userEvent.click(form.getByRole("button", { name: "Add rule" }));

    expect(await screen.findByText('Added "Short titles".')).toBeInTheDocument();
    expect(edits(calls, "/api/sop/my-rules/edits")).toEqual([
      {
        baseVersion: 3,
        edits: [
          {
            op: "add",
            card: {
              title: "Short titles",
              checker: "code",
              uses: "title-length",
              params: { min: 5, max: 60 },
              appliesTo: ["story"],
              when: "before-active",
              severity: "fail",
              rule: "Titles stay under 60 characters.",
            },
          },
        ],
      },
    ]);
  }, 15_000);

  // Types a whole form key by key: slow under a parallel full run (15 s), not a hang.
  it("adds an AI-only rule and shows the server's validation problems", async () => {
    const calls = renderPage({
      routes: [
        {
          method: "POST",
          path: "/api/sop/my-rules/edits",
          status: 422,
          body: { message: "The rules have problems", reason: "RULEBOOK_INVALID", errors: [{ field: "line 12", message: "MY-02: title is too vague" }] },
        },
      ],
    });

    await userEvent.click(await screen.findByRole("button", { name: "Add my rule" }));
    const form = within(screen.getByRole("form", { name: "Add my rule" }));
    await userEvent.click(form.getByRole("radio", { name: "AI review only" }));
    expect(form.getByText("Judged by your AI model on the ticket page only.")).toBeInTheDocument();
    expect(form.queryByLabelText("Check")).not.toBeInTheDocument();

    await userEvent.type(form.getByLabelText("Title"), "Bugs name the OS");
    await chooseOption(form.getByLabelText("When"), "always");
    await userEvent.click(form.getByRole("checkbox", { name: "Bug" }));
    await userEvent.type(form.getByLabelText("Rule"), "Every bug names the OS.");
    await userEvent.type(form.getByLabelText("Passes when"), "An OS is named.");
    await userEvent.type(form.getByLabelText("Fails when"), "No OS is named.");
    await userEvent.click(form.getByRole("button", { name: "Add rule" }));

    const alert = await form.findByRole("alert");
    expect(alert).toHaveTextContent("The rules have problems");
    expect(alert).toHaveTextContent("MY-02: title is too vague");
    expect(edits(calls, "/api/sop/my-rules/edits")[0]).toEqual({
      baseVersion: 3,
      edits: [
        {
          op: "add",
          card: {
            title: "Bugs name the OS",
            checker: "ai",
            passesWhen: "An OS is named.",
            failsWhen: "No OS is named.",
            appliesTo: ["bug"],
            when: "always",
            severity: "warn",
            rule: "Every bug names the OS.",
          },
        },
      ],
    });
  }, 15_000);

  it("asks to make the change again when the rules were changed elsewhere", async () => {
    const calls = renderPage({
      routes: [
        {
          method: "POST",
          path: "/api/sop/my-rules/edits",
          status: 409,
          body: { message: "The rules were changed elsewhere since you opened them. Reload and try again.", reason: "RULEBOOK_CHANGED" },
        },
      ],
    });

    await chooseOption(await screen.findByLabelText("Level for STR-01"), "notice");

    expect(await within(row("Title length")).findByRole("alert")).toHaveTextContent(/changed elsewhere since you opened them\. The list has been reloaded/);
    // The list is loaded again so the next try uses the newer version.
    await waitFor(() => expect(calls.filter((call) => call.url === "/api/sop/rules")).toHaveLength(2));
  });

  it("shows the default rules read-only to people who are not SOP owners", async () => {
    renderPage({ route: "/?tab=default" });

    expect(await screen.findByText("Only SOP owners can change the default rules.")).toBeInTheDocument();
    // The default rulebook only: my override and my own rule are not in it.
    expect(within(row("Tags before work starts")).queryByText("yours")).not.toBeInTheDocument();
    expect(screen.queryByText("Bugs name the browser")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /^Level for/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add rule" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Reset/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();

    // Settings can be read, not changed.
    await userEvent.click(within(row("Title length")).getByRole("button", { name: "Settings" }));
    expect(within(row("Title length")).getByLabelText("Max")).toBeDisabled();
    expect(within(row("Title length")).queryByRole("button", { name: "Save settings" })).not.toBeInTheDocument();
  });

  it("lets SOP owners reset and remove default rules", async () => {
    const calls = renderPage({
      owner: true,
      route: "/?tab=default",
      data: { ...list, canEditDefaults: true },
      routes: [
        {
          method: "POST",
          path: "/api/sop/rulebook/edits",
          status: 422,
          body: { message: "STR-01 is not a built-in rule, so it has no default to go back to", reason: "RULE_NOT_RESETTABLE" },
        },
      ],
    });

    await screen.findByText("Title length");
    await userEvent.click(within(row("Title length")).getByRole("button", { name: "Reset to starter" }));
    expect(await within(row("Title length")).findByRole("alert")).toHaveTextContent("STR-01 is not a built-in rule");

    await userEvent.click(within(row("Title length")).getByRole("button", { name: "Remove" }));
    const confirm = await screen.findByRole("alertdialog");
    expect(confirm).toHaveTextContent("Remove STR-01 from the default rules for everyone?");
    expect(confirm).toHaveTextContent("Earlier versions stay in the history.");
    await userEvent.click(within(confirm).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(edits(calls, "/api/sop/rulebook/edits")).toHaveLength(2));
    // The removal failed too (the server refuses every edit here): the dialog stays open and says why.
    expect(await within(confirm).findByRole("alert")).toHaveTextContent("STR-01 is not a built-in rule");
    expect(edits(calls, "/api/sop/rulebook/edits")).toEqual([
      { baseVersion: 7, edits: [{ op: "reset", id: "STR-01" }], note: "STR-01: restored the starter version" },
      { baseVersion: 7, edits: [{ op: "remove", id: "STR-01" }], note: "STR-01: removed" },
    ]);
  });

  it("keeps the Markdown editor under Advanced", async () => {
    mockBackend([
      { path: "/api/sop/rules", body: list },
      { path: "/api/sop/my-rules", body: { rulebook: { version: 3, content: "", createdAt: null } } },
      { path: "/api/sop/my-rules/versions", body: { versions: [] } },
      { method: "POST", path: "/api/sop/validate", body: { valid: true, errors: [], summary: { projects: [], cards: [], overrides: [] } } },
    ]);
    const user = { id: "u1", name: "Dev", email: "dev@example.com", isSopAdmin: false } as never;
    renderWithProviders(
      <AuthContext.Provider value={{ user, isAuthenticated: true, isLoading: false }}>
        <SopRulesPage />
      </AuthContext.Provider>
    );

    await screen.findByText("Title length");
    expect(screen.queryByRole("textbox", { name: "My rules" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByText("Advanced: edit as Markdown"));
    expect(await screen.findByRole("textbox", { name: "My rules" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export .md" })).toBeInTheDocument();
  });
});
