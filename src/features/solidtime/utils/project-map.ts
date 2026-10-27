import type { SolidtimeConnection, SolidtimeProject } from "../types/solidtime.types";

/** Same rule as the server: case, spaces, dashes (- – —), underscores and dots do not count. */
export function projectNameKey(name: string): string {
  return name.toLowerCase().replace(/[\s\-\u2013\u2014_.]+/g, "");
}

/** The Solidtime projects whose name equals the Azure project's (see `projectNameKey`). */
export function sameNameProjects<T extends { name: string }>(azureProjectName: string, projects: T[]): T[] {
  const key = projectNameKey(azureProjectName);
  return key ? projects.filter((project) => projectNameKey(project.name) === key) : [];
}

/** The Solidtime project for an Azure project: the saved mapping, else the one project with the same name (none when several match). */
export function solidtimeProjectFor(connection: SolidtimeConnection, projects: SolidtimeProject[], azureProjectName: string): string | null {
  const mapped = connection.projectMap[azureProjectName.toLowerCase()];

  if (mapped && projects.some((project) => project.id === mapped)) {
    return mapped;
  }

  const sameName = sameNameProjects(azureProjectName, projects);
  return sameName.length === 1 ? sameName[0]!.id : null;
}

/** Same rule as the server: a standalone number in the description. */
export function mentionsTicket(description: string | null, ticketId: number): boolean {
  if (!description) return false;
  return [...description.matchAll(/(?<![\w./:])(?<!\d[-,])#?(\d{2,9})(?![\w/])(?![.:,-]\d)/g)].some((match) => Number(match[1]) === ticketId);
}
