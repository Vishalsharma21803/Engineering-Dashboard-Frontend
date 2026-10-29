import { expect, type Locator } from "@playwright/test";

/**
 * Picks an option in a SelectField (shadcn/ui Select), like selectOption on a
 * native select: by value, or by visible label with { label }.
 */
export async function choose(select: Locator, option: string | { label: string }) {
  await select.click();
  const listbox = select.page().getByRole("listbox");
  const item =
    typeof option === "string"
      ? listbox.locator(`[role="option"][data-value="${option}"]`)
      : listbox.getByRole("option", { name: option.label, exact: true });
  await item.click();
  await expect(listbox).toHaveCount(0);
}

/** Opens a SelectField and returns its option list; close it with Escape. */
export async function openOptions(select: Locator): Promise<Locator> {
  await select.click();
  return select.page().getByRole("listbox").getByRole("option");
}
