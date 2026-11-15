/** One observation per host/project, shared by pills and both panel surfaces. */
export class ProjectObservations<T> {
  constructor(private validate?: (next: T, previous: T | undefined) => void) {}
  private groups = new Map<
    string,
    {
      listeners: Map<
        object,
        {
          load: () => Promise<T>;
          priority: number;
          value: (v: T) => void;
          error: (e: unknown) => void;
        }
      >;
      timer: ReturnType<typeof setInterval>;
      loading: boolean;
      epoch: number;
      latest?: T;
    }
  >();
  watch(
    key: string,
    load: () => Promise<T>,
    value: (v: T) => void,
    error: (e: unknown) => void,
    interval = 6000,
    priority = 0,
  ): () => void {
    const token = {};
    let group = this.groups.get(key);
    if (!group) {
      group = {
        listeners: new Map(),
        loading: false,
        epoch: 0,
        timer: setInterval(() => void this.refresh(key), interval),
      };
      this.groups.set(key, group);
    }
    group.listeners.set(token, { load, priority, value, error });
    if (group.latest !== undefined) value(group.latest);
    void this.refresh(key);
    return () => {
      group!.listeners.delete(token);
      if (!group!.listeners.size && this.groups.get(key) === group) {
        clearInterval(group!.timer);
        this.groups.delete(key);
      }
    };
  }
  publish(key: string, value: T) {
    const group = this.groups.get(key);
    if (!group) return;
    this.validate?.(value, group.latest);
    group.epoch++;
    group.latest = value;
    for (const listener of group.listeners.values()) listener.value(value);
  }
  async refresh(key: string) {
    const group = this.groups.get(key);
    if (!group || group.loading) return;
    group.loading = true;
    const epoch = group.epoch;
    try {
      // Resolve through a currently owned reader. The project directory follows
      // live conversation workspaces even if a panel opened on an older worktree.
      const reader = [...group.listeners.values()].sort(
        (a, b) => b.priority - a.priority,
      )[0];
      if (!reader) return;
      const value = await reader.load();
      if (this.groups.get(key) === group && group.epoch === epoch) {
        this.validate?.(value, group.latest);
        group.latest = value;
        for (const listener of group.listeners.values()) listener.value(value);
      }
    } catch (e) {
      if (this.groups.get(key) === group && group.epoch === epoch)
        for (const listener of group.listeners.values()) listener.error(e);
    } finally {
      group.loading = false;
    }
  }
  dispose() {
    for (const group of this.groups.values()) clearInterval(group.timer);
    this.groups.clear();
  }
}
