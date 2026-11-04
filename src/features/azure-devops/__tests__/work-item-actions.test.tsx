import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { mockBackend } from "@/test/render";
import { WorkItemActions } from "../components/work-item-actions";
import type { ActionPanel } from "../utils/action-panels";
import type { WorkItemDetail } from "../types/azure.types";
import { CREDENTIAL_ID, dashboard } from "./fixtures";

const summary = dashboard.sections.workItems.data![0]!;
const ticket = (rev: number, completedWork: number): WorkItemDetail =>
  ({
    ...summary,
    rev,
    completedWork,
    remainingWork: 5,
    allowedStates: [{ name: summary.state, category: summary.stateCategory }, { name: "Resolved", category: "Resolved" }],
    supportedFields: { originalEstimate: false, remainingWork: true, completedWork: true, storyPoints: false, effort: false, priority: false },
    closeAfterMergeAllowed: false,
  }) as unknown as WorkItemDetail;

describe("WorkItemActions", () => {
  it("offers each change as a button that opens its form, and closes the form once proposed", async () => {
    mockBackend([{ path: new RegExp(`/api/azure/${CREDENTIAL_ID}/`), body: { repositories: [] } }]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onPropose = vi.fn();
    function Harness() {
      const [open, setOpen] = useState<ActionPanel | null>(null);
      return (
        <QueryClientProvider client={client}>
          <WorkItemActions credentialId={CREDENTIAL_ID} workItem={ticket(1, 2)} isProposing={false} onPropose={onPropose} open={open} onOpenChange={setOpen} />
        </QueryClientProvider>
      );
    }
    render(<Harness />);

    // No form is on the page until asked for.
    expect(screen.queryByLabelText("Comment")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change state" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Comment" }));
    const dialog = await screen.findByRole("dialog", { name: "Add comment" });
    await userEvent.type(screen.getByLabelText("Comment"), "Approach: cache the token");
    await userEvent.click(screen.getByRole("button", { name: "Review comment…" }));

    expect(onPropose).toHaveBeenCalledWith(expect.objectContaining({ kind: "WORK_ITEM_COMMENT", params: { text: "Approach: cache the token" } }), expect.any(Function));
    expect(dialog).not.toBeInTheDocument();
  });

  it("takes new values from a changed ticket but keeps what the user typed", async () => {
    mockBackend([{ path: new RegExp(`/api/azure/${CREDENTIAL_ID}/`), body: { repositories: [] } }]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = (item: WorkItemDetail) => (
      <QueryClientProvider client={client}>
        <WorkItemActions credentialId={CREDENTIAL_ID} workItem={item} isProposing={false} onPropose={vi.fn()} open="fields" onOpenChange={vi.fn()} />
      </QueryClientProvider>
    );
    const { rerender } = render(view(ticket(1, 2)));

    await userEvent.clear(screen.getByLabelText("Remaining work (h)"));
    await userEvent.type(screen.getByLabelText("Remaining work (h)"), "3");

    // Someone logged time in Azure: the ticket comes back with a new revision.
    rerender(view(ticket(2, 4)));
    expect(screen.getByLabelText("Completed work (h)")).toHaveValue(4);
    expect(screen.getByLabelText("Remaining work (h)")).toHaveValue(3);
  });
});
