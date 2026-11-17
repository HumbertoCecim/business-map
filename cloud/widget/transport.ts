import type { App } from '@modelcontextprotocol/ext-apps';
import type { ProposalPreview, Snapshot } from '../src/features/business/api';

type HiddenState = { snapshot: Snapshot; focusId?: string; proposalPreview?: ProposalPreview; approvalAvailable?: boolean; capabilities?: { apply?: string; reject?: string; undo?: string } };
type ToolResult = { isError?: boolean; _meta?: Record<string, unknown>; [key: string]: unknown };
/** The approval capabilities live only in this closure. No model context, URL, storage, logs or widget state. */
export function createWidgetTransport(app: Pick<App, 'callServerTool'>) {
  let current: HiddenState | null = null;
  let selectedProposal: string | undefined;
  const listeners = new Set<(snapshot: Snapshot, approvalAvailable: boolean) => void>();
  const accept = (result: ToolResult) => {
    if (result.isError) throw new Error('A ação não foi concluída. Atualize o mapa e revise novamente.');
    const hidden = result._meta?.businessMap as HiddenState | undefined;
    if (!hidden?.snapshot?.board || typeof hidden.snapshot.board.revision !== 'number') throw new Error('O servidor não retornou o mapa autorizado.');
    if (current && hidden.snapshot.board.revision < current.snapshot.board.revision) return current;
    current = hidden;
    for (const listener of listeners) listener(hidden.snapshot, hidden.approvalAvailable === true);
    return hidden;
  };
  const call = async (name: string, args: Record<string, unknown>) => accept(await app.callServerTool({ name, arguments: args }) as ToolResult);
  const mutate = async (name: string, args: Record<string, unknown>) => {
    const result = await app.callServerTool({ name, arguments: args }) as ToolResult;
    if (result.isError) throw new Error('A ação não foi concluída. Atualize o mapa e revise novamente.');
    // Mutation results intentionally contain a receipt only. Re-read canonical hidden state.
    selectedProposal = undefined;
    return call('business_get_ui_state', {});
  };
  return {
    accept,
    subscribe(listener: (snapshot: Snapshot, approvalAvailable: boolean) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async refresh() { return (await call('business_get_ui_state', selectedProposal ? { proposalId: selectedProposal } : {})).snapshot; },
    async preview(id: string) {
      selectedProposal = id;
      const hidden = await call('business_get_ui_state', { proposalId: id });
      if (!hidden.proposalPreview || hidden.proposalPreview.proposal.id !== id) throw new Error('Não foi possível carregar esta proposta.');
      return hidden.proposalPreview;
    },
    async resolve(preview: ProposalPreview, action: 'apply' | 'reject') {
      if (!current?.proposalPreview || current.proposalPreview.proposal.id !== preview.proposal.id || current.proposalPreview.before.revision !== preview.before.revision || current.proposalPreview.proposal.hash !== preview.proposal.hash) throw new Error('A prévia mudou. Abra a proposta novamente e revise o lote atualizado.');
      const capability = current.capabilities?.[action];
      if (!capability) throw new Error('A autorização da prévia expirou. Abra a proposta novamente.');
      current.capabilities = {};
      await mutate(action === 'apply' ? 'business_apply_proposal' : 'business_reject_proposal', { proposalId: preview.proposal.id, baseRevision: preview.before.revision, operationId: crypto.randomUUID(), capability });
    },
    async undo() {
      const transactionId = current?.snapshot.lastTransactionId, capability = current?.capabilities?.undo;
      if (!transactionId || !capability || !current) throw new Error('Não há alteração disponível para desfazer. Atualize o mapa.');
      const baseRevision = current.snapshot.board.revision; current.capabilities = {};
      await mutate('business_undo', { transactionId, baseRevision, operationId: crypto.randomUUID(), capability });
    },
    clearProposal() { selectedProposal = undefined; if (current) { current.proposalPreview = undefined; current.capabilities = {}; } },
    dispose() { current = null; listeners.clear(); },
  };
}
