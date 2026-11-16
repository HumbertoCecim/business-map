import type { Board } from '../../../business/model';

const labels: Record<string, string> = {
  title: 'Nome do negócio', sections: 'Áreas do negócio', cards: 'Notas', questions: 'Perguntas e contexto',
  memories: 'Memórias e decisões', focus: 'Foco atual', cardIds: 'Notas em foco', visible: 'Mostrar foco no mapa', limit: 'Limite de notas',
  whereStopped: 'Onde parei', relations: 'Conexões', sources: 'Fontes', text: 'Conteúdo', rationale: 'Motivo',
  firstStep: 'Primeiro passo', lane: 'Quando', done: 'Concluída', important: 'Importante', urgent: 'Urgente',
  semanticType: 'Tipo de nota', sourceIds: 'Fontes vinculadas', label: 'Nome', kind: 'Tipo', url: 'Endereço da fonte',
  fromId: 'De', toId: 'Para', target: 'Relacionado a', createdAt: 'Registrado em', skills: 'Skills',
  selectedSkillVersionIds: 'Skills selecionadas', name: 'Nome', description: 'Descrição', skillText: 'Conteúdo da skill',
  sessions: 'Conversas registradas', objective: 'Objetivo', summary: 'Resumo', startedAt: 'Início', closedAt: 'Encerramento',
  status: 'Situação', agent: 'Assistente', skillsIds: 'Skills selecionadas', endOfConversation: 'Conversa encerrada',
  structure: 'Estrutura', sourceUrl: 'Origem', versionIds: 'Versões selecionadas',
};
const technicalFields = new Set(['id', 'boardId', 'schemaVersion', 'revision', 'sourceSuggestionId', 'receipts', 'treeHash', 'skillId', 'parentVersionId', 'originalVersionId', 'currentSessionId', 'requestId']);
const references = new Set(['cardIds', 'sourceIds', 'selectedSkillVersionIds', 'versionIds', 'fromId', 'toId']);
export function canonicalLabel(path: string) {
  const field = path.split('/').filter(Boolean).at(-1) || '';
  return labels[field] || (field ? field.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ').replace(/^./, letter => letter.toUpperCase()) : 'Mapa do negócio');
}
function reference(value: string, board: Board) {
  if (value === board.boardId) return board.title;
  return board.sections.find(item => item.id === value)?.title
    || board.sections.flatMap(item => item.cards).find(item => item.id === value)?.title
    || board.sources?.find(item => item.id === value)?.label
    || board.skills.find(item => item.id === value)?.name
    || board.memories.find(item => item.id === value)?.text
    || value;
}
function friendlyText(value: string, field: string) {
  if (field === 'lane') return { now: 'Agora', later: 'Depois' }[value] || value;
  if (field === 'kind') return { context: 'Contexto', decision: 'Decisão', founder_statement: 'Relato do fundador', github_issue: 'Registro de problema', log_excerpt: 'Trecho de registro', url: 'Link', note: 'Nota', board: 'Negócio', section: 'Área', card: 'Nota' }[value] || value;
  if (field === 'status') return { pending: 'Em revisão', applied: 'Confirmada', rejected: 'Rejeitada', active: 'Em andamento', closed: 'Encerrada', closing: 'Em encerramento' }[value] || value;
  if (['createdAt', 'startedAt', 'closedAt'].includes(field) && !Number.isNaN(Date.parse(value))) return new Date(value).toLocaleString('pt-BR');
  return value;
}
/** Human-readable presentation of canonical server values. Exact data remains in technical details. */
export function CanonicalValue({ value, board, field = '' }: { value: unknown; board: Board; field?: string }) {
  if (value === undefined || value === null || value === '') return <p className="canonical-empty">Não preenchido</p>;
  if (typeof value === 'boolean') return <p className="canonical-text">{value ? 'Sim' : 'Não'}</p>;
  if (typeof value === 'number') return <p className="canonical-text">{value}</p>;
  if (typeof value === 'string') return <p className="canonical-text">{references.has(field) ? reference(value, board) : friendlyText(value, field)}</p>;
  if (Array.isArray(value)) return value.length ? <div className="canonical-items">{value.map((item, index) => <div className="canonical-item" key={item && typeof item === 'object' && 'id' in item ? String(item.id) : index}><CanonicalValue value={item} board={board} field={field}/></div>)}</div> : <p className="canonical-empty">Nenhum item</p>;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.id === 'string' && ['board', 'section', 'card'].includes(String(record.kind))) return <p className="canonical-text">{reference(record.id, board)}</p>;
    const titleKey = typeof record.title === 'string' ? 'title' : typeof record.label === 'string' ? 'label' : typeof record.name === 'string' ? 'name' : '';
    const entries = Object.entries(record).filter(([key]) => !technicalFields.has(key) && key !== titleKey);
    return <div className="canonical-record">{titleKey && <h4>{String(record[titleKey]) || 'Sem nome'}</h4>}<dl>{entries.map(([key, item]) => <div className="canonical-field" key={key}><dt>{key === 'title' ? 'Título' : canonicalLabel(key)}</dt><dd><CanonicalValue value={item} board={board} field={key}/></dd></div>)}</dl>{!titleKey && !entries.length && <p className="canonical-empty">Informações de identificação disponíveis nos detalhes técnicos.</p>}</div>;
  }
  return <p className="canonical-text">{String(value)}</p>;
}
