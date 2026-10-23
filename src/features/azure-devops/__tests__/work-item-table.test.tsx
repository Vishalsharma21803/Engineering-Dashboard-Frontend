import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { WorkItemTable } from "../components/work-item-table";
import type { ComplianceResult, WorkItemSummary } from "../types/azure.types";
import { dashboard } from "./fixtures";

const task = dashboard.sections.workItems.data![0]!;
const items: WorkItemSummary[] = [
  task,
  { ...task, id: 201, type: "User Story", title: "Profile page", stateCategory: "Proposed", state: "New", assignedTo: null },
  {
    ...task,
    id: 202,
    type: "Bug",
    title: "Crash on save",
    priority: 1,
    assignedTo: { id: "other", displayName: "Reviewer Two", uniqueName: null },
  },
];
const compliance = new Map<number, ComplianceResult>(
  dashboard.sections.compliance.data!.map((result) => [result.workItemId, result])
);

function renderTable(mode: "mine" | "team") {
  render(
    <MemoryRouter>
      <WorkItemTable credentialId="c" workItems={items} mode={mode} compliance={compliance} myId="me" />
    </MemoryRouter>
  );
  return screen.getByRole("table");
}

function rows(table: HTMLElement) {
  return within(table).getAllByRole("row").length - 1;
}

describe("WorkItemTable", () => {
  it("distinguishes types and combines filters", async () => {
    const table = renderTable("mine");

    expect(within(table).getByTitle("User Story")).toHaveTextContent("Story");
    expect(within(table).getByTitle("Bug")).toHaveTextContent("Bug");
    expect(within(table).getByTitle("Priority 1")).toHaveTextContent("P1");

    await userEvent.selectOptions(screen.getByLabelText("Type"), "Bug");
    expect(rows(table)).toBe(1);
    expect(screen.getByText("1 of 3")).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Priority"), "2");
    expect(screen.getByText("No work items match these filters.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(rows(table)).toBe(3);
  });

  it("filters My work by SOP gaps and searches titles", async () => {
    const table = renderTable("mine");

    await userEvent.selectOptions(screen.getByLabelText("SOP"), "gaps");
    expect(within(table).getByRole("link", { name: "#102 Fix flaky test" })).toBeInTheDocument();
    expect(rows(table)).toBe(1);

    await userEvent.selectOptions(screen.getByLabelText("SOP"), "");
    await userEvent.type(screen.getByLabelText("Search ID, title or tag"), "profile");
    expect(rows(table)).toBe(1);
    expect(within(table).getByRole("link", { name: "#201 Profile page" })).toBeInTheDocument();
  });

  it("filters the team view by assignee", async () => {
    const table = renderTable("team");

    expect(screen.queryByLabelText("SOP")).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Assignee"), "unassigned");
    expect(rows(table)).toBe(2);

    await userEvent.selectOptions(screen.getByLabelText("Assignee"), "other");
    expect(within(table).getByText("Reviewer Two")).toBeInTheDocument();
    expect(rows(table)).toBe(1);
  });
});
