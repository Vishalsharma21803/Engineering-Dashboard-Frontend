import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { mockBackend, renderWithProviders } from "@/test/render";
import { ActionReviewDialog } from "../components/action-review-dialog";
import { pendingAction } from "./fixtures";

const approveUrl = `/api/actions/${pendingAction.id}/approve`;
const rejectUrl = `/api/actions/${pendingAction.id}/reject`;

describe("ActionReviewDialog", () => {
  it("shows the proposed change without calling the backend", () => {
    const calls = mockBackend([]);
    renderWithProviders(<ActionReviewDialog action={pendingAction} onClose={vi.fn()} />);

    expect(screen.getByText("Approval required · Close after merge")).toBeInTheDocument();
    expect(screen.getByText(pendingAction.summary)).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Resolved" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Closed" })).toBeInTheDocument();
    expect(calls).toEqual([]);
  });

  it("executes only after Approve, sending the previewed payload hash", async () => {
    const calls = mockBackend([
      {
        method: "POST",
        path: approveUrl,
        body: {
          message: "Action executed",
          action: { ...pendingAction, status: "SUCCEEDED" },
          verification: { verified: true, checks: [{ check: "System.State", passed: true }] },
        },
      },
    ]);
    renderWithProviders(<ActionReviewDialog action={pendingAction} onClose={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Approve & execute" }));

    expect(await screen.findByText("Executed in Azure DevOps.")).toBeInTheDocument();
    expect(screen.getByText(/Verified: System.State/)).toBeInTheDocument();
    expect(calls).toEqual([{ method: "POST", url: approveUrl, body: { payloadHash: pendingAction.payloadHash } }]);
    expect(screen.queryByRole("button", { name: "Approve & execute" })).not.toBeInTheDocument();
  });

  it("rejects without executing", async () => {
    const calls = mockBackend([
      {
        method: "POST",
        path: rejectUrl,
        body: { message: "Action rejected", action: { ...pendingAction, status: "REJECTED" } },
      },
    ]);
    renderWithProviders(<ActionReviewDialog action={pendingAction} onClose={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Reject" }));

    expect(await screen.findByText("Rejected. Nothing was changed in Azure DevOps.")).toBeInTheDocument();
    expect(calls.map((call) => call.url)).toEqual([rejectUrl]);
  });

  it("shows execution failures returned by the backend", async () => {
    mockBackend([
      {
        method: "POST",
        path: approveUrl,
        status: 409,
        body: {
          message: "The work item changed after this action was proposed. Propose it again.",
          reason: "ACTION_STALE",
          action: { ...pendingAction, status: "FAILED", errorCode: "ACTION_STALE" },
        },
      },
    ]);
    renderWithProviders(<ActionReviewDialog action={pendingAction} onClose={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Approve & execute" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("changed after this action was proposed");
    await waitFor(() => expect(screen.getByText("FAILED")).toBeInTheDocument());
  });

  it("offers no approval for actions that are no longer pending", () => {
    mockBackend([]);
    renderWithProviders(
      <ActionReviewDialog action={{ ...pendingAction, status: "EXPIRED" }} onClose={vi.fn()} />
    );

    expect(screen.queryByRole("button", { name: "Approve & execute" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
  });
});
