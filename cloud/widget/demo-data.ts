/** Synthetic UI-01 data. This module is loaded only by the loopback browser harness. */
import { emptyBoard, parseBoard, type Card } from '../../shared/model';
import { applyBatch, boardChanges, exportPortable } from '../src/business/domain';
import type { ProposalPreview, Snapshot } from '../src/features/business/api';
import type { ChangeCommand } from '../src/business/model';

const note = (id: string, title: string): Card => ({ id, title,
  text: 'Fictional research note for the interface preview. We want to understand the people behind this decision, document what remains uncertain, and compare a small experiment with the current approach.\n\nEvidence to collect: three interviews, an example of the current workflow, and a short review of the alternatives. This longer paragraph belongs in the inspector, while the map keeps a readable overview.',
  firstStep: 'Arrange three short conversations and write down what surprised us.', lane: 'now', done: false, important: false, urgent: false });
const titles = ['People and customer research', 'A clear and useful offer', 'Long-term partnerships and shared responsibilities', 'Operations and delivery', 'Revenue and pricing experiments', 'Brand, stories and communication', 'Resources and constraints', 'Risks, assumptions and unanswered questions', 'Learning and evidence', 'Decisions worth revisiting'];
function fixture(key: string): Snapshot {
  const board = emptyBoard(`ui01-${key}`);
  board.title = key === 'studio' ? 'Northstar Creative Studio' : 'Harbor Community Research';
  board.revision = 1;
  board.sections = titles.map((title, index) => ({ id: `area-${index + 1}`, title,
    questions: 'What do we know, what is uncertain, and what would help us decide?',
    cards: Array.from({ length: index === 0 ? 9 : 2 }, (_, n) => note(`note-${index + 1}-${n + 1}`, n === 0 ? 'Understanding what matters when teams choose a new way of working together' : `Research question ${n + 1}: small experiments with useful evidence`)) }));
  board.sections.push({ id: 'interview-plan', parentId: 'note-1-1', title: 'Interview plan and open questions', questions: 'Explore the fifth level through the interview notes.', cards: [note('interview-detail', 'A detailed interview guide for people with different needs and expectations')] });
  const proposal = { id: `proposal-${key}`, title: 'Make room for a focused learning experiment', rationale: 'This fictional proposal adds a small experiment without prescribing a method. Review the exact changes before confirming.', baseRevision: 1,
    commands: [{ type: 'section.save' as const, section: { id: 'proposed-experiment', title: 'A small experiment with clear learning questions', questions: 'What could we learn in one afternoon?', cards: [] } }], hash: `synthetic-${key}-proposal`, status: 'pending' as const, createdAt: '2026-11-17T12:00:00Z' };
  return { businessId: `ui01-${key}`, board: parseBoard(board), fingerprint: `${key}-1`, proposals: [proposal], audit: [], lastTransactionId: null };
}

export function createDemoData() {
  const states = new Map(['studio', 'research'].map(key => [key, fixture(key)]));
  const previous = new Map<string, Snapshot>();
  const receipts = new Map<string, Snapshot>();
  const capabilities = new Map<string, { key: string; action: string; target: string; revision: number }>();
  let commandCalls = 0;
  const get = (key: string) => { const state = states.get(key); if (!state) throw new Error('NOT_FOUND: Unknown fictional business.'); return state; };
  const revision = (state: Snapshot, expected: number) => { if (state.board.revision !== expected) throw new Error('CONFLICT: The demo map changed. Refresh and review again.'); };
  const preview = (key: string, id: string): ProposalPreview => {
    const state = get(key), proposal = state.proposals.find(item => item.id === id && item.status === 'pending');
    if (!proposal) throw new Error('NOT_FOUND: Proposal is no longer pending.');
    const stale = proposal.baseRevision !== state.board.revision;
    const after = stale ? null : applyBatch(state.board, proposal.commands, proposal.baseRevision);
    return { proposal, before: state.board, after, stale, changes: after ? boardChanges(state.board, after) : [] };
  };
  const commit = (key: string, commands: ChangeCommand[], expected: number, action = 'manual') => {
    const state = get(key); revision(state, expected);
    const board = applyBatch(state.board, commands, expected);
    previous.set(key, structuredClone(state));
    const transactionId = crypto.randomUUID();
    const next = { ...state, board, fingerprint: `${key}-${board.revision}`, lastTransactionId: transactionId,
      audit: [...state.audit, { transactionId, action, at: new Date().toISOString(), actor: { channel: action === 'apply' ? 'chatgpt' : 'site' } }] };
    states.set(key, next); return next;
  };
  const undo = (key: string, input: { baseRevision: number; transactionId: string }) => {
    const state = get(key), before = previous.get(key); revision(state, input.baseRevision);
    if (!before || state.lastTransactionId !== input.transactionId) throw new Error('CONFLICT: Nothing available to undo.');
    const next = { ...before, board: { ...before.board, revision: state.board.revision + 1 }, fingerprint: `${key}-${state.board.revision + 1}`, lastTransactionId: null };
    previous.delete(key); states.set(key, next); return next;
  };
  const resolveProposal = (key: string, id: string, action: string, expected: number) => {
    const state = get(key); revision(state, expected);
    const p = preview(key, id);
    const next = action === 'apply' ? commit(key, p.proposal.commands, p.proposal.baseRevision, 'apply') : state;
    next.proposals = next.proposals.map(item => item.id === id ? { ...item, status: action === 'apply' ? 'applied' : 'rejected' } : item);
    next.fingerprint = `${key}-${next.board.revision}-${action}`;
    return next;
  };
  return {
    get, stats: () => ({ commandCalls }),
    update(key: string, action: string) {
      const state = get(key), id = 'demo-added-area';
      return commit(key, action === 'remove' ? [{ type: 'section.delete', id }] : [{ type: 'section.save', section: { id, title: 'New evidence arriving while the map stays in place', questions: 'A fictional external update.', cards: [] } }], state.board.revision);
    },
    reset(key: string) {
      const next = fixture(key), nextRevision = get(key).board.revision + 1;
      next.board.revision = nextRevision;
      next.proposals = next.proposals.map(proposal => ({ ...proposal, baseRevision: nextRevision }));
      next.fingerprint = `${key}-${nextRevision}`;
      states.set(key, next); previous.delete(key); receipts.clear(); capabilities.clear(); return next;
    },
    api(key: string, path: string, input: any) {
      if (path === '/api/business') return get(key);
      if (path === '/api/business/account') return { user: { name: 'Fictional reviewer', email: 'reviewer@example.invalid' } };
      const receiptKey = `${key}:${input.operationId}`;
      if (input.operationId && receipts.has(receiptKey)) return receipts.get(receiptKey);
      let result;
      if (path === '/api/business/command') { commandCalls++; result = commit(key, input.commands, input.baseRevision); }
      else if (path === '/api/business/undo') result = undo(key, input);
      else if (path === '/api/business/export') return exportPortable(get(key).board, input.format);
      else {
        const match = /^\/api\/business\/proposals\/([^/]+)\/(preview|apply|reject)$/.exec(path);
        if (!match) throw new Error('NOT_FOUND: This action is outside the isolated UI demo.');
        result = match[2] === 'preview' ? preview(key, match[1]) : resolveProposal(key, match[1], match[2], input.baseRevision);
      }
      if (input.operationId) receipts.set(receiptKey, structuredClone(result as Snapshot));
      return result;
    },
    tool(key: string, input: any) {
      const args = input.arguments ?? {}, state = get(key);
      if (input.name === 'business_get_ui_state') {
        const proposalPreview = args.proposalId ? preview(key, args.proposalId) : undefined;
        const issued: Record<string, string> = {};
        const issue = (action: string, target: string) => { const token = `demo-only-${crypto.randomUUID()}`; capabilities.set(token, { key, action, target, revision: state.board.revision }); issued[action] = token; };
        if (proposalPreview) { if (!proposalPreview.stale) issue('apply', args.proposalId); issue('reject', args.proposalId); }
        if (state.lastTransactionId) issue('undo', state.lastTransactionId);
        return { content: [], _meta: { businessMap: { snapshot: state, proposalPreview, capabilities: issued, approvalAvailable: true, siteUrl: '/business' } } };
      }
      const action = ({ business_apply_proposal: 'apply', business_reject_proposal: 'reject', business_undo: 'undo' } as Record<string, string>)[input.name];
      const capability = capabilities.get(args.capability);
      if (!action || !capability || capability.key !== key || capability.action !== action || capability.target !== (args.proposalId ?? args.transactionId) || capability.revision !== state.board.revision) throw new Error('FORBIDDEN: Reopen the demo preview before confirming.');
      revision(state, args.baseRevision); capabilities.delete(args.capability);
      const next = action === 'undo' ? undo(key, args) : resolveProposal(key, args.proposalId, action, args.baseRevision);
      return { content: [{ type: 'text', text: 'Fictional demo updated.' }], structuredContent: { ok: true, revision: next.board.revision } };
    },
  };
}
