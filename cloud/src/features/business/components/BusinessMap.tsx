import { useEffect, useMemo, useRef, useState } from 'react';
import { Background, BackgroundVariant, Controls, Handle, Position, ReactFlow, ReactFlowProvider, useReactFlow, useStore, type Node, type Edge, type NodeProps } from '@xyflow/react';
import { ArrowLeft, ArrowUpRight, Check, ChevronRight, Circle, Layers3, Plus, Search, Sparkles, Sprout, Target } from 'lucide-react';
import type { Board } from '../../../business/model';
import { getChildren, getDepth, getNode, getParent, getPath, MAX_HIERARCHY_DEPTH, type HierarchyNode } from '../../../../../shared/hierarchy';

type MapData = Record<string, unknown> & {
  title: string; kind: HierarchyNode['kind']; text?: string; count: number; hub?: boolean;
  done?: boolean; lane?: string; firstStep?: string; focus?: boolean; ghost?: boolean;
  suggestionId?: string; matchCount?: number; onOpen?: () => void;
};
const kindLabel = (kind: HierarchyNode['kind']) => kind === 'board' ? 'SEU NEGÓCIO' : kind === 'section' ? 'ÁREA DO NEGÓCIO' : 'NOTA';
function FocusNode({ data, selected }: NodeProps<Node<MapData>>) {
  return <div className={`focus-node ${data.hub ? 'is-hub' : ''} ${data.kind === 'card' ? 'map-card' : ''} is-${data.kind} ${selected ? 'is-selected' : ''} ${data.ghost ? 'is-proposal' : ''} ${data.done ? 'is-done' : ''}`}>
    <Handle type="target" position={Position.Left}/>
    <div className="focus-node-top"><span className="focus-node-symbol">{data.ghost ? <Sparkles size={16}/> : data.kind === 'board' ? <Sprout size={27}/> : data.kind === 'section' ? <Layers3 size={16}/> : data.done ? <Check size={16}/> : <Circle size={15}/>}</span>{data.focus && <Target size={13}/>}</div>
    <span className="focus-node-kind">{data.ghost ? 'PROPOSTA PARA REVISAR' : kindLabel(data.kind)}</span>
    <h3>{data.title || 'Sem título'}</h3>
    {data.text && <p>{data.text}</p>}
    <div className="focus-node-bottom"><span>{data.kind === 'card' ? data.done ? 'Concluída' : data.lane === 'now' ? 'Agora' : 'Depois' : `${data.count} ${data.count === 1 ? 'item' : 'itens'}`}{!!data.matchCount && <b className="focus-match-count">{data.matchCount} na busca</b>}</span>{!data.hub && <button className="nodrag nopan" aria-label={data.ghost ? `Revisar ${data.title}` : `Explorar ${data.title}`} title={data.ghost ? 'Revisar proposta' : 'Explorar este nível'} onClick={event => { event.stopPropagation(); data.onOpen?.(); }}><ArrowUpRight size={16}/></button>}</div>
    <Handle type="source" position={Position.Right}/>
  </div>;
}
const nodeTypes = { focus: FocusNode };
export type BusinessMapProps = {
  board: Board; selected: string; query: string; area: string | null;
  onSelect: (id: string) => void; onAdd: (id: string) => void; onOpen: (id: string) => void;
  onProposal: (id: string) => void; theme: string; readOnly?: boolean;
  focusId?: string | null; onFocusChange?: (id: string | null) => void;
  onCreateArea?: (parentId?: string) => void;
};

function content(node: HierarchyNode) { return node.card ? node.card.text : node.section?.questions || ''; }
function ParentContext({ board, current, onNavigate }: { board: Board; current: HierarchyNode; onNavigate: (id: string) => void }) {
  const parent = getParent(board, current.id);
  if (!parent) return null;
  const siblings = getChildren(board, parent.id), preview = siblings.slice(0, 8);
  return <aside className="focus-context" aria-label="Nível anterior">
    <span className="eyebrow">DE ONDE VOCÊ VEIO</span>
    <button className="focus-context-map" aria-label={`Voltar para ${parent.title}`} onClick={() => onNavigate(parent.id)}>
      <svg viewBox="0 0 160 142" aria-hidden="true"><circle className="context-ring" cx="80" cy="70" r="48"/>{preview.map((node, index) => {
        const angle = [-90, 90, 0, 180, -45, 135, 45, 225][index] * Math.PI / 180, x = 80 + Math.cos(angle) * 50, y = 70 + Math.sin(angle) * 46;
        return <g key={node.id}><line x1="80" y1="70" x2={x} y2={y}/><rect x={x - 11} y={y - 8} width="22" height="16" rx="5" className={node.id === current.id ? 'context-current' : ''}/></g>;
      })}<circle className="context-center" cx="80" cy="70" r="19"/><path d="M74 74h12M80 68v12M80 68c-1-8 8-9 8-9s1 8-8 9M80 68c1-7-7-8-7-8s-1 7 7 8"/></svg>
      <strong>{parent.title}</strong><span><ArrowLeft size={12}/> Voltar um nível</span>
    </button>
    <div className="context-position"><span className="live-dot"/> Você está em <strong>{current.title}</strong></div>
  </aside>;
}
function MapInner(props: BusinessMapProps) {
  const { board, selected, query, area, onSelect, onAdd, onOpen, onProposal, theme, readOnly, focusId, onFocusChange, onCreateArea } = props;
  const [localFocus, setLocalFocus] = useState<string | null>(area);
  const externalFocus = focusId !== undefined ? focusId : area;
  useEffect(() => { setLocalFocus(externalFocus); }, [externalFocus]);
  const requestedFocus = focusId !== undefined ? focusId : localFocus;
  const previousPath = useRef<string[]>([]);
  const current = getNode(board, requestedFocus || board.boardId) || getNode(board, board.boardId)!;
  useEffect(() => {
    if (requestedFocus && !getNode(board, requestedFocus)) {
      const surviving = [...previousPath.current].reverse().find(id => getNode(board, id)) || board.boardId;
      const next = surviving === board.boardId ? null : surviving;
      setLocalFocus(next); onFocusChange?.(next);
    } else previousPath.current = getPath(board, current.id).map(node => node.id);
  }, [board, requestedFocus, current.id, onFocusChange]);
  const path = getPath(board, current.id), depth = getDepth(board, current.id) || 1;
  const children = getChildren(board, current.id);
  const navigate = (id: string, notifyOpen = false) => {
    const next = id === board.boardId ? null : id;
    setLocalFocus(next); onFocusChange?.(next);
    if (notifyOpen) onOpen(id);
  };
  const normalized = query.trim().toLocaleLowerCase();
  const allNodes = [getNode(board, board.boardId)!, ...board.sections.flatMap(section => [getNode(board, section.id)!, ...section.cards.map(card => getNode(board, card.id)!)])];
  const matches = normalized ? allNodes.filter(node => `${node.title} ${content(node)} ${node.card?.firstStep || ''}`.toLocaleLowerCase().includes(normalized)) : [];
  const branchMatches = new Map<string, number>();
  matches.forEach(match => getPath(board, match.id).forEach(ancestor => branchMatches.set(ancestor.id, (branchMatches.get(ancestor.id) || 0) + 1)));
  const ghosts = board.suggestions.filter(suggestion => suggestion.status === 'pending' && suggestion.mapDraft).flatMap(suggestion => suggestion.mapDraft!.sections.filter(section => (section.parentId || board.boardId) === current.id && !getNode(board, section.id)).map(section => ({ id: `ghost:${suggestion.id}:${section.id}`, title: section.title, count: section.cards.length, suggestionId: suggestion.id })));
  const viewSignature = `${board.boardId}:${current.id}`;
  const flow = useReactFlow();
  const width = useStore(state => state.width), height = useStore(state => state.height);
  const fittedSignature = useRef<string | null>(null);
  const count = children.length + ghosts.length;
  const slots = useMemo(() => {
    // Fixed slots keep existing ideas still when another item is added to this level.
    const positions: { x: number; y: number }[] = [];
    for (let index = 0; index < count; index++) {
      const ring = Math.floor(index / 8), ringStart = ring * 8;
      const angle = [-90, 90, 0, 180, -45, 135, 45, 225][index - ringStart] * Math.PI / 180;
      positions.push({ x: Math.cos(angle) * (310 + ring * 245) - 94, y: Math.sin(angle) * (225 + ring * 195) - 68 });
    }
    return positions;
  }, [count]);
  const nodes: Node<MapData>[] = [{ id: current.id, type: 'focus', position: { x: -108, y: -108 }, style: { width: 216, height: 216 }, data: { title: current.title, kind: current.kind, text: current.kind === 'card' ? content(current) : undefined, count: children.length, hub: true, done: current.card?.done, lane: current.card?.lane, focus: board.focus.cardIds.includes(current.id) }, draggable: false, selected: current.id === selected }];
  children.forEach((child, index) => nodes.push({ id: child.id, type: 'focus', position: slots[index], style: { width: 188, height: 136 }, className: normalized && !branchMatches.has(child.id) ? 'search-dim' : undefined, data: { title: child.title, kind: child.kind, text: content(child), count: getChildren(board, child.id).length, done: child.card?.done, lane: child.card?.lane, firstStep: child.card?.firstStep, focus: board.focus.cardIds.includes(child.id), matchCount: branchMatches.get(child.id), onOpen: () => navigate(child.id, true) }, draggable: false, selected: child.id === selected }));
  ghosts.forEach((ghost, index) => nodes.push({ id: ghost.id, type: 'focus', position: slots[children.length + index], style: { width: 188, height: 136 }, data: { ...ghost, kind: 'section', ghost: true, onOpen: () => onProposal(ghost.suggestionId) }, draggable: false }));
  const edges: Edge[] = nodes.slice(1).map(node => ({ id: `branch:${node.id}`, source: current.id, target: node.id, type: 'straight', className: 'focus-branch', style: { stroke: 'var(--edge)', strokeWidth: 1, ...(node.data.ghost ? { strokeDasharray: '5 5' } : {}) } }));
  const visibleIds = new Set(nodes.map(node => node.id));
  board.relations?.filter(relation => visibleIds.has(relation.fromId) && visibleIds.has(relation.toId)).forEach(relation => edges.push({ id: relation.id, source: relation.fromId, target: relation.toId, type: 'smoothstep', label: relation.label, className: 'focus-relation', style: { stroke: 'var(--sage)', strokeWidth: 1.2, strokeDasharray: '4 4' }, labelStyle: { fill: 'var(--sage-ink)', fontSize: 10 }, labelBgStyle: { fill: 'var(--paper)' }, labelBgPadding: [6, 4] }));
  useEffect(() => {
    if (!width || !height || fittedSignature.current === viewSignature) return;
    const timer = window.setTimeout(() => {
      fittedSignature.current = viewSignature;
      void flow.fitView({ padding: .16, maxZoom: count ? 1.1 : 1, duration: 280 });
    }, 60);
    return () => window.clearTimeout(timer);
    // Node text, polling, inspector changes and host resizing preserve the viewport.
  }, [viewSignature, width, height, flow, count]);
  return <div className={`focus-map ${current.kind === 'board' ? 'at-root' : 'in-branch'}`}>
    <div className="focus-map-top"><nav className="focus-breadcrumb" aria-label="Caminho no mapa">{path.map((node, index) => <span key={node.id}>{index > 0 && <ChevronRight size={11}/>}<button aria-current={index === path.length - 1 ? 'location' : undefined} onClick={() => navigate(node.id)} title={node.title}>{index === 0 && <Sprout size={13}/>}<span>{node.title}</span></button></span>)}</nav><span className="focus-level">NÍVEL {depth} <span>/ {MAX_HIERARCHY_DEPTH}</span></span></div>
    <div className="focus-map-body"><ParentContext board={board} current={current} onNavigate={id => navigate(id)}/><div className="focus-map-canvas">
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodeClick={(_, node) => node.data.ghost ? onProposal(node.data.suggestionId as string) : onSelect(node.id)} onNodeDoubleClick={(_, node) => !node.data.ghost && navigate(node.id, true)} onPaneClick={() => onSelect(current.id)} minZoom={.15} maxZoom={1.8} nodesDraggable={false} nodesConnectable={false} deleteKeyCode={null} zoomOnDoubleClick={false} colorMode={theme === 'dark' ? 'dark' : 'light'} proOptions={{ hideAttribution: true }}>
        <Background variant={BackgroundVariant.Dots} gap={23} size={.7} color="var(--dot)"/><Controls showInteractive={false}/>
      </ReactFlow>
      {normalized && <section className="focus-search-results" aria-label="Resultados da busca"><div><Search size={12}/><strong>{matches.length ? `${matches.length} ${matches.length === 1 ? 'resultado no mapa' : 'resultados no mapa'}` : 'Nenhum resultado no mapa'}</strong></div>{matches.slice(0, 6).map(match => <button key={match.id} onClick={() => { navigate(getParent(board, match.id)?.id || board.boardId); onSelect(match.id); }}><span>{match.title}</span><small>{getPath(board, match.id).slice(0, -1).map(node => node.title).join(' / ') || 'Seu negócio'}</small><ArrowUpRight size={12}/></button>)}{matches.length > 6 && <p>Refine a busca para encontrar os outros {matches.length - 6} itens.</p>}{!matches.length && <p>Tente outra palavra. A busca percorre todos os níveis.</p>}</section>}
      {!count && <div className="focus-empty-level"><span>{depth >= MAX_HIERARCHY_DEPTH ? 'Você chegou ao último nível.' : 'Uma ideia pode abrir novos caminhos.'}</span>{!readOnly && depth < MAX_HIERARCHY_DEPTH && onCreateArea && <button onClick={() => onCreateArea(current.kind === 'board' ? undefined : current.id)}><Plus size={12}/> Criar uma área aqui</button>}</div>}
    </div></div>
    <div className="focus-map-bottom"><span className="focus-instruction">Clique para ver detalhes <span>·</span> Abra a seta para explorar</span><div>{!readOnly && current.kind === 'section' && depth < MAX_HIERARCHY_DEPTH && <button className="focus-add-note" onClick={() => onAdd(current.id)}><Plus size={13}/> Nova nota</button>}{!readOnly && onCreateArea && depth < MAX_HIERARCHY_DEPTH && <button className="focus-add-area" onClick={() => onCreateArea(current.kind === 'board' ? undefined : current.id)}><Plus size={13}/> {current.kind === 'board' ? 'Nova área' : 'Subárea'}</button>}</div></div>
  </div>;
}
export function BusinessMap(props: BusinessMapProps) { return <ReactFlowProvider><MapInner {...props}/></ReactFlowProvider>; }
