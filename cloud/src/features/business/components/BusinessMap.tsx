import { useEffect, useMemo, useRef, useState } from 'react';
import { Background, BackgroundVariant, Controls, Handle, Position, ReactFlow, ReactFlowProvider, getViewportForBounds, useReactFlow, useStore, type Node, type Edge, type NodeProps, type NodeChange } from '@xyflow/react';
import { ArrowLeft, ArrowUpRight, BookOpen, Check, ChevronRight, Circle, Compass, FlaskConical, GripVertical, Handshake, Layers3, Megaphone, Package, Plus, RotateCcw, Search, Settings2, ShieldQuestion, Sparkles, Sprout, Target, Users, Wallet, X } from 'lucide-react';
import type { Board } from '../../../business/model';
import { getChildren, getDepth, getNode, getParent, getPath, MAX_HIERARCHY_DEPTH, type HierarchyNode } from '../../../../../shared/hierarchy';
import { CARD_HEIGHT, CARD_WIDTH, readFocus, readView, reconcilePositions, saveFocus, saveView, viewKey, type MapView } from '../map-presentation';
import { useUiText } from '../ui-text';

type MapData = Record<string, unknown> & {
  title: string; kind: HierarchyNode['kind']; text?: string; count: number; hub?: boolean;
  done?: boolean; lane?: string; firstStep?: string; focus?: boolean; ghost?: boolean;
  suggestionId?: string; matchCount?: number; onOpen?: () => void; movable?: boolean;
};
const kindLabel = (kind: HierarchyNode['kind']) => kind === 'board' ? 'SEU NEGÓCIO' : kind === 'section' ? 'ÁREA DO NEGÓCIO' : 'NOTA';
/** Visual hints only: never written into the map or used to classify its data. */
function MapSymbol({ title, kind, size = 18 }: { title: string; kind: HierarchyNode['kind']; size?: number }) {
  const emoji = title.match(/\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?)*/u)?.[0];
  if (emoji) return <span className="map-symbol-emoji" aria-hidden="true">{emoji}</span>;
  const words = title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const Icon = kind === 'board' ? Sprout
    : /\b(people|customer|customers|client|clients|team|pessoas|clientes|equipe|publico)\b/.test(words) ? Users
    : /\b(partner|partners|partnerships|parcerias|parceiros|collaboration|colaboracao)\b/.test(words) ? Handshake
    : /\b(revenue|pricing|cost|costs|money|budget|receita|custos|preco|orcamento|financeiro)\b/.test(words) ? Wallet
    : /\b(research|experiment|experiments|evidence|interview|interviews|pesquisa|experimentos|evidencias|entrevistas)\b/.test(words) ? FlaskConical
    : /\b(operations|delivery|process|processes|operacoes|entrega|processos)\b/.test(words) ? Settings2
    : /\b(brand|communication|marketing|channels|marca|comunicacao|canais)\b/.test(words) ? Megaphone
    : /\b(risk|risks|uncertainty|riscos|incertezas)\b/.test(words) ? ShieldQuestion
    : /\b(learning|knowledge|aprendizado|conhecimento)\b/.test(words) ? BookOpen
    : /\b(resources|offer|product|products|value|recursos|oferta|produto|produtos|valor)\b/.test(words) ? Package
    : /\b(decision|decisions|strategy|decisoes|estrategia)\b/.test(words) ? Compass
    : kind === 'section' ? Layers3 : Circle;
  return <Icon size={size} aria-hidden="true"/>;
}
function FocusNode({ data, selected }: NodeProps<Node<MapData>>) {
  const t = useUiText();
  return <div className={`focus-node ${data.hub ? 'is-hub' : ''} ${data.kind === 'card' ? 'map-card' : ''} is-${data.kind} ${selected ? 'is-selected' : ''} ${data.ghost ? 'is-proposal' : ''} ${data.done ? 'is-done' : ''}`}>
    <Handle type="target" position={Position.Left}/>
    <div className="focus-node-top"><span className="focus-node-symbol">{data.ghost ? <Sparkles size={16}/> : data.done ? <Check size={16}/> : <MapSymbol title={data.title} kind={data.kind} size={data.hub ? 25 : 18}/>}</span>{data.focus && <Target size={13}/ >}{data.movable && <span className="focus-drag-handle nopan" title={t('Arrastar para organizar')} aria-label={t('Arrastar para organizar')}><GripVertical size={16}/></span>}</div>
    <span className="focus-node-kind">{data.ghost ? t('PROPOSTA PARA REVISAR') : t(kindLabel(data.kind))}</span>
    <h3 title={data.title}>{data.title || t('Sem título')}</h3>
    {data.text && <p>{data.text}</p>}
    <div className="focus-node-bottom"><span>{data.kind === 'card' ? data.done ? t('Concluída') : data.lane === 'now' ? t('Agora') : t('Depois') : <>{data.count} {t(data.count === 1 ? 'item' : 'itens')}</>}{!!data.matchCount && <b className="focus-match-count">{data.matchCount} {t('na busca')}</b>}</span>{!data.hub && <button className="nodrag nopan" aria-label={`${t(data.ghost ? 'Revisar' : 'Explorar')} ${data.title}`} title={t(data.ghost ? 'Revisar proposta' : 'Explorar este nível')} onClick={event => { event.stopPropagation(); data.onOpen?.(); }}><ArrowUpRight size={16}/></button>}</div>
    <Handle type="source" position={Position.Right}/>
  </div>;
}
const nodeTypes = { focus: FocusNode };
export type BusinessMapProps = {
  businessId?: string;
  board: Board; selected: string; query: string; area: string | null;
  onSelect: (id: string) => void; onAdd: (id: string) => string | void; onOpen: (id: string) => void;
  onProposal: (id: string) => void; theme: string; readOnly?: boolean;
  focusId?: string | null; onFocusChange?: (id: string | null) => void;
  onCreateArea?: (parentId?: string) => void;
};

function content(node: HierarchyNode) { return node.card ? node.card.text : node.section?.questions || ''; }
function ParentContext({ board, current, onNavigate }: { board: Board; current: HierarchyNode; onNavigate: (id: string) => void }) {
  const t = useUiText();
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const container = list.current;
    const selected = container?.querySelector<HTMLElement>('[aria-current="location"]');
    if (!container || !selected || !container.clientHeight) return;
    const top = selected.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
    const bottom = top + selected.offsetHeight;
    if (top < container.scrollTop) container.scrollTop = top;
    else if (bottom > container.scrollTop + container.clientHeight) container.scrollTop = bottom - container.clientHeight + 6;
  }, [current.id]);
  const parent = getParent(board, current.id);
  if (!parent) return null;
  const siblings = getChildren(board, parent.id);
  return <aside className="focus-context" aria-label={t('Nível anterior')}>
    <span className="eyebrow">{t('DE ONDE VOCÊ VEIO')}</span>
    <button className="context-parent" title={parent.title} aria-label={`${t('Voltar para')} ${parent.title}`} onClick={() => onNavigate(parent.id)}>
      <span className="context-symbol"><MapSymbol title={parent.title} kind={parent.kind} size={23}/></span>
      <span><strong>{parent.title}</strong><small><ArrowLeft size={12}/> {t('Voltar um nível')}</small></span>
    </button>
    <div className="context-neighbor-heading"><span>{t('Neste nível')}</span><span>{siblings.length} {t(siblings.length === 1 ? 'item' : 'itens')}</span></div>
    <ul ref={list} className="context-neighbors" aria-label={t('Elementos do nível anterior')}>
      {siblings.map(node => <li key={node.id}><button className="context-neighbor" aria-current={node.id === current.id ? 'location' : undefined} title={[node.title, content(node)].filter(Boolean).join('\n')} onClick={() => onNavigate(node.id)}>
        <span className="context-symbol"><MapSymbol title={node.title} kind={node.kind}/></span>
        <span className="context-neighbor-copy"><strong>{node.title || t('Sem título')}</strong>{node.id === current.id && <small><span className="live-dot"/>{t('Você está aqui')}</small>}</span>
        <ChevronRight size={13}/>
      </button></li>)}
    </ul>
    <select className="context-picker" aria-label={t('Navegar no nível anterior')} value={current.id} onChange={event => onNavigate(event.target.value)}>
      {siblings.map(node => <option key={node.id} value={node.id}>{node.title || t('Sem título')}</option>)}
    </select>
  </aside>;
}
function MapInner(props: BusinessMapProps) {
  const { board, selected, query, area, onSelect, onAdd, onOpen, onProposal, theme, readOnly, focusId, onFocusChange, onCreateArea } = props;
  const t = useUiText();
  const businessId = props.businessId || board.boardId;
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 761px) and (pointer: fine)');
    const update = () => setDesktop(media.matches);
    update(); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const canDrag = !readOnly && desktop;
  const [localFocus, setLocalFocus] = useState<string | null>(area);
  const externalFocus = focusId !== undefined ? focusId : area;
  useEffect(() => { setLocalFocus(externalFocus); }, [externalFocus]);
  const requestedFocus = focusId !== undefined ? focusId : localFocus;
  const previousPath = useRef<string[]>([]);
  useEffect(() => {
    if (readOnly) return;
    const saved = readFocus(businessId, board.boardId);
    if (!requestedFocus && saved && getNode(board, saved)) {
      setLocalFocus(saved); onFocusChange?.(saved);
    }
    // Only resume when this business is mounted, not when navigating to its root.
  }, [businessId, board.boardId]);
  const current = getNode(board, requestedFocus || board.boardId) || getNode(board, board.boardId)!;
  useEffect(() => {
    if (requestedFocus && !getNode(board, requestedFocus)) {
      const surviving = [...previousPath.current].reverse().find(id => getNode(board, id)) || board.boardId;
      const next = surviving === board.boardId ? null : surviving;
      if (!readOnly) saveFocus(businessId, board.boardId, next);
      setLocalFocus(next); onFocusChange?.(next);
    } else previousPath.current = getPath(board, current.id).map(node => node.id);
  }, [board, requestedFocus, current.id, onFocusChange]);
  const path = getPath(board, current.id), depth = getDepth(board, current.id) || 1;
  const children = getChildren(board, current.id);
  const navigate = (id: string, notifyOpen = false) => {
    const next = id === board.boardId ? null : id;
    if (!readOnly) saveFocus(businessId, board.boardId, next);
    setLocalFocus(next); onFocusChange?.(next);
    if (notifyOpen) onOpen(id);
  };
  const normalized = query.trim().toLocaleLowerCase();
  const allNodes = [getNode(board, board.boardId)!, ...board.sections.flatMap(section => [getNode(board, section.id)!, ...section.cards.map(card => getNode(board, card.id)!)])];
  const matches = normalized ? allNodes.filter(node => `${node.title} ${content(node)} ${node.card?.firstStep || ''}`.toLocaleLowerCase().includes(normalized)) : [];
  const branchMatches = new Map<string, number>();
  matches.forEach(match => getPath(board, match.id).forEach(ancestor => branchMatches.set(ancestor.id, (branchMatches.get(ancestor.id) || 0) + 1)));
  const ghosts = board.suggestions.filter(suggestion => suggestion.status === 'pending' && suggestion.mapDraft).flatMap(suggestion => suggestion.mapDraft!.sections.filter(section => (section.parentId || board.boardId) === current.id && !getNode(board, section.id)).map(section => ({ id: `ghost:${suggestion.id}:${section.id}`, title: section.title, count: section.cards.length, suggestionId: suggestion.id })));
  const viewSignature = viewKey(businessId, board.boardId, current.id);
  const flow = useReactFlow();
  const canvas = useRef<HTMLDivElement>(null);
  const composerElement = useRef<HTMLDivElement>(null);
  const [composer, setComposer] = useState<{ x: number; y: number; point: { x: number; y: number } } | null>(null);
  const [noteArea, setNoteArea] = useState('');
  const placements = useRef(new Map<string, { focus: string; point: { x: number; y: number } }>());
  useEffect(() => { setComposer(null); }, [viewSignature]);
  useEffect(() => { if (composer) composerElement.current?.focus(); }, [composer]);
  const width = useStore(state => state.width), height = useStore(state => state.height);
  const fittedSignature = useRef<string | null>(null);
  const views = useRef(new Map<string, MapView>());
  const [, redraw] = useState(0);
  const [resetVersion, setResetVersion] = useState(0);
  const count = children.length + ghosts.length;
  const ids = [...children.map(child => child.id), ...ghosts.map(ghost => ghost.id)];
  const idsSignature = JSON.stringify(ids);
  if (!views.current.has(viewSignature)) views.current.set(viewSignature, readOnly ? { positions: {} } : readView(viewSignature));
  const view = views.current.get(viewSignature)!;
  const positions = useMemo(() => {
    const saved = { ...view.positions };
    for (const id of ids) {
      const placement = placements.current.get(id);
      if (placement?.focus === viewSignature && !saved[id]) saved[id] = placement.point;
    }
    return reconcilePositions(ids, saved);
  }, [viewSignature, idsSignature, view.positions]);
  view.positions = positions;
  useEffect(() => {
    if (!readOnly) saveView(viewSignature, view);
    ids.forEach(id => placements.current.delete(id));
  }, [viewSignature, idsSignature, readOnly]);
  const movableIds = new Set(children.map(child => child.id));
  const changeNodes = (changes: NodeChange[]) => {
    if (!canDrag) return;
    let changed = false, finished = false;
    const next = { ...view.positions };
    for (const change of changes) {
      if (change.type !== 'position' || !change.position || !movableIds.has(change.id)) continue;
      next[change.id] = change.position; changed = true;
      if (!change.dragging) finished = true;
    }
    if (changed) {
      view.positions = next;
      redraw(value => value + 1);
      if (finished) saveView(viewSignature, view);
    }
  };
  const restoreLayout = () => {
    placements.current.clear();
    view.positions = reconcilePositions(ids, Object.fromEntries(ghosts.map(ghost => [ghost.id, view.positions[ghost.id]])));
    delete view.viewport;
    saveView(viewSignature, view);
    fittedSignature.current = null;
    setResetVersion(value => value + 1);
  };
  const noteAreas = board.sections.filter(section => (getDepth(board, section.id) || 2) < MAX_HIERARCHY_DEPTH);
  const openComposer = (event: React.MouseEvent) => {
    if (readOnly) { onSelect(current.id); return; }
    const bounds = canvas.current?.getBoundingClientRect();
    if (!bounds) return;
    setNoteArea(current.kind === 'section' && depth < MAX_HIERARCHY_DEPTH ? current.id : '');
    setComposer({ x: Math.max(8, Math.min(event.clientX - bounds.left, bounds.width - 252)), y: Math.max(8, Math.min(event.clientY - bounds.top, bounds.height - 240)), point: flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }) });
  };
  const createNote = () => {
    if (!noteArea || !composer) return;
    placements.current.clear();
    const id = onAdd(noteArea);
    if (id && noteArea === current.id) placements.current.set(id, { focus: viewSignature, point: { x: composer.point.x - CARD_WIDTH / 2, y: composer.point.y - CARD_HEIGHT / 2 } });
    if (noteArea !== current.id) navigate(noteArea);
    setComposer(null);
  };
  const nodes: Node<MapData>[] = [{ id: current.id, type: 'focus', position: { x: -108, y: -108 }, style: { width: 216, height: 216 }, data: { title: current.title, kind: current.kind, text: current.kind === 'card' ? content(current) : undefined, count: children.length, hub: true, done: current.card?.done, lane: current.card?.lane, focus: board.focus.cardIds.includes(current.id) }, draggable: false, selected: current.id === selected }];
  children.forEach((child) => nodes.push({ id: child.id, type: 'focus', position: positions[child.id], style: { width: CARD_WIDTH, height: CARD_HEIGHT }, dragHandle: '.focus-drag-handle', className: normalized && !branchMatches.has(child.id) ? 'search-dim' : undefined, data: { movable: canDrag, title: child.title, kind: child.kind, text: content(child), count: getChildren(board, child.id).length, done: child.card?.done, lane: child.card?.lane, firstStep: child.card?.firstStep, focus: board.focus.cardIds.includes(child.id), matchCount: branchMatches.get(child.id), onOpen: () => navigate(child.id, true) }, draggable: canDrag, selected: child.id === selected }));
  ghosts.forEach((ghost) => nodes.push({ id: ghost.id, type: 'focus', position: positions[ghost.id], style: { width: CARD_WIDTH, height: CARD_HEIGHT }, data: { ...ghost, kind: 'section', ghost: true, onOpen: () => onProposal(ghost.suggestionId) }, draggable: false }));
  const edges: Edge[] = nodes.slice(1).map(node => ({ id: `branch:${node.id}`, source: current.id, target: node.id, type: 'straight', className: 'focus-branch', style: { stroke: 'var(--edge)', strokeWidth: 1, ...(node.data.ghost ? { strokeDasharray: '5 5' } : {}) } }));
  const visibleIds = new Set(nodes.map(node => node.id));
  board.relations?.filter(relation => visibleIds.has(relation.fromId) && visibleIds.has(relation.toId)).forEach(relation => edges.push({ id: relation.id, source: relation.fromId, target: relation.toId, type: 'smoothstep', label: relation.label, className: 'focus-relation', style: { stroke: 'var(--sage)', strokeWidth: 1.2, strokeDasharray: '4 4' }, labelStyle: { fill: 'var(--sage-ink)', fontSize: 10 }, labelBgStyle: { fill: 'var(--paper)' }, labelBgPadding: [6, 4] }));
  useEffect(() => {
    if (!width || !height) return;
    const crossingBreakpoint = !readOnly && view.canvas && view.canvas.narrow !== !desktop;
    if (fittedSignature.current === viewSignature && !crossingBreakpoint) return;
    const timer = window.setTimeout(() => {
      fittedSignature.current = viewSignature;
      if (view.viewport) {
        const oldCanvas = view.canvas;
        const viewport = !readOnly && oldCanvas && oldCanvas.narrow !== !desktop
          ? { ...view.viewport, x: view.viewport.x + (width - oldCanvas.width) / 2, y: view.viewport.y + (height - oldCanvas.height) / 2 }
          : view.viewport;
        void flow.setViewport(viewport);
      }
      else {
        const fitted = getViewportForBounds(flow.getNodesBounds(nodes), width, height, .15, count ? 1.1 : 1, .12);
        const readableZoom = Math.min(desktop ? readOnly ? .65 : .75 : .45,
          height / (580 + CARD_HEIGHT) * .88, width / (760 + CARD_WIDTH) * .88);
        // Dense maps open around their center at a readable scale. Fit all remains explicit.
        if (fitted.zoom < readableZoom) void flow.setCenter(0, 0, { zoom: readableZoom });
        else void flow.setViewport(fitted);
      }
      view.canvas = { width, height, narrow: !desktop };
    }, 60);
    return () => window.clearTimeout(timer);
    // Node text, polling, inspector changes and host resizing preserve the viewport.
  }, [viewSignature, width, height, flow, resetVersion, desktop]);
  return <div className={`focus-map ${current.kind === 'board' ? 'at-root' : 'in-branch'}`} onKeyDownCapture={event => {
    if (event.key === 'Escape' && composer) { event.preventDefault(); setComposer(null); return; }
    const target = event.target as HTMLElement;
    if (event.key !== 'Enter' || !target.classList.contains('react-flow__node')) return;
    const node = nodes.find(item => item.id === target.dataset.id);
    if (!node) return;
    event.preventDefault();
    if (node.data.ghost) onProposal(node.data.suggestionId as string);
    else if (event.shiftKey) navigate(node.id, true);
    else onSelect(node.id);
  }}>
    <div className="focus-map-top"><nav className="focus-breadcrumb" aria-label={t('Caminho no mapa')}>{path.map((node, index) => <span key={node.id}>{index > 0 && <ChevronRight size={11}/>}<button aria-current={index === path.length - 1 ? 'location' : undefined} onClick={() => navigate(node.id)} title={node.title}>{index === 0 && <Sprout size={13}/>}<span>{node.title}</span></button></span>)}</nav><div className="focus-map-actions"><button className="focus-fit" onClick={() => void flow.fitView({ padding: .12, maxZoom: 1.1 })}>{t("Enquadrar mapa")}</button>{!readOnly && <button className="focus-reset" title={t('Restaurar disposição do nível atual')} onClick={restoreLayout}><RotateCcw size={13}/>{t('Reorganizar mapa')}</button>}</div><span className="focus-level">{t('NÍVEL')} {depth} <span>/ {MAX_HIERARCHY_DEPTH}</span></span></div>
    <div className="focus-map-body"><ParentContext board={board} current={current} onNavigate={id => navigate(id)}/><div ref={canvas} className="focus-map-canvas">
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodeClick={(_, node) => { setComposer(null); node.data.ghost ? onProposal(node.data.suggestionId as string) : onSelect(node.id); }} onNodeDoubleClick={(_, node) => !node.data.ghost && navigate(node.id, true)} onPaneClick={openComposer} onMoveStart={() => setComposer(null)} minZoom={.15} maxZoom={1.8} nodesDraggable={canDrag} nodeDragThreshold={6} onNodesChange={changeNodes}
        onNodeDragStop={(_, node) => { if (canDrag && movableIds.has(node.id)) { view.positions = { ...view.positions, [node.id]: node.position }; saveView(viewSignature, view); redraw(value => value + 1); } }}
        onMoveEnd={(_, viewport) => { if (fittedSignature.current === viewSignature) { view.viewport = viewport; view.canvas = { width, height, narrow: !desktop }; if (!readOnly) saveView(viewSignature, view); } }}
        panOnDrag={desktop} zoomOnScroll={desktop} zoomOnPinch={desktop} preventScrolling={false} nodesConnectable={false} deleteKeyCode={null} zoomOnDoubleClick={false} colorMode={theme === 'dark' ? 'dark' : 'light'} proOptions={{ hideAttribution: true }}>
        <Background variant={BackgroundVariant.Dots} gap={23} size={.7} color="var(--dot)"/><Controls showInteractive={false}/>
      </ReactFlow>
      {composer && <div ref={composerElement} tabIndex={-1} role="dialog" aria-label={t('Criar no mapa')} className="map-create-menu" style={{ left: composer.x, top: composer.y }}>
        <div><strong>{t('Criar no mapa')}</strong><button className="icon-button" aria-label={t('Fechar')} onClick={() => setComposer(null)}><X size={15}/></button></div>
        <p>{t('A ideia só entra no mapa quando você salvar.')}</p>
        {current.kind !== 'section' || depth >= MAX_HIERARCHY_DEPTH ? <label className="field"><span>{t('Área da nova nota')}</span><select value={noteArea} onChange={event => setNoteArea(event.target.value)}><option value="">{t('Escolha uma área')}</option>{noteAreas.map(section => <option key={section.id} value={section.id}>{section.title}</option>)}</select></label> : null}
        <button className="secondary full" disabled={!noteArea} onClick={createNote}><Plus size={14}/>{t('Nova nota')}</button>
        {depth < MAX_HIERARCHY_DEPTH && onCreateArea && <button className="text-button" onClick={() => { setComposer(null); onCreateArea(current.kind === 'board' ? undefined : current.id); }}><Layers3 size={14}/>{t(current.kind === 'board' ? 'Nova área' : 'Subárea')}</button>}
      </div>}
      {normalized && <section className="focus-search-results" aria-label={t('Resultados da busca')}><div><Search size={12}/><strong>{matches.length ? <>{matches.length} {t(matches.length === 1 ? 'resultado no mapa' : 'resultados no mapa')}</> : t('Nenhum resultado no mapa')}</strong></div>{matches.slice(0, 6).map(match => <button key={match.id} onClick={() => { navigate(getParent(board, match.id)?.id || board.boardId); onSelect(match.id); }}><span>{match.title}</span><small>{getPath(board, match.id).slice(0, -1).map(node => node.title).join(' / ') || t('Seu negócio')}</small><ArrowUpRight size={12}/></button>)}{matches.length > 6 && <p>{t('Refine a busca para encontrar os outros')} {matches.length - 6} {t('itens.')}</p>}{!matches.length && <p>{t('Tente outra palavra. A busca percorre todos os níveis.')}</p>}</section>}
      {!count && <div className="focus-empty-level"><span>{t(depth >= MAX_HIERARCHY_DEPTH ? 'Você chegou ao último nível.' : 'Uma ideia pode abrir novos caminhos.')}</span>{!readOnly && depth < MAX_HIERARCHY_DEPTH && onCreateArea && <button onClick={() => onCreateArea(current.kind === 'board' ? undefined : current.id)}><Plus size={12}/> {t('Criar uma área aqui')}</button>}</div>}
    </div></div>
    <div className="focus-map-bottom"><span className="focus-instruction">{t(readOnly ? 'Clique para ver detalhes' : 'Clique no fundo para criar')} <span>·</span> {t(canDrag ? 'Arraste a alça para organizar' : 'Abra a seta para explorar')}</span><div>{!readOnly && current.kind === 'section' && depth < MAX_HIERARCHY_DEPTH && <button className="focus-add-note" onClick={() => onAdd(current.id)}><Plus size={13}/> {t('Nova nota')}</button>}{!readOnly && onCreateArea && depth < MAX_HIERARCHY_DEPTH && <button className="focus-add-area" onClick={() => onCreateArea(current.kind === 'board' ? undefined : current.id)}><Plus size={13}/> {t(current.kind === 'board' ? 'Nova área' : 'Subárea')}</button>}</div></div>
  </div>;
}
export function BusinessMap(props: BusinessMapProps) { return <ReactFlowProvider><MapInner {...props}/></ReactFlowProvider>; }
