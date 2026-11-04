import type { ListGroup } from "./row-parts";

export const groupProject = (group: ListGroup) => group.heading?.projectName ?? group.rows[0]?.item.projectName ?? "";

/** Within each status section, the groups of one project together, in the order each project first appears (so newest change first, still). */
export function inProjectOrder(groups: ListGroup[]): ListGroup[] {
  const sorted: ListGroup[] = [];
  let start = 0;
  while (start < groups.length) {
    let end = start;
    while (end < groups.length && groups[end]!.section === groups[start]!.section) end += 1;
    const run = groups.slice(start, end);
    const projects = [...new Set(run.map(groupProject))];
    for (const project of projects) sorted.push(...run.filter((group) => groupProject(group) === project));
    start = end;
  }
  return sorted;
}
