import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GlobalErrorToaster } from "@/components/ui/global-error-toaster";
import { Updating } from "@/components/ui/updating";
import { useActionReview } from "@/features/azure-devops/hooks/use-action-review";
import { PartialReadNotice } from "@/features/azure-devops/components/feedback";
import { useApproveAction } from "@/features/azure-devops/hooks/use-actions";
import { FormNotice } from "@/features/auth/components/form-notice";
import { bumpSessionEpoch } from "@/lib/api-client";
import { dismissGlobalNotice, getGlobalNotices, pushGlobalNotice, stampSession } from "@/lib/global-errors";
import { renderWithProviders } from "@/test/render";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Every request waits until the test answers it. */
function heldBackend() {
  const waiting: Array<(response: Response) => void> = [];
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => waiting.push(resolve))));
  return {
    answer: async (response: Response) => {
      await act(async () => {
        waiting.shift()?.(response);
      });
    },
  };
}

function Proposer() {
  const review = useActionReview();
  return (
    <div>
      <button type="button" onClick={() => review.propose({ credentialId: "c1", kind: "WORK_ITEM_COMMENT", target: { workItemId: 1 }, params: { text: "Hi" } })}>
        Propose
      </button>
      {review.proposeError ? <p role="alert">In page: {review.proposeError}</p> : null}
    </div>
  );
}

function Approver() {
  const approve = useApproveAction();
  return (
    <button type="button" onClick={() => approve.mutate({ id: "a1", payloadHash: "h" })}>
      Approve
    </button>
  );
}

/** The toaster lives in the layout; the page under it can go away. */
function Shell({ page }: { page: "propose" | "approve" }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      {open ? page === "propose" ? <Proposer /> : <Approver /> : <p>Another page</p>}
      <button type="button" onClick={() => setOpen(false)}>
        Navigate away
      </button>
      <GlobalErrorToaster />
    </>
  );
}

afterEach(() => {
  for (const notice of getGlobalNotices()) dismissGlobalNotice(notice.id);
});

describe("results that arrive after the page is gone", () => {
  it("shows a failure in the page while it is open, and no toast", async () => {
    const backend = heldBackend();
    renderWithProviders(<Shell page="propose" />);
    await userEvent.click(screen.getByRole("button", { name: "Propose" }));
    await backend.answer(json({ message: "Work item is locked", reason: "AZURE_CONFLICT" }, 409));

    expect(await screen.findByText("In page: Work item is locked")).toBeInTheDocument();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("shows exactly one toast when the proposal fails after leaving the page", async () => {
    const backend = heldBackend();
    renderWithProviders(<Shell page="propose" />);
    await userEvent.click(screen.getByRole("button", { name: "Propose" }));
    await userEvent.click(screen.getByRole("button", { name: "Navigate away" }));
    await backend.answer(json({ message: "Something went wrong.", reason: "INTERNAL_ERROR" }, 500));

    const toast = await screen.findByRole("alert");
    expect(toast).toHaveTextContent("Could not prepare the change");
    expect(toast).toHaveTextContent("Something went wrong (HTTP 500)");
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("says a change was prepared when it was proposed after leaving the page", async () => {
    const backend = heldBackend();
    renderWithProviders(<Shell page="propose" />);
    await userEvent.click(screen.getByRole("button", { name: "Propose" }));
    await userEvent.click(screen.getByRole("button", { name: "Navigate away" }));
    await backend.answer(json({ message: "Action proposed", action: { id: "a1" } }, 201));

    expect(await screen.findByRole("status")).toHaveTextContent("Change prepared");
    expect(await screen.findByRole("link", { name: "Open Approvals" })).toHaveAttribute("href", "/actions");
  });

  it("reports an approval that failed after the dialog closed", async () => {
    const backend = heldBackend();
    renderWithProviders(<Shell page="approve" />);
    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
    await userEvent.click(screen.getByRole("button", { name: "Navigate away" }));
    await backend.answer(json({ message: "Azure DevOps rejected the change", reason: "AZURE_BAD_REQUEST" }, 502));

    const toast = await screen.findByRole("alert");
    expect(toast).toHaveTextContent("The change failed");
    expect(toast).toHaveTextContent("Azure DevOps rejected the change");
  });
});

describe("results of an ended session", () => {
  it("never shows the previous account's approval result to the next one", async () => {
    const backend = heldBackend();
    renderWithProviders(<Shell page="approve" />);
    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
    await userEvent.click(screen.getByRole("button", { name: "Navigate away" }));
    // Signed out, and another account signed in, while the approval was still running.
    bumpSessionEpoch();
    await backend.answer(json({ message: "Action approved", action: { id: "a1", summary: "Comment on #12" } }));

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(getGlobalNotices()).toEqual([]);
  });

  it("drops a proposal failure that arrives after the session changed", async () => {
    const backend = heldBackend();
    renderWithProviders(<Shell page="propose" />);
    await userEvent.click(screen.getByRole("button", { name: "Propose" }));
    await userEvent.click(screen.getByRole("button", { name: "Navigate away" }));
    bumpSessionEpoch();
    await backend.answer(json({ message: "Something went wrong.", reason: "INTERNAL_ERROR" }, 500));
    expect(getGlobalNotices()).toEqual([]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("announcing", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** A frame passes (the region is painted empty), then the text is shown and read. */
  const nextFrame = () => act(() => vi.advanceTimersByTime(50));

  it("shows a status toast's text only after its region was painted, inside no other live region", () => {
    vi.useFakeTimers();
    renderWithProviders(<GlobalErrorToaster />);
    act(() => pushGlobalNotice({ tone: "info", title: "Change applied", message: "Comment on #12" }, stampSession()));
    const toast = screen.getByRole("status");

    // The region is there with its space kept, but its text is not yet seen or read.
    expect(screen.getByText("Change applied")).not.toBeVisible();
    nextFrame();
    expect(screen.getByText("Change applied")).toBeVisible();
    expect(within(toast).getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
    expect(toast.parentElement?.closest("[aria-live], [role=status], [role=alert]")).toBeNull();
  });

  it("shows an error toast at once (an alert is announced when it appears)", () => {
    vi.useFakeTimers();
    renderWithProviders(<GlobalErrorToaster />);
    act(() => pushGlobalNotice({ tone: "error", title: "The change failed", message: "Azure DevOps rejected the change" }, stampSession()));
    expect(screen.getByRole("alert")).toHaveTextContent("The change failed");
    expect(screen.getByText("The change failed")).toBeVisible();
  });

  it("does the same for a partial-read notice, the Loading badge and a form notice", () => {
    vi.useFakeTimers();
    renderWithProviders(
      <>
        <PartialReadNotice messages={["Showing the 200 most recently changed tickets."]} />
        <Updating active>
          <p>Rows</p>
        </Updating>
        <FormNotice tone="warning" message="Your session expired. Sign in again to continue where you were." />
      </>
    );
    const texts = ["Showing the 200 most recently changed tickets.", "Loading…", "Your session expired. Sign in again to continue where you were."];

    expect(screen.getAllByRole("status")).toHaveLength(3);
    for (const text of texts) expect(screen.getByText(text)).not.toBeVisible();
    nextFrame();
    for (const text of texts) expect(screen.getByText(text)).toBeVisible();
  });
});
