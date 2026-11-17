import { describe, expect, it, vi } from 'vitest';
import { defaultPosition, reconcilePositions, viewKey } from './map-presentation';

describe('map presentation is separate from canonical data', () => {
  it('retains surviving IDs regardless of reorder, drops removed IDs and avoids occupied slots', () => {
    const moved = { x: 740, y: 300 };
    const positions = reconcilePositions(['b', 'new', 'a'], { a: moved, b: defaultPosition(0), removed: { x: 1, y: 2 } });
    expect(positions.a).toEqual(moved);
    expect(positions.b).toEqual(defaultPosition(0));
    expect(positions.removed).toBeUndefined();
    expect(positions.new).not.toEqual(defaultPosition(0));
    expect(reconcilePositions(['a', 'b', 'new'], positions)).toEqual(positions);
  });

  it('separates business, board and focus even when IDs contain separators', () => {
    expect(viewKey('a:b', 'c', 'd')).not.toBe(viewKey('a', 'b:c', 'd'));
    expect(new Set([viewKey('a', 'b', 'c'), viewKey('x', 'b', 'c'), viewKey('a', 'x', 'c'), viewKey('a', 'b', 'x')]).size).toBe(4);
  });

  it('ignores corrupt preferences and keeps changes in memory if storage is denied', async () => {
    vi.resetModules();
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } });
    const { readView, saveView, readFocus, saveFocus } = await import('./map-presentation');
    expect(readView('denied')).toEqual({ positions: {} });
    saveView('denied', { positions: { a: { x: 10, y: 20 } }, viewport: { x: 1, y: 2, zoom: .8 } });
    expect(readView('denied').positions.a).toEqual({ x: 10, y: 20 });
    saveFocus('a', 'board', 'focus');
    expect(readFocus('a', 'board')).toBe('focus');
    expect(readFocus('b', 'board')).toBeNull();
    saveView(viewKey('a', 'board', 'last-focus'), { positions: { child: { x: 3, y: 4 } } });
    saveFocus('a', 'board', 'last-focus');
    expect(readFocus('a', 'board')).toBe('last-focus');
    expect(readView(viewKey('a', 'board', 'last-focus')).positions.child).toEqual({ x: 3, y: 4 });
    vi.unstubAllGlobals();
  });

  it('validates saved points and viewport without accepting nonfinite values', async () => {
    vi.resetModules();
    vi.stubGlobal('localStorage', { getItem: () => '{"positions":{"good":{"x":2,"y":3},"bad":{"x":"1","y":2}},"viewport":{"x":0,"y":0,"zoom":99}}' });
    const { readView } = await import('./map-presentation');
    expect(readView('invalid')).toEqual({ positions: { good: { x: 2, y: 3 } } });
    vi.unstubAllGlobals();
  });
});
