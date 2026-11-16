import { expect, test, type Page } from '@playwright/test';
import { emptyBoard } from '../../shared/model';
import type { Snapshot, ProposalPreview } from '../src/features/business/api';

function fixture(): Snapshot {
  const board = emptyBoard('synthetic-ui-board'); board.title = 'Ateliê de teste'; board.revision = 1;
  board.sections = [{ id: 'area-test', title: 'Clientes', questions: 'Quem queremos atender?', cards: [{ id: 'card-test', title: 'Receita recorrente', text: 'Hipótese sintética para o teste.', firstStep: 'Conversar com cinco pessoas', lane: 'later', done: false, important: false, urgent: false }] }];
  return { businessId: 'synthetic-ui-business', fingerprint: 'rev1', board, proposals: [], audit: [], lastTransactionId: null };
}
async function intercept(page: Page, getSnapshot: () => Snapshot) {
  await page.route('**/api/business', route => route.fulfill({ json: getSnapshot() }));
  await page.routeWebSocket('**/api/business/events', socket => { socket.onMessage(() => {}); });
}
test('preserves a dirty draft across an external revision and requires explicit rebase', async ({ page }) => {
  let state = fixture(); await intercept(page, () => state);
  const revisions: number[] = [];
  await page.route('**/api/business/command', async route => {
    const body = route.request().postDataJSON(); revisions.push(body.baseRevision);
    if (body.baseRevision !== state.board.revision) return route.fulfill({ status: 409, json: { error: 'Revision conflict' } });
    state = { ...state, fingerprint: 'rev3', board: { ...state.board, revision: 3, sections: [{ ...state.board.sections[0], cards: [body.commands[0].card] }] } };
    await route.fulfill({ json: state });
  });
  await page.goto('/business');
  await page.locator('.area-index>button').first().click();
  await page.getByRole('button', { name: 'Receita recorrente', exact: true }).click();
  await page.getByRole('textbox', { name: 'Título', exact: true }).fill('Meu rascunho preservado');
  state = { ...state, fingerprint: 'rev2', board: { ...state.board, revision: 2, sections: [{ ...state.board.sections[0], cards: [{ ...state.board.sections[0].cards[0], title: 'Texto recebido externamente' }] }] } };
  await page.getByRole('button', { name: 'Atualizar mapa', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Título', exact: true })).toHaveValue('Meu rascunho preservado');
  await expect(page.getByText('A base mudou desde que você abriu este rascunho.')).toBeVisible();
  await page.getByRole('button', { name: 'Salvar nota', exact: true }).click();
  await expect.poll(() => revisions).toEqual([1]);
  await page.getByRole('button', { name: 'Usar versão atual como base' }).click();
  await page.getByRole('button', { name: 'Salvar nota', exact: true }).click();
  await expect.poll(() => revisions).toEqual([1, 2]);
  await expect(page.getByRole('textbox', { name: 'Título', exact: true })).toHaveValue('Meu rascunho preservado');
});
test('renders server proposal diff as text and confirms the whole batch', async ({ page }) => {
  const state = fixture(), unsafe = '<img src=x onerror="window.untrustedExecuted=true">';
  const proposal = { id: 'proposal-test', title: 'Uma nova possibilidade', rationale: unsafe, baseRevision: 1, commands: [{ type: 'title' as const, title: 'Novo nome' }], hash: 'synthetic-hash', status: 'pending' as const, createdAt: '2026-01-01T00:00:00Z' };
  state.proposals = [proposal]; await intercept(page, () => state);
  const preview: ProposalPreview = { proposal, before: state.board, after: { ...state.board, title: 'Novo nome' }, stale: false, changes: [{ path: 'title', before: state.board.title, after: unsafe }] };
  await page.route('**/proposals/proposal-test/preview', route => route.fulfill({ json: preview }));
  let confirmed = false;
  await page.route('**/proposals/proposal-test/apply', async route => { const body = route.request().postDataJSON(); expect(body.baseRevision).toBe(1); expect(body.operationId).toBeTruthy(); expect(Object.keys(body).sort()).toEqual(['baseRevision', 'operationId']); confirmed = true; state.proposals = []; await route.fulfill({ json: { success: true } }); });
  await page.goto('/business'); await page.getByRole('button', { name: /Propostas/ }).first().click();
  await page.getByRole('button', { name: /Uma nova possibilidade/ }).click();
  await expect(page.locator('.proposal-review').getByRole('heading', { name: 'Uma nova possibilidade' })).toBeVisible();
  await expect(page.getByText('TEXTO DO ASSISTENTE', { exact: true })).toBeVisible();
  await expect(page.getByText('JUSTIFICATIVA DO ASSISTENTE', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Comparação calculada pelo servidor' })).toBeVisible();
  await expect(page.locator('.change').getByRole('heading', { name: 'Nome do negócio' })).toBeVisible();
  const technical = page.locator('.canonical-technical'); await expect(technical).not.toHaveAttribute('open');
  await technical.getByText('Detalhes técnicos', { exact: true }).click();
  await expect(technical.locator('pre')).toContainText('"campo": "title"');
  await technical.getByText('Detalhes técnicos', { exact: true }).click();
  await expect(page.getByText('ANTES', { exact: true })).toBeVisible(); await expect(page.getByText('DEPOIS', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => 'untrustedExecuted' in window)).toBe(false);
  await expect(page.locator('.proposal-review img')).toHaveCount(0);
  await page.getByRole('button', { name: 'Confirmar lote inteiro' }).click();
  await expect.poll(() => confirmed).toBe(true);
  await expect(page.getByRole('alert')).toContainText('Lote confirmado');
});
test('canonical deletions stay prominent when assistant text understates their impact', async ({ page }) => {
  const state = fixture();
  const proposal = { id: 'delete-proposal', title: 'Ajuste simples', rationale: 'Nenhuma nota será excluída.', baseRevision: 1, commands: [{ type: 'card.delete' as const, id: 'card-test' }], hash: 'delete-hash', status: 'pending' as const, createdAt: '2026-01-01T00:00:00Z' };
  state.proposals = [proposal]; await intercept(page, () => state);
  const preview: ProposalPreview = { proposal, before: state.board, after: { ...state.board, sections: [{ ...state.board.sections[0], cards: [] }] }, stale: false, changes: [{ path: '/sections', before: state.board.sections, after: [{ ...state.board.sections[0], cards: [] }] }] };
  await page.route('**/proposals/delete-proposal/preview', route => route.fulfill({ json: preview }));
  await page.goto('/business'); await page.getByRole('button', { name: /Propostas/ }).first().click();
  await page.getByRole('button', { name: /Ajuste simples/ }).click();
  const removals = page.getByRole('region', { name: 'Remoções propostas' });
  await expect(removals).toContainText('1 item será excluído deste mapa.');
  await expect(removals).toContainText('Receita recorrente');
  await expect(page.getByRole('button', { name: 'Confirmar lote inteiro' })).toBeVisible();
});
test('mobile keeps navigation, search, theme and external connection guidance usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); const state = fixture(); await intercept(page, () => state);
  await page.goto('/business'); await expect(page.getByRole('combobox', { name: 'Navegar no negócio' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Buscar no mapa' })).toBeVisible();
  await page.getByRole('button', { name: 'Alternar tema' }).last().click();
  await expect(page.locator('.business-cloud.studio')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.map-card>p').first()).toHaveCSS('color', 'rgb(150, 158, 144)');
  await page.locator('.cloud-mobile-tools').getByRole('button', { name: 'ChatGPT' }).click();
  await expect(page.getByRole('dialog', { name: 'Conectar ChatGPT' })).toBeVisible();
  await expect(page.getByText('Copiar o endereço não instala nem conecta o app automaticamente.', { exact: false })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Endereço do servidor MCP' })).toHaveValue(/\/mcp$/);
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
test('mobile map controls leave the area new-note button tappable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); const state = fixture(); await intercept(page, () => state);
  await page.goto('/business');
  await page.getByRole('combobox', { name: 'Escolher área' }).selectOption('area-test');
  const addNote = page.locator('.section-foot').getByRole('button', { name: 'Nova nota', exact: true });
  await expect(addNote).toBeInViewport({ ratio: 0.99 });
  await expect(page.locator('.react-flow__controls')).toHaveCSS('flex-direction', 'row');
  await expect.poll(async () => addNote.evaluate(button => {
    const rect = button.getBoundingClientRect();
    return [[.15, .5], [.5, .5], [.85, .5]].every(([x, y]) => {
      const target = document.elementFromPoint(rect.left + rect.width * x, rect.top + rect.height * y);
      return target === button || !!target && button.contains(target);
    });
  })).toBe(true);
  await addNote.click();
  await expect(page.getByRole('textbox', { name: 'Título', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Adicionar ao mapa', exact: true })).toBeVisible();
});
test('embedded MCP App uses the official bridge, reviews and confirms in the conversation', async ({ page }) => {
  const state = fixture(), secret = 'test-only-hidden-approval';
  const proposal = { id: 'embedded-proposal', title: 'Nome mais claro', rationale: 'Proposta sintética.', baseRevision: 1, commands: [{ type: 'title' as const, title: 'Ateliê atualizado' }], hash: 'embedded-hash', status: 'pending' as const, createdAt: '2026-01-01T00:00:00Z' }; state.proposals = [proposal];
  const preview: ProposalPreview = { proposal, before: state.board, after: { ...state.board, title: 'Ateliê atualizado' }, stale: false, changes: [{ path: '/title', before: state.board.title, after: 'Ateliê atualizado' }] };
  let applied = false;
  await page.route('**/test-tool', async route => {
    const request = route.request().postDataJSON();
    if (request.name === 'business_apply_proposal') {
      expect(request.arguments.capability).toBe(secret); expect(request.arguments.proposalId).toBe(proposal.id);
      expect(request.arguments.baseRevision).toBe(1); applied = true; state.board = { ...state.board, title: 'Ateliê atualizado', revision: 2 }; state.proposals = [];
      await route.fulfill({ json: { content: [{ type: 'text', text: 'Alteração confirmada.' }], structuredContent: { ok: true, revision: 2 } } }); return;
    }
    const reviewing = request.name === 'business_get_ui_state' && request.arguments.proposalId === proposal.id && !applied;
    await route.fulfill({ json: { content: [], _meta: { businessMap: { snapshot: state, approvalAvailable: true, ...(reviewing ? { proposalPreview: preview, capabilities: { apply: secret, reject: 'test-only-reject' } } : { capabilities: {} }) } } } });
  });
  await page.goto('/widget-host'); const widget = page.frameLocator('#map-frame');
  await expect(widget.getByText('Ateliê de teste', { exact: true })).toBeVisible();
  await expect(widget.locator('.react-flow')).toBeVisible();
  await expect(widget.locator('.react-flow__node').first()).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('embedded-map.png') });
  await widget.getByRole('textbox', { name: 'Buscar no mapa' }).fill('Receita');
  await widget.getByRole('button', { name: 'Abrir mapa em tela cheia' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-display', 'fullscreen');
  await widget.getByRole('button', { name: /Propostas/ }).click();
  await widget.getByRole('button', { name: /Nome mais claro/ }).click();
  await expect(widget.getByText('ANTES', { exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('embedded-review.png') });
  expect(applied).toBe(false);
  const storage = await page.frames().find(frame => frame.url().endsWith('/widget-frame'))!.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  expect(storage).not.toContain(secret);
  await widget.getByRole('button', { name: 'Confirmar lote inteiro' }).click();
  await expect.poll(() => applied).toBe(true);
  await expect(widget.getByText('Ateliê atualizado', { exact: true })).toBeVisible();
});

test('embedded map height settles when the host resizes its iframe to the reported content', async ({ page }) => {
  const state = fixture();
  await page.route('**/test-tool', route => route.fulfill({ json: { content: [], _meta: { businessMap: { snapshot: state, approvalAvailable: false, capabilities: {} } } } }));
  await page.goto('/widget-host');
  const widget = page.frameLocator('#map-frame');
  await expect(widget.locator('.react-flow__node').first()).toBeVisible();
  await expect.poll(() => page.locator('#map-frame').evaluate(frame => frame.getBoundingClientRect().height)).toBeLessThanOrEqual(640);
  const initialHeight = await page.locator('#map-frame').evaluate(frame => frame.getBoundingClientRect().height);
  const reports = Number(await page.locator('body').getAttribute('data-resize-count'));
  // Allow multiple observer/animation frames to expose any feedback growth.
  await page.waitForTimeout(1200);
  expect(await page.locator('#map-frame').evaluate(frame => frame.getBoundingClientRect().height)).toBe(initialHeight);
  expect(Number(await page.locator('body').getAttribute('data-resize-count'))).toBeLessThanOrEqual(reports + 1);
  await expect(widget.locator('.widget-footer')).toBeInViewport();
});

test('embedded map preserves user zoom through host resizing and unchanged refreshes', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const state = fixture(); let calls = 0;
  await page.route('**/test-tool', route => { calls++; return route.fulfill({ json: { content: [], _meta: { businessMap: { snapshot: state, approvalAvailable: false, capabilities: {} } } } }); });
  await page.goto('/widget-host');
  const widget = page.frameLocator('#map-frame');
  await expect(widget.locator('.react-flow__node').first()).toBeVisible();
  await page.waitForTimeout(700);
  const viewport = widget.locator('.react-flow__viewport');
  const fitted = await viewport.getAttribute('style');
  await widget.locator('.react-flow__controls-zoomin').click();
  await expect(viewport).not.toHaveAttribute('style', fitted!);
  await page.waitForTimeout(400);
  const chosen = await viewport.getAttribute('style'), previousCalls = calls;
  await page.setViewportSize({ width: 1180, height: 820 });
  await widget.getByRole('button', { name: 'Atualizar mapa' }).click();
  await expect.poll(() => calls).toBeGreaterThan(previousCalls);
  await page.waitForTimeout(700);
  await expect(viewport).toHaveAttribute('style', chosen!);
  await page.screenshot({ path: test.info().outputPath('embedded-stable-map.png') });
});

test('embedded mobile map stays bounded in inline and short fullscreen views', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 620 });
  const state = fixture();
  await page.route('**/test-tool', route => route.fulfill({ json: { content: [], _meta: { businessMap: { snapshot: state, approvalAvailable: false, capabilities: {} } } } }));
  await page.goto('/widget-host?theme=dark');
  const widget = page.frameLocator('#map-frame');
  await expect(widget.locator('.react-flow__node').first()).toBeVisible();
  await expect(widget.locator('main')).toHaveAttribute('data-theme', 'dark');
  await expect(widget.locator('main')).toHaveCSS('height', '560px');
  await widget.getByRole('button', { name: /Propostas/ }).click();
  await expect(widget.locator('.widget-detail')).toBeVisible();
  await expect(widget.locator('.widget-footer')).toBeInViewport();
  const frame = page.frames().find(frame => frame.url().endsWith('/widget-frame'))!;
  expect(await frame.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await widget.getByRole('button', { name: 'Abrir mapa em tela cheia' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-display', 'fullscreen');
  await expect(widget.locator('main')).toHaveCSS('height', '570px');
  await expect(widget.locator('.widget-footer')).toBeInViewport();
  await widget.getByRole('button', { name: 'Voltar ao mapa na conversa' }).click();
  await expect(widget.locator('main')).toHaveCSS('height', '560px');
  await page.waitForTimeout(500);
  expect(await page.locator('#map-frame').evaluate(frame => frame.getBoundingClientRect().height)).toBe(560);
  await page.screenshot({ path: test.info().outputPath('embedded-mobile-dark.png') });
});
