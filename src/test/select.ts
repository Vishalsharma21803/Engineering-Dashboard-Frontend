import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Picks an option in a SelectField (shadcn/ui Select) by its value, the way a
 * user does: open the dropdown, click the option.
 */
export async function chooseOption(trigger: HTMLElement, value: string): Promise<void> {
  await userEvent.click(trigger);
  const option = await waitFor(() => {
    const match = screen.getAllByRole("option").find((element) => element.getAttribute("data-value") === value);
    if (!match) throw new Error(`No option with value "${value}"`);
    return match;
  });
  await userEvent.click(option);
}

/** Opens a SelectField and returns its options; press Escape to close it again. */
export async function openOptions(trigger: HTMLElement): Promise<HTMLElement[]> {
  await userEvent.click(trigger);
  return screen.findAllByRole("option");
}
