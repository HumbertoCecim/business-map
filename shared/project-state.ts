export type ProjectCell = { value: unknown; listeners: Set<() => void> };
/** UI draft state only. Persistent content always goes through the server store. */
export class ProjectStateStore {
  private projects = new Map<string, Map<string, ProjectCell>>();
  cell<T>(scope: string, name: string, initial: T | (() => T)): ProjectCell {
    let cells = this.projects.get(scope);
    if (!cells) {
      cells = new Map();
      this.projects.set(scope, cells);
    }
    let cell = cells.get(name);
    if (!cell) {
      cell = {
        value: typeof initial === "function" ? (initial as () => T)() : initial,
        listeners: new Set(),
      };
      cells.set(name, cell);
    }
    return cell;
  }
}
export function projectScope(hostId: string, projectId: string): string {
  return JSON.stringify([hostId, projectId]);
}
