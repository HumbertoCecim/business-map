/** Browser-only presentation preferences. Never serialized into a business or command. */
export type Point = { x: number; y: number };
export type Viewport = Point & { zoom: number };
export type MapView = { positions: Record<string, Point>; viewport?: Viewport; canvas?: { width: number; height: number; narrow: boolean } };
const memory = new Map<string, unknown>();
const prefix = 'growyourplan.presentation.v1.';
export const viewKey = (businessId: string, boardId: string, focusId: string) =>
  prefix + JSON.stringify([businessId, boardId, focusId]);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const point = (value: unknown): value is Point => !!value && typeof value === 'object' && finite((value as Point).x) && finite((value as Point).y);

function read(key: string): unknown {
  if (memory.has(key)) return memory.get(key);
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    memory.set(key, value);
    return value;
  } catch { return null; }
}
function write(key: string, value: unknown) {
  memory.set(key, value);
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Preferences remain usable in memory. */ }
}
export function readView(key: string): MapView {
  const value = read(key) as Partial<MapView> | null;
  const positions: Record<string, Point> = Object.create(null);
  if (value?.positions && typeof value.positions === 'object') {
    Object.entries(value.positions).forEach(([id, position]) => { if (point(position)) positions[id] = { ...position }; });
  }
  const viewport = value?.viewport;
  const canvas = value?.canvas;
  return { positions,
    ...(point(viewport) && finite(viewport.zoom) && viewport.zoom >= .15 && viewport.zoom <= 1.8 ? { viewport: { ...viewport } } : {}),
    ...(canvas && finite(canvas.width) && canvas.width > 0 && finite(canvas.height) && canvas.height > 0 && typeof canvas.narrow === 'boolean' ? { canvas: { ...canvas } } : {}),
  };
}
export const saveView = (key: string, view: MapView) => write(key, view);
export const readFocus = (businessId: string, boardId: string): string | null => {
  const value = read(prefix + 'focus.' + JSON.stringify([businessId, boardId]));
  return typeof value === 'string' ? value : null;
};
export const saveFocus = (businessId: string, boardId: string, id: string | null) => write(prefix + 'focus.' + JSON.stringify([businessId, boardId]), id);

export const CARD_WIDTH = 228, CARD_HEIGHT = 176;
export function defaultPosition(index: number): Point {
  const ring = Math.floor(index / 8);
  const angle = [-90, 90, 0, 180, -45, 135, 45, 225][index % 8] * Math.PI / 180;
  return { x: Math.cos(angle) * (380 + ring * 290) - CARD_WIDTH / 2, y: Math.sin(angle) * (290 + ring * 235) - CARD_HEIGHT / 2 };
}
function overlaps(a: Point, b: Point) {
  return Math.abs(a.x - b.x) < CARD_WIDTH + 24 && Math.abs(a.y - b.y) < CARD_HEIGHT + 24;
}
/** Keep every surviving ID still; allocate only newcomers, including fixed proposal slots. */
export function reconcilePositions(ids: string[], saved: Record<string, Point>): Record<string, Point> {
  const result: Record<string, Point> = Object.create(null);
  for (const id of ids) if (point(saved[id])) result[id] = saved[id];
  const occupied = [{ x: -CARD_WIDTH / 2, y: -CARD_HEIGHT / 2 }, ...Object.values(result)];
  let slot = 0;
  for (const id of ids) {
    if (result[id]) continue;
    let candidate: Point;
    do { candidate = defaultPosition(slot++); } while (occupied.some(position => overlaps(candidate, position)));
    result[id] = candidate;
    occupied.push(candidate);
  }
  return result;
}
