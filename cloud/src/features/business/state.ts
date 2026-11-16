import { useEffect, useState } from 'react';
import type { Snapshot } from './api';

export function useLocal<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => {
    try { const saved = localStorage.getItem(key); return saved ? JSON.parse(saved) as T : fallback; } catch { return fallback; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* In-memory draft remains usable. */ } }, [key, value]);
  return [value, setValue] as const;
}

/** External revisions refresh clean fields and preserve every dirty draft and its original revision. */
export function useDraft<T>(key: string, initial: T, snapshot: Snapshot) {
  const scoped = `business-cloud.${snapshot.businessId}.${key}`;
  const [draft, setValue] = useLocal(scoped, initial);
  const [revision, setRevision] = useLocal(`${scoped}.revision`, snapshot.board.revision);
  const [dirty, setDirty] = useLocal(`${scoped}.dirty`, false);
  useEffect(() => {
    if (!dirty || JSON.stringify(draft) === JSON.stringify(initial)) {
      setValue(initial); setRevision(snapshot.board.revision); setDirty(false);
    }
  }, [snapshot.fingerprint, snapshot.board.revision]);
  const setDraft = (next: T) => { setDirty(true); setValue(next); };
  const base = { ...snapshot, board: { ...snapshot.board, revision } };
  const setBase = (next: Snapshot) => setRevision(next.board.revision);
  return [draft, setDraft, base, setBase] as const;
}
