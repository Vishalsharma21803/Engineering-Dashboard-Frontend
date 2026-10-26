import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ComplianceResult } from "@/features/azure-devops/types/azure.types";
import { renderWithProviders } from "@/test/render";
import { SopResultPanel } from "../components/sop-result-panel";

const result: ComplianceResult = {
  workItemId: 7,
  projectName: "Alpha",
  title: "Export",
  type: "Task",
  state: "Active",
  stateCategory: "InProgress",
  configured: true,
  sopProject: "checked",
  rulebook: { defaultVersion: 2, personalVersion: 0 },
  violations: [],
  notices: [
    { ruleId: "STR-11", ruleTitle: "Tags are set", checker: "code", severity: "low", message: "No tags.", evidence: [], suggestedAction: null },
  ],
  passedRules: [],
  pendingRules: [],
  skippedRules: [],
  aiRules: [],
};

describe("SopResultPanel", () => {
  it("shows notices separately from gaps", () => {
    renderWithProviders(<SopResultPanel result={result} />);

    expect(screen.getByText("No SOP gaps found by the code rules.")).toBeInTheDocument();
    expect(screen.getByText("Notices (not counted as gaps)")).toBeInTheDocument();
    expect(screen.getByText("Tags are set")).toBeInTheDocument();
    expect(screen.getByText(/No tags\./)).toBeInTheDocument();
  });
});
