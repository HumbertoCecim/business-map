import type { Board, Command } from '../../business/model';

export interface Proposal {
  id: string; title: string; rationale: string; baseRevision: number;
  commands: Command[]; hash: string; status: 'pending' | 'applied' | 'rejected'; createdAt: string;
}
export interface Snapshot {
  businessId: string; fingerprint: string; board: Board; proposals: Proposal[];
  audit: Array<{ id?: string; action?: string; createdAt?: string; [key: string]: unknown }>;
  lastTransactionId: string | null;
}
export interface ProposalPreview {
  proposal: Proposal; before: Board; after: Board | null; stale: boolean;
  changes: Array<{ path: string; before?: unknown; after?: unknown }>;
}
export type Run = (command: Command, base?: Snapshot) => Promise<boolean>;
export const uid = (prefix = 'operation') => `${prefix}-${crypto.randomUUID()}`;
export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin',
    ...(body !== undefined ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    let message = 'Não foi possível concluir a ação.';
    if (data && typeof data === 'object') {
      const failure = data as { error?: unknown; message?: unknown };
      if (typeof failure.error === 'string') message = failure.error;
      else if (failure.error && typeof failure.error === 'object' && 'message' in failure.error && typeof failure.error.message === 'string') message = failure.error.message;
      else if (typeof failure.message === 'string') message = failure.message;
    }
    throw new ApiError(message, response.status);
  }
  return data as T;
}
export function manualCommand(snapshot: Snapshot, command: Command) {
  return api<Snapshot>('/api/business/command', { operationId: uid(), baseRevision: snapshot.board.revision, commands: [command] });
}
export function subscribe(onChange: () => void, onOnline: (online: boolean) => void) {
  let socket: WebSocket | undefined, timer: ReturnType<typeof setTimeout> | undefined, stopped = false;
  const connect = () => {
    if (stopped || document.hidden) return;
    socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/business/events`);
    socket.onopen = () => { onOnline(true); onChange(); };
    socket.onmessage = () => onChange();
    socket.onclose = () => { onOnline(false); if (!stopped) timer = setTimeout(connect, 6000); };
    socket.onerror = () => socket?.close();
  };
  const visible = () => { if (!document.hidden) { onChange(); if (!socket || socket.readyState > 1) connect(); } };
  connect(); document.addEventListener('visibilitychange', visible);
  // A poll also recovers from intermediaries that drop WebSocket events.
  const poll = setInterval(() => { if (!document.hidden) onChange(); }, 15000);
  return () => { stopped = true; socket?.close(); clearTimeout(timer); clearInterval(poll); document.removeEventListener('visibilitychange', visible); };
}
