import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { ConfirmDialog } from "../confirm-dialog";

function Harness({ onConfirm = vi.fn(), isPending = false, error = null }: { onConfirm?: () => void; isPending?: boolean; error?: string | null }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <p>{open ? "open" : "closed"}</p>
      <ConfirmDialog
        open={open}
        title="Disconnect Solidtime?"
        description="Your time in Solidtime is not affected."
        confirmLabel="Disconnect"
        destructive
        isPending={isPending}
        error={error}
        onConfirm={onConfirm}
        onOpenChange={setOpen}
      />
    </>
  );
}

describe("ConfirmDialog", () => {
  it("asks the question in an alert dialog, with the focus on Cancel", async () => {
    render(<Harness />);

    const dialog = await screen.findByRole("alertdialog", { name: "Disconnect Solidtime?" });
    expect(dialog).toHaveAccessibleDescription("Your time in Solidtime is not affected.");
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus();
  });

  it("runs the change on confirm and leaves closing to the caller", async () => {
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);

    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Disconnect" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("closes on Cancel and on Escape", async () => {
    render(<Harness />);
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByText("closed")).toBeInTheDocument();
  });

  it("puts the focus back on the button that opened it after Cancel or Escape", async () => {
    function Opener() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Disconnect…
          </button>
          <ConfirmDialog open={open} title="Disconnect Solidtime?" description="Your time in Solidtime is not affected." confirmLabel="Disconnect" onConfirm={vi.fn()} onOpenChange={setOpen} />
        </>
      );
    }
    render(<Opener />);
    const opener = screen.getByRole("button", { name: "Disconnect…" });

    await userEvent.click(opener);
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(opener).toHaveFocus();

    await userEvent.keyboard("{Enter}");
    expect(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Cancel" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(opener).toHaveFocus();
  });

  it("cannot be closed while the change runs, and shows why the last try failed", async () => {
    const { rerender } = render(<Harness isPending />);
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();

    rerender(<Harness error="Could not disconnect Solidtime." />);
    expect(within(screen.getByRole("alertdialog")).getByRole("alert")).toHaveTextContent("Could not disconnect Solidtime.");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
