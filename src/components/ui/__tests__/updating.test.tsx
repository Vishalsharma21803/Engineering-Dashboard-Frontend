import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Updating } from "../updating";

describe("Updating", () => {
  it("dims and locks the old content while the next one loads, and says so", () => {
    const { rerender } = render(
      <Updating active label="Loading week…">
        <button type="button">Edit</button>
      </Updating>
    );
    expect(screen.getByRole("status")).toHaveTextContent("Loading week…");
    // inert: browsers keep the stale button from being clicked or focused.
    expect(screen.getByText("Edit").closest("[inert]")).not.toBeNull();

    rerender(
      <Updating active={false}>
        <button type="button">Edit</button>
      </Updating>
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" }).closest("[inert]")).toBeNull();
  });
});
