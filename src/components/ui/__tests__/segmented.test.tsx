import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Segmented } from "../segmented";

describe("Segmented", () => {
  it("is a named group of buttons with the chosen one pressed, and reports a new choice", async () => {
    const onChange = vi.fn();
    render(
      <Segmented
        label="Period"
        value="day"
        options={[
          { value: "day", label: "Day" },
          { value: "week", label: "Week" },
        ]}
        onChange={onChange}
      />
    );

    expect(screen.getByRole("group", { name: "Period" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Day" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Week" })).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(screen.getByRole("button", { name: "Week" }));

    expect(onChange).toHaveBeenCalledWith("week");
  });
});
