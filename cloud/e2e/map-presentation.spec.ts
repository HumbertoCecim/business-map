import { expect, test, type Locator, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { emptyBoard } from '../../shared/model';
import type { Snapshot } from '../src/features/business/api';

const captures = fileURLToPath(new URL('../../docs/sessions/ui-01/', import.meta.url));
const card = (id: string, title: string) => ({ id, title, text: 'A long fictional note about understanding different needs, collecting useful evidence, and choosing a small next step. This detail should remain readable in the inspector without taking over the map.', firstStep: 'Talk to three people and capture the uncertainties.', lane: 'now' as const, done: false, important: false, urgent: false });
function fixture(businessId = 'presentation-a', revision = 7, many = false): Snapshot {
  const board = emptyBoard(`${businessId}-board`);
  board.title = businessId === 'presentation-a' ? 'Northstar Creative Studio' : 'Harbor Research Collective';
  board.revision = revision;
  board.sections = [
    { id: 'people', title: 'People and the decisions behind a new way of working together', questions: 'Which people have we not heard from yet?', cards: [card('interview', 'Understanding what matters before we choose an experiment'), card('evidence', 'Evidence that challenges our first assumptions')] },
    { id: 'offer', title: 'An offer that makes everyday work simpler', questions: 'What would make this useful?', cards: [card('value', 'A small and useful starting point')] },
    { id: 'operations', title: 'Operations and shared responsibilities', questions: 'How can the team make this sustainable?', cards: [] },
    { id: 'deep-area', title: 'Interview guide and open questions', parentId: 'interview', questions: 'Explore this note to reach level five.', cards: [card('deep-note', 'A detailed fifth-level note with room for a thoughtful explanation')] },
  ];
  if (many) for (let n = 0; n < 7; n++) board.sections.push({ id: `extra-${n}`, title: ['Long-term partnerships and collaboration', 'Revenue and pricing experiments', 'Brand, stories and communication', 'Resources and constraints', 'Risks and unanswered questions', 'Learning and evidence', 'Decisions worth revisiting'][n], questions: 'What do we know, and what should we explore next?', cards: [] });
  board.suggestions = [{ id: 'ghost-proposal', requestId: 'synthetic-request', kind: 'map_draft', title: 'A proposed research area', text: '', rationale: 'A fictional pending suggestion.', target: { kind: 'board', id: board.boardId }, structure: [], sourceAgentId: 'synthetic-agent', baseRevision: revision, createdAt: '2026-11-17T12:00:00Z', status: 'pending', stale: false, mapDraft: { sections: [{ id: 'candidate', title: 'A proposal waiting for your review', questions: '', cards: [] }], relations: [], sources: [] } }];
  return { businessId, board, fingerprint: `${businessId}-${revision}`, proposals: [], audit: [], lastTransactionId: null };
}
function byId(page: Page, id: string) { return page.locator(`.react-flow__node[data-id="${id}"]`); }
async function position(locator: Locator) {
  return locator.evaluate(element => { const value = new DOMMatrix((element as HTMLElement).style.transform); return { x: Math.round(value.m41 * 1000) / 1000, y: Math.round(value.m42 * 1000) / 1000 }; });
}
async function drag(page: Page, id: string, dx = 76, dy = 35) {
  const handle = byId(page, id).locator('.focus-drag-handle');
  await expect(handle).toBeVisible();
  const box = await handle.boundingBox(); if (!box) throw new Error('Missing drag handle bounds');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 14 }); await page.mouse.up();
}
async function installed(page: Page, getState: () => Snapshot) {
  const commands: unknown[] = [];
  await page.route('**/api/business', route => route.fulfill({ json: getState() }));
  await page.route('**/api/business/command', route => { commands.push(route.request().postDataJSON()); return route.fulfill({ json: getState() }); });
  await page.routeWebSocket('**/api/business/events', socket => socket.onMessage(() => {}));
  return commands;
}
async function open(page: Page) {
  await page.goto('/business');
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
  await expect(page.locator('.react-flow__viewport')).toHaveAttribute('style', /scale\(/);
  // Initial fitting is deliberately deferred until React Flow has measured its canvas.
  await page.waitForTimeout(180);
}
async function refresh(page: Page) { await page.getByRole('button', { name: 'Refresh map', exact: true }).click(); }
async function explore(page: Page, id: string) {
  await byId(page, id).locator('.focus-node-bottom button').click();
  await expect(byId(page, id).locator('.is-hub')).toBeVisible();
  await page.waitForTimeout(120);
}
async function root(page: Page) { await page.locator('.focus-breadcrumb button').first().click(); await expect(page.locator('.focus-map')).toHaveClass(/at-root/); await page.waitForTimeout(120); }
async function preference(page: Page, state: Snapshot, focus = state.board.boardId) {
  const key = 'growyourplan.presentation.v1.' + JSON.stringify([state.businessId, state.board.boardId, focus]);
  return page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null'), key);
}
async function expectStoredPosition(page: Page, state: Snapshot, id: string, point: { x: number; y: number }) {
  // CSS transforms are rounded for DOM comparisons; stored coordinates keep full floating-point precision.
  await expect.poll(async () => (await preference(page, state)).positions[id].x).toBeCloseTo(point.x, 3);
  await expect.poll(async () => (await preference(page, state)).positions[id].y).toBeCloseTo(point.y, 3);
}

test('desktop drag persists presentation through refresh and reload without commands, revisions or reframing', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  let state = fixture(); const original = structuredClone(state.board), commands = await installed(page, () => state);
  await open(page);
  const before = await position(byId(page, 'people'));
  const hub = await position(byId(page, state.board.boardId));
  const ghost = await position(byId(page, 'ghost:ghost-proposal:candidate'));
  await expect(byId(page, state.board.boardId).locator('.focus-drag-handle')).toHaveCount(0);
  await expect(byId(page, 'ghost:ghost-proposal:candidate').locator('.focus-drag-handle')).toHaveCount(0);
  await drag(page, 'people');
  const moved = await position(byId(page, 'people')); expect(moved).not.toEqual(before);
  await expectStoredPosition(page, state, 'people', moved);
  expect(await position(byId(page, state.board.boardId))).toEqual(hub);
  expect(await position(byId(page, 'ghost:ghost-proposal:candidate'))).toEqual(ghost);
  await page.locator('.react-flow__controls-zoomin').click();
  await page.waitForTimeout(250);
  const viewport = await page.locator('.react-flow__viewport').getAttribute('style');
  state = { ...state, fingerprint: 'external-text-update', board: { ...state.board, revision: 8, sections: state.board.sections.map(section => section.id === 'people' ? { ...section, questions: 'New fictional evidence arrived.' } : section) } };
  await refresh(page);
  await expect(page.locator('.revision')).toContainText('8');
  expect(await position(byId(page, 'people'))).toEqual(moved);
  expect(await page.locator('.react-flow__viewport').getAttribute('style')).toEqual(viewport);
  await page.reload(); await expect(byId(page, 'people')).toBeVisible();
  await expect.poll(() => position(byId(page, 'people'))).toEqual(moved);
  await expect.poll(() => page.locator('.react-flow__viewport').getAttribute('style')).toEqual(viewport);
  expect(commands).toEqual([]); expect(original.revision).toBe(7); expect(state.board.revision).toBe(8);
  expect(state.board.sections.map(section => section.id)).toEqual(original.sections.map(section => section.id));
});

test('levels keep their own layout, focus and viewport and reset changes only the current level', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const state = fixture(); await installed(page, () => state); await open(page);
  const rootDefault = await position(byId(page, 'people'));
  await drag(page, 'people'); const rootMoved = await position(byId(page, 'people'));
  await explore(page, 'people');
  const branchDefault = await position(byId(page, 'interview'));
  await drag(page, 'interview', 60, 25); const branchMoved = await position(byId(page, 'interview'));
  await page.locator('.react-flow__controls-zoomin').click(); await page.waitForTimeout(250);
  const branchViewport = await page.locator('.react-flow__viewport').getAttribute('style');
  await root(page); expect(await position(byId(page, 'people'))).toEqual(rootMoved);
  await explore(page, 'people'); expect(await position(byId(page, 'interview'))).toEqual(branchMoved);
  expect(await page.locator('.react-flow__viewport').getAttribute('style')).toEqual(branchViewport);
  await page.reload(); await expect(byId(page, 'people').locator('.is-hub')).toBeVisible();
  await expect.poll(() => position(byId(page, 'interview'))).toEqual(branchMoved);
  await page.locator('.focus-reset').click();
  await expect.poll(() => position(byId(page, 'interview'))).toEqual(branchDefault);
  await root(page); expect(await position(byId(page, 'people'))).toEqual(rootMoved);
  await page.locator('.focus-reset').click(); await expect.poll(() => position(byId(page, 'people'))).toEqual(rootDefault);
});

test('businesses with repeated element IDs and lower revisions cannot inherit one another’s preferences', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const a = fixture(), b = fixture('presentation-b', 1); let state = a;
  await installed(page, () => state); await open(page);
  const defaultPosition = await position(byId(page, 'people'));
  await drag(page, 'people'); const movedA = await position(byId(page, 'people'));
  await explore(page, 'people');
  state = b; await refresh(page);
  await expect(page.locator('.business-switch strong')).toHaveText(b.board.title);
  await expect(byId(page, b.board.boardId).locator('.is-hub')).toBeVisible();
  expect(await position(byId(page, 'people'))).toEqual(defaultPosition);
  await drag(page, 'people', -50, 30); const movedB = await position(byId(page, 'people'));
  state = a; await refresh(page);
  await expect(byId(page, 'people').locator('.is-hub')).toBeVisible();
  await root(page); expect(await position(byId(page, 'people'))).toEqual(movedA);
  await expectStoredPosition(page, b, 'people', movedB);
  await expectStoredPosition(page, a, 'people', movedA);
});

test('new and removed elements leave surviving positions and the chosen viewport unchanged', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  let state = fixture(); await installed(page, () => state); await open(page); await drag(page, 'people');
  const moved = await position(byId(page, 'people')), other = await position(byId(page, 'offer'));
  const viewport = await page.locator('.react-flow__viewport').getAttribute('style');
  state = { ...state, fingerprint: 'added', board: { ...state.board, revision: 8, sections: [...state.board.sections, { id: 'new-area', title: 'A newly confirmed area', questions: '', cards: [] }] } };
  await refresh(page); await expect(byId(page, 'new-area')).toBeVisible();
  const added = await position(byId(page, 'new-area'));
  expect(Math.abs(added.x - moved.x) >= 228 || Math.abs(added.y - moved.y) >= 176).toBe(true);
  expect(await position(byId(page, 'people'))).toEqual(moved); expect(await position(byId(page, 'offer'))).toEqual(other);
  state = { ...state, fingerprint: 'removed', board: { ...state.board, revision: 9, sections: state.board.sections.filter(section => section.id !== 'offer') } };
  await refresh(page); await expect(byId(page, 'offer')).toHaveCount(0);
  expect(await position(byId(page, 'people'))).toEqual(moved);
  expect(await page.locator('.react-flow__viewport').getAttribute('style')).toEqual(viewport);
  expect((await preference(page, state)).positions.offer).toBeUndefined();
});

test('denied preference storage keeps layouts usable in memory across level changes', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.addInitScript(() => {
    for (const name of ['getItem', 'setItem', 'removeItem']) Object.defineProperty(Storage.prototype, name, { configurable: true, value() { throw new DOMException('Storage disabled for UI verification', 'SecurityError'); } });
  });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const state = fixture(), commands = await installed(page, () => state); await open(page);
  await drag(page, 'people'); const moved = await position(byId(page, 'people'));
  await refresh(page); expect(await position(byId(page, 'people'))).toEqual(moved);
  await explore(page, 'people'); await root(page); expect(await position(byId(page, 'people'))).toEqual(moved);
  await page.locator('.focus-reset').click(); expect(await position(byId(page, 'people'))).not.toEqual(moved);
  expect(errors).toEqual([]); expect(commands).toEqual([]);
});

test('titles, internal buttons, keyboard and zoom work independently from dragging', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const state = fixture(), commands = await installed(page, () => state); await open(page);
  const initial = await position(byId(page, 'people'));
  await byId(page, 'people').locator('h3').click();
  await expect(page.locator('.inspector')).toBeVisible();
  expect(await position(byId(page, 'people'))).toEqual(initial);
  await page.getByRole('button', { name: 'Close details', exact: true }).click();
  const exploreButton = byId(page, 'people').locator('.focus-node-bottom button');
  await exploreButton.focus(); await page.keyboard.press('Enter');
  await expect(byId(page, 'people').locator('.is-hub')).toBeVisible();
  await page.locator('.focus-breadcrumb button').first().focus(); await page.keyboard.press('Enter');
  await expect(page.locator('.focus-map')).toHaveClass(/at-root/);
  await page.waitForTimeout(120);
  const viewport = await page.locator('.react-flow__viewport').getAttribute('style');
  await page.locator('.react-flow__controls-zoomout').click();
  await expect(page.locator('.react-flow__viewport')).not.toHaveAttribute('style', viewport!);
  expect(await position(byId(page, 'people'))).toEqual(initial); expect(commands).toEqual([]); expect(state.board.revision).toBe(7);
});

test('switching selection replaces the inspector editor without orphaned fields', async ({ page }) => {
  const state = fixture(); await installed(page, () => state); await open(page);
  await byId(page, state.board.boardId).locator('.is-hub').click();
  await expect(page.getByRole('textbox', { name: 'Business name', exact: true })).toHaveCount(1);
  await page.locator('.area-index button').filter({ hasText: 'People and the decisions' }).click();
  await expect(page.getByRole('textbox', { name: 'Area name', exact: true })).toHaveCount(1);
  await expect(page.getByRole('textbox', { name: 'Business name', exact: true })).toHaveCount(0);
  await root(page);
  await byId(page, state.board.boardId).locator('.is-hub').click();
  await expect(page.getByRole('textbox', { name: 'Business name', exact: true })).toHaveCount(1);
  await expect(page.getByRole('textbox', { name: 'Area name', exact: true })).toHaveCount(0);
});

test('narrow screens have no drag handles and keep navigation and editable drafts accessible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = fixture(), commands = await installed(page, () => state); await open(page);
  await expect(page.locator('.focus-drag-handle')).toHaveCount(0); await expect(page.locator('.focus-reset')).toBeVisible();
  await page.getByRole('combobox', { name: 'Choose an area', exact: true }).selectOption('people');
  await expect(byId(page, 'people').locator('.is-hub')).toBeVisible();
  await byId(page, 'interview').locator('h3').click();
  const title = page.getByRole('textbox', { name: 'Title', exact: true }); await title.fill('My fictional mobile draft');
  await page.getByRole('button', { name: 'Close details', exact: true }).click();
  await byId(page, 'interview').locator('h3').click(); await expect(title).toHaveValue('My fictional mobile draft');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(commands).toEqual([]);
});

test('background creation stays a draft until saved, and pan does not open creation', async ({ page }) => {
  await mkdir(captures, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  let state = fixture(); const commands: any[] = [];
  await installed(page, () => state);
  await page.route('**/api/business/command', route => {
    const command = route.request().postDataJSON().commands[0]; commands.push(command);
    if (command.type === 'card.save') state = { ...state, board: { ...state.board, revision: 8, sections: state.board.sections.map(section => section.id === command.sectionId ? { ...section, cards: [...section.cards, command.card] } : section) } };
    return route.fulfill({ json: state });
  });
  await open(page); await explore(page, 'people');
  const pane = page.locator('.react-flow__pane');
  const box = (await pane.boundingBox())!;
  const click = { x: box.width - 50, y: box.height / 2 };
  await page.mouse.move(box.x + click.x, box.y + click.y);
  await page.mouse.down(); await page.mouse.move(box.x + click.x - 60, box.y + click.y + 30, { steps: 8 }); await page.mouse.up();
  await expect(page.getByRole('dialog', { name: 'Add to the map' })).toHaveCount(0);
  await pane.click({ position: click });
  const menu = page.getByRole('dialog', { name: 'Add to the map' });
  await expect(menu).toBeVisible(); expect(commands).toEqual([]);
  await page.screenshot({ path: `${captures}/canvas-create.png`, fullPage: true });
  await page.keyboard.press('Escape'); await expect(menu).toHaveCount(0);
  const clickedPosition = await page.locator('.react-flow__viewport').evaluate((element, click) => {
    const matrix = new DOMMatrix((element as HTMLElement).style.transform);
    return { x: (click.x - matrix.m41) / matrix.m11 - 114, y: (click.y - matrix.m42) / matrix.m22 - 88 };
  }, click);
  await pane.click({ position: click });
  await menu.getByRole('button', { name: 'New note', exact: true }).click();
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('A note created on the canvas');
  expect(commands).toEqual([]);
  await page.getByRole('button', { name: 'Add to map', exact: true }).click();
  await expect.poll(() => commands.length).toBe(1);
  expect(commands[0]).toMatchObject({ type: 'card.save', sectionId: 'people', card: { title: 'A note created on the canvas' } });
  const id = commands[0].card.id;
  await expect.poll(async () => (await preference(page, state, 'people')).positions[id]).toBeTruthy();
  const savedPosition = await position(byId(page, id));
  // Browser mouse coordinates round fractional CSS pixels before conversion to map coordinates.
  expect(Math.abs(savedPosition.x - clickedPosition.x)).toBeLessThan(2);
  expect(Math.abs(savedPosition.y - clickedPosition.y)).toBeLessThan(2);
  await page.reload(); await expect(byId(page, id)).toBeVisible();
  expect(await position(byId(page, id))).toEqual(savedPosition);
  await root(page); const rootBox = (await pane.boundingBox())!;
  await pane.click({ position: { x: rootBox.width - 40, y: rootBox.height - 50 } });
  await menu.getByRole('combobox', { name: 'Area for the new note' }).selectOption('offer');
  await menu.getByRole('button', { name: 'New note', exact: true }).click();
  await expect(byId(page, 'offer').locator('.is-hub')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('');
  expect(commands).toHaveLength(1);
});

test('reorganize clears overlaps in the current level without moving the hub or proposal or issuing commands', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const state = fixture('presentation-a', 7, true);
  await page.addInitScript(({ key }) => localStorage.setItem(key, JSON.stringify({ positions: { people: { x: 0, y: 0 }, offer: { x: 0, y: 0 } } })), { key: 'growyourplan.presentation.v1.' + JSON.stringify([state.businessId, state.board.boardId, state.board.boardId]) });
  const commands = await installed(page, () => state); await open(page);
  const ghost = await position(byId(page, 'ghost:ghost-proposal:candidate'));
  await page.getByRole('button', { name: 'Reorganize map', exact: true }).click();
  const nodes = await page.locator('.react-flow__node').evaluateAll(elements => elements.map(element => {
    const style = (element as HTMLElement).style, p = new DOMMatrix(style.transform);
    return { x: p.m41, y: p.m42, w: parseFloat(style.width), h: parseFloat(style.height) };
  }));
  for (let a = 0; a < nodes.length; a++) for (let b = a + 1; b < nodes.length; b++) {
    const one = nodes[a], two = nodes[b];
    expect(one.x + one.w <= two.x || two.x + two.w <= one.x || one.y + one.h <= two.y || two.y + two.h <= one.y).toBe(true);
  }
  expect(await position(byId(page, state.board.boardId))).toEqual({ x: -108, y: -108 });
  expect(await position(byId(page, 'ghost:ghost-proposal:candidate'))).toEqual(ghost);
  expect(commands).toEqual([]); expect(state.board.revision).toBe(7);
});

test('area connections can be followed in both directions without duplicating the relationship', async ({ page }) => {
  await mkdir(captures, { recursive: true });
  const state = fixture(); state.board.relations = [{ id: 'link-1', fromId: 'people', toId: 'offer', label: 'Evidence informs the offer' }];
  const commands = await installed(page, () => state); await open(page);
  await page.locator('.area-index>button').filter({ hasText: 'People and the decisions' }).click();
  const connections = page.getByRole('region', { name: 'Connections', exact: true });
  await expect(connections).toContainText('Links to');
  await connections.getByRole('button', { name: 'An offer that makes everyday work simpler', exact: true }).click();
  await expect(byId(page, 'offer').locator('.is-hub')).toBeVisible();
  await expect(connections).toContainText('Linked from');
  await connections.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${captures}/area-backlinks.png`, fullPage: true });
  await connections.getByRole('button', { name: 'People and the decisions behind a new way of working together', exact: true }).click();
  await expect(byId(page, 'people').locator('.is-hub')).toBeVisible();
  expect(state.board.relations).toHaveLength(1); expect(commands).toEqual([]);
});

test('previous-level context shows all siblings with symbols and supports direct navigation on site and widget', async ({ page }) => {
  await mkdir(captures, { recursive: true });
  await page.setViewportSize({ width: 1600, height: 1050 });
  const state = fixture('presentation-a', 7, true);
  state.board.sections.find(section => section.id === 'extra-6')!.title = '🧭 Decisions worth revisiting';
  const commands = await installed(page, () => state); await open(page); await explore(page, 'people');
  const context = page.getByRole('complementary', { name: 'Previous level', exact: true });
  const siblings = state.board.sections.filter(section => !section.parentId);
  await expect(context.locator('.context-neighbor')).toHaveCount(siblings.length);
  await expect(context.locator('[aria-current="location"]')).toContainText('People and the decisions');
  await expect(context.locator('[aria-current="location"] .lucide-users')).toHaveCount(1);
  await expect(byId(page, 'people').locator('.lucide-users')).toHaveCount(1);
  await expect(context.locator('.context-neighbor').first()).toHaveAttribute('title', /Which people have we not heard from yet/);
  expect((await context.boundingBox())!.width).toBeGreaterThan(230);
  await page.screenshot({ path: `${captures}/context-light.png`, fullPage: true });
  const last = context.locator('.context-neighbor').last();
  await last.focus(); await page.keyboard.press('Enter');
  await expect(byId(page, 'extra-6').locator('.is-hub')).toBeVisible();
  await expect(last).toHaveAttribute('aria-current', 'location');
  await expect(last.locator('.map-symbol-emoji')).toHaveText('🧭');
  await context.getByRole('button', { name: `Back to ${state.board.title}`, exact: true }).click();
  await explore(page, 'people');
  await page.getByRole('button', { name: 'Toggle theme', exact: true }).first().click();
  await page.screenshot({ path: `${captures}/context-dark.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await context.getByRole('combobox', { name: 'Explore the previous level' }).selectOption('offer');
  await expect(byId(page, 'offer').locator('.is-hub')).toBeInViewport();
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `${captures}/context-mobile.png`, fullPage: true });
  expect(commands).toEqual([]); expect(state.board.revision).toBe(7);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route('**/test-tool', route => route.fulfill({ json: { content: [], _meta: { businessMap: { snapshot: state, approvalAvailable: false } } } }));
  await page.goto('/widget-host'); const frame = page.frameLocator('#map-frame');
  await frame.getByRole('button', { name: `Explore ${siblings[0].title}`, exact: true }).click();
  const widgetContext = frame.getByRole('complementary', { name: 'Previous level', exact: true });
  await expect(widgetContext.locator('.context-neighbor')).toHaveCount(siblings.length);
  await widgetContext.locator('.context-neighbor').last().click();
  await expect(frame.locator('.react-flow__node[data-id="extra-6"] .is-hub')).toBeVisible();
  await expect(frame.locator('.focus-drag-handle')).toHaveCount(0);
  await expect.poll(() => page.locator('#map-frame').evaluate(element => element.getBoundingClientRect().height)).toBeLessThanOrEqual(640);
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${captures}/context-widget.png`, fullPage: true });
});

test('capture fictional desktop, branch, mobile and inline widget review surfaces', async ({ page }) => {
  await mkdir(captures, { recursive: true });
  await page.setViewportSize({ width: 1600, height: 1050 });
  const state = fixture('presentation-a', 7, true); await installed(page, () => state); await open(page);
  await page.screenshot({ path: `${captures}/desktop-light.png`, fullPage: true });
  await explore(page, 'people'); await page.getByRole('button', { name: 'Toggle theme', exact: true }).first().click();
  await expect(page.locator('.business-cloud.studio')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({ path: `${captures}/branch-dark.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.focus-drag-handle')).toHaveCount(0);
  await expect(byId(page, 'people').locator('.is-hub')).toBeInViewport();
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${captures}/mobile.png`, fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  const proposal = { id: 'review-example', title: 'A clearer name for the next chapter', rationale: 'A fictional proposal for visual review. Nothing changes until you confirm.', baseRevision: state.board.revision, commands: [{ type: 'title' as const, title: 'Northstar Studio — a place for useful experiments' }], hash: 'synthetic-review-hash', status: 'pending' as const, createdAt: '2026-11-17T12:00:00Z' };
  const widgetState = { ...state, proposals: [proposal] };
  await page.route('**/test-tool', route => {
    const input = route.request().postDataJSON();
    const reviewing = input.arguments?.proposalId === proposal.id;
    return route.fulfill({ json: { content: [], _meta: { businessMap: { snapshot: widgetState, approvalAvailable: true, capabilities: reviewing ? { apply: 'synthetic-ui-only', reject: 'synthetic-reject-only' } : {}, ...(reviewing ? { proposalPreview: { proposal, before: state.board, after: { ...state.board, title: proposal.commands[0].title }, stale: false, changes: [{ path: '/title', before: state.board.title, after: proposal.commands[0].title }] } } : {}) } } } });
  });
  await page.goto('/widget-host'); const frame = page.frameLocator('#map-frame');
  await expect(frame.locator('.react-flow__node').first()).toBeVisible();
  await expect(frame.locator('.focus-drag-handle')).toHaveCount(0);
  await expect.poll(() => page.locator('#map-frame').evaluate(element => element.getBoundingClientRect().height)).toBeLessThanOrEqual(640);
  await page.screenshot({ path: `${captures}/widget.png`, fullPage: true });
  await frame.locator('.widget-proposals').click(); await frame.locator('.proposal-summary').click();
  await expect(frame.locator('.proposal-review')).toBeVisible();
  await page.screenshot({ path: `${captures}/widget-review.png`, fullPage: true });
  await frame.locator('.change-list').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${captures}/widget-review-diff.png`, fullPage: true });
});
