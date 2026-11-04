/** Sentences for PartialReadNotice: what a list read left out (field meanings in azure.types.ts). */

export function stateLookupNotice(failed: string[] | undefined): string | null {
  return failed && failed.length > 0
    ? `Ticket states for ${failed.join(", ")} could not be read from Azure DevOps; open/closed is guessed from the state name.`
    : null;
}

/** Dashboard and My work: the list is also what the SOP checks run on. */
export function checkedTicketsTruncatedNotice(truncated: { cap: number } | null | undefined): string | null {
  return truncated ? `Showing the ${truncated.cap} most recently changed tickets; older ones are not listed or checked.` : null;
}

/** Team work: a plain list, no checks. */
export function listedTicketsTruncatedNotice(truncated: { cap: number } | null | undefined): string | null {
  return truncated ? `Showing the ${truncated.cap} most recently changed tickets; older ones are not listed.` : null;
}

export function sprintUnreadableNotice(unreadable: string[] | undefined): string | null {
  return unreadable && unreadable.length > 0
    ? `The current sprint of ${unreadable.join(", ")} could not be read; its tickets are shown in every view.`
    : null;
}
