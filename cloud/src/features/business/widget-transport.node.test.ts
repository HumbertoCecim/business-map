import { describe, expect, it, vi } from 'vitest';
import { emptyBoard } from '../../../../shared/model';
import { createWidgetTransport } from '../../../widget/transport';
import type { Snapshot, ProposalPreview } from './api';

const snapshot = (): Snapshot => ({ businessId: 'test-business', board: emptyBoard('test-board'), fingerprint: 'rev0', proposals: [], audit: [], lastTransactionId: 'tx-1' });
const preview = (state: Snapshot): ProposalPreview => ({ proposal: { id: 'proposal-1', title: 'Test', rationale: 'Test only', baseRevision: state.board.revision, commands: [{ type: 'title', title: 'Updated' }], hash: 'hash-1', status: 'pending', createdAt: new Date().toISOString() }, before: state.board, after: { ...state.board, title: 'Updated' }, stale: false, changes: [{ path: 'title', before: state.board.title, after: 'Updated' }] });
describe('widget hidden approval transport', () => {
  it('ignores model-visible state and only reads authorized hidden metadata', () => {
    const transport = createWidgetTransport({ callServerTool: vi.fn() });
    expect(() => transport.accept({ structuredContent: { snapshot: snapshot(), capabilities: { apply: 'model-injected' } } })).toThrow('autorizado');
  });
  it('keeps capabilities out of subscriber state and consumes them once on explicit confirmation', async () => {
    const state = snapshot(), proposalPreview = preview(state);
    const callServerTool = vi.fn().mockResolvedValueOnce({ _meta: { businessMap: { snapshot: state, proposalPreview, capabilities: { apply: 'hidden-one-use-secret' } } } }).mockResolvedValueOnce({ content: [], structuredContent: { ok: true, receipt: { revision: 1 } } }).mockResolvedValue({ _meta: { businessMap: { snapshot: { ...state, board: { ...state.board, revision: 1 } }, capabilities: {} } } });
    const transport = createWidgetTransport({ callServerTool }), observer = vi.fn(); transport.subscribe(observer);
    const loaded = await transport.preview('proposal-1');
    expect(JSON.stringify(observer.mock.calls)).not.toContain('hidden-one-use-secret');
    expect(JSON.stringify(loaded)).not.toContain('hidden-one-use-secret');
    await transport.resolve(loaded, 'apply');
    expect(callServerTool).toHaveBeenNthCalledWith(2, { name: 'business_apply_proposal', arguments: expect.objectContaining({ proposalId: 'proposal-1', capability: 'hidden-one-use-secret', baseRevision: 0 }) });
    expect(callServerTool).toHaveBeenLastCalledWith({ name: 'business_get_ui_state', arguments: {} });
    await expect(transport.resolve(loaded, 'apply')).rejects.toThrow();
    expect(callServerTool).toHaveBeenCalledTimes(3);
  });
  it('blocks confirmation after a new revision replaces the reviewed preview', async () => {
    const state = snapshot(), old = preview(state);
    const callServerTool = vi.fn().mockResolvedValue({ _meta: { businessMap: { snapshot: state, proposalPreview: old, capabilities: { apply: 'secret' } } } });
    const transport = createWidgetTransport({ callServerTool }); await transport.preview('proposal-1');
    const updated = { ...state, board: { ...state.board, revision: 2 } };
    transport.accept({ _meta: { businessMap: { snapshot: updated, proposalPreview: preview(updated), capabilities: { apply: 'new-secret' } } } });
    await expect(transport.resolve(old, 'apply')).rejects.toThrow('mudou');
    expect(callServerTool).toHaveBeenCalledTimes(1);
  });
});
