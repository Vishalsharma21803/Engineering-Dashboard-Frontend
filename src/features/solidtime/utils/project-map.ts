import type { SolidtimeConnection, SolidtimeProject } from "../types/solidtime.types";

/** The Solidtime project for an Azure project: the saved mapping, else a project with the same name. */
export function solidtimeProjectFor(connection: SolidtimeConnection, projects: SolidtimeProject[], azureProjectName: string): string | null {
  const mapped = connection.projectMap[azureProjectName.toLowerCase()];

  if (mapped && projects.some((project) => project.id === mapped)) {
    return mapped;
  }

  return projects.find((project) => project.name.trim().toLowerCase() === azureProjectName.trim().toLowerCase())?.id ?? null;
}

/** Same rule as the server: a standalone number in the description. */
export function mentionsTicket(description: string | null, ticketId: number): boolean {
  if (!description) return false;
  return [...description.matchAll(/(?<![\w./:])(?<!\d[-,])#?(\d{2,9})(?![\w/])(?![.:,-]\d)/g)].some((match) => Number(match[1]) === ticketId);
}
