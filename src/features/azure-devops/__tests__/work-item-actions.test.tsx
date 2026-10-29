import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { mockBackend } from "@/test/render";
import { WorkItemActions } from "../components/work-item-actions";
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
  it("takes new values from a changed ticket but keeps what the user typed", async () => {
    mockBackend([{ path: new RegExp(`/api/azure/${CREDENTIAL_ID}/`), body: { repositories: [] } }]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = (item: WorkItemDetail) => (
      <QueryClientProvider client={client}>
        <WorkItemActions credentialId={CREDENTIAL_ID} workItem={item} isProposing={false} onPropose={vi.fn()} />
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
