import {
  useCallback,
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction,
} from "react";

import { ProjectStateStore } from "../shared/project-state";
const projects = new ProjectStateStore();

/** Same client/host/project, across Explorer, workspace tabs and worktrees. */
export function useProjectState<T>(
  scope: string,
  name: string,
  initial: T | (() => T),
): [T, Dispatch<SetStateAction<T>>] {
  const current = projects.cell(scope, name, initial);
  const subscribe = useCallback(
    (listener: () => void) => {
      current.listeners.add(listener);
      return () => {
        current.listeners.delete(listener);
      };
    },
    [current],
  );
  const read = useCallback(() => current.value as T, [current]);
  const value = useSyncExternalStore(subscribe, read, read);
  const set = useCallback<Dispatch<SetStateAction<T>>>(
    (next) => {
      const updated =
        typeof next === "function"
          ? (next as (v: T) => T)(current.value as T)
          : next;
      if (Object.is(updated, current.value)) return;
      current.value = updated;
      for (const listener of current.listeners) listener();
    },
    [current],
  );
  return [value, set];
}
