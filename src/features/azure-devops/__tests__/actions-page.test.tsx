import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { mockBackend, renderWithProviders } from "@/test/render";
import { ActionsPage } from "../pages/actions-page";
import { CREDENTIAL_ID, pageOf, pendingAction } from "./fixtures";

const decided = Array.from({ length: 10 }, (_, index) => ({
  ...pendingAction,
  id: `bbbbbbbb-1111-4111-8111-${String(index).padStart(12, "0")}`,
  status: "SUCCEEDED" as const,
  summary: `Change ${index + 1}`,
}));

describe("ActionsPage", () => {
  it("asks the server for one page of each list, scoped to the organization and project", async () => {
    const calls = mockBackend([
      { path: `/api/azure/${CREDENTIAL_ID}/projects`, body: { projects: [{ id: "p-alpha", name: "Alpha" }], truncated: false } },
      { path: "/api/actions", body: { actions: { ...pageOf(decided), total: 23, totalPages: 3 } } },
      { path: "/api/audit-logs", body: { auditLogs: pageOf([]) } },
    ]);
    renderWithProviders(<ActionsPage embedded />, { path: "/azure/:credentialId/actions", route: `/azure/${CREDENTIAL_ID}/actions?project=Alpha` });

    const history = await screen.findByRole("navigation", { name: "History pages" });
    expect(within(history).getByText("Showing 1–10 of 23")).toBeInTheDocument();
    expect(calls.some((call) => call.url.includes("history=true") && call.url.includes(`credentialId=${CREDENTIAL_ID}`) && call.url.includes("projectName=Alpha"))).toBe(true);

    await userEvent.click(within(history).getByRole("button", { name: "Next" }));
    await waitFor(() => expect(calls.some((call) => call.url.includes("history=true") && call.url.includes("page=2"))).toBe(true));
  });
});
