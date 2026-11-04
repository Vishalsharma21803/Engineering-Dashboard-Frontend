import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { Hint } from "../hint";

function renderHint(focusable: boolean) {
  render(
    <Hint label="Overdue by 2 days" focusable={focusable}>
      <span data-testid="trigger">Overdue</span>
    </Hint>
  );
  return screen.getByTestId("trigger");
}

/** A finger tap: pointer down, pointer up, click (no hover first). */
function tap(element: HTMLElement) {
  fireEvent.pointerDown(element, { pointerType: "touch" });
  fireEvent.pointerUp(element, { pointerType: "touch" });
  fireEvent.click(element);
}

describe("Hint", () => {
  it("puts a focusable hint in the tab order and opens it on focus", async () => {
    const trigger = renderHint(true);
    expect(trigger).toHaveAttribute("tabindex", "0");

    await userEvent.tab();

    expect(trigger).toHaveFocus();
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Overdue by 2 days");
  });

  it("opens on one tap and closes on the next", async () => {
    const trigger = renderHint(true);

    tap(trigger);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Overdue by 2 days");

    tap(trigger);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const trigger = renderHint(true);
    tap(trigger);
    await screen.findByRole("tooltip");

    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("leaves a plain hint out of the tab order", () => {
    const trigger = renderHint(false);
    expect(trigger).not.toHaveAttribute("tabindex");
  });
});
