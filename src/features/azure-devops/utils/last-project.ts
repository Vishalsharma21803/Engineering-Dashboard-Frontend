/**
 * Per-browser memory of the cockpit context so the organization and
 * project chosen in the header stick across tabs and visits.
 */
const SELECTED_PROJECT = "azure:selected-project:";
const LAST_VIEWED_PROJECT = "azure:last-project:";
const LAST_CREDENTIAL = "azure:last-credential";

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable (private mode); selection then lives in the URL only.
  }
}

/** null = never chosen; "" = "All projects" was chosen explicitly. */
export function getSelectedProject(credentialId: string): string | null {
  return read(`${SELECTED_PROJECT}${credentialId}`);
}

export function saveSelectedProject(credentialId: string, projectId: string): void {
  write(`${SELECTED_PROJECT}${credentialId}`, projectId);

  if (projectId) {
    write(`${LAST_VIEWED_PROJECT}${credentialId}`, projectId);
  }
}

export function getLastCredential(): string | null {
  return read(LAST_CREDENTIAL);
}

export function saveLastCredential(credentialId: string): void {
  write(LAST_CREDENTIAL, credentialId);
}

function findProject(projects: Array<{ id: string; name: string }>, value: string) {
  return projects.find((project) => project.id === value || project.name === value);
}

/**
 * Project for the overview tab: the selection, else the last one viewed,
 * else the first. Remembered values must still exist in this organization.
 */
export function resolveDefaultProject(
  credentialId: string,
  selected: string,
  projects: Array<{ id: string; name: string }>
): string | null {
  if (selected && (projects.length === 0 || findProject(projects, selected))) {
    return selected;
  }

  for (const candidate of [getSelectedProject(credentialId), read(`${LAST_VIEWED_PROJECT}${credentialId}`)]) {
    const project = candidate ? findProject(projects, candidate) : undefined;

    if (project) {
      return project.id;
    }
  }

  return projects[0]?.id ?? null;
}
