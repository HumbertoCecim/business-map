import { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@modelcontextprotocol/ext-apps';
import { BookOpen, ChevronLeft, Maximize2, RefreshCw, Search, Sparkles, Undo2, X } from 'lucide-react';
import { BusinessMap } from '../src/features/business/components/BusinessMap';
import { ProposalReview } from '../src/features/business/components/ProposalReview';
import type { Snapshot } from '../src/features/business/api';
import { getChildren, getNode } from '../../shared/hierarchy';
import { createWidgetTransport } from './transport';
import { bindWidgetSizing, WIDGET_VERSION } from './sizing';
import '@xyflow/react/dist/style.css';
import '../src/features/business/business.css';
import './widget.css';

const app = new App({ name: 'GrowYourPlan', version: WIDGET_VERSION }, { availableDisplayModes: ['inline', 'fullscreen'] }, { autoResize: false });
const transport = createWidgetTransport(app);
function Widget() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [theme, setTheme] = useState('light'), [fullscreen, setFullscreen] = useState(false), [canFullscreen, setCanFullscreen] = useState(false);
  const [approvalAvailable, setApprovalAvailable] = useState(false);
  const [query, setQuery] = useState(''), [selected, setSelected] = useState(''), [area, setArea] = useState<string | null>(null), [proposalId, setProposalId] = useState(''), [showProposals, setShowProposals] = useState(false);
  const refresh = useCallback(async () => { try { await transport.refresh(); setError(''); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível atualizar o mapa.'); } }, []);
  const loadPreview = useCallback((id: string) => transport.preview(id), []);
  useEffect(() => {
    const unsubscribe = transport.subscribe((next, available) => { setSnapshot(next); setApprovalAvailable(available); });
    const host = () => { const context = app.getHostContext(); setTheme(context?.theme || 'light'); setFullscreen(context?.displayMode === 'fullscreen'); setCanFullscreen(context?.availableDisplayModes?.includes('fullscreen') || false); };
    app.ontoolresult = result => { try { const hidden = transport.accept(result); if (typeof hidden.focusId === 'string') setArea(hidden.focusId === hidden.snapshot.board.boardId ? null : hidden.focusId); } catch { void refresh(); } };
    app.onhostcontextchanged = host;
    let disposed = false, stopSizing: (() => void) | undefined;
    app.connect().then(() => { if (!disposed) { stopSizing = bindWidgetSizing(app); host(); void refresh(); } }).catch(() => { if (!disposed) setError('Não foi possível conectar ao ChatGPT. Abra o mapa novamente na conversa.'); });
    const visible = () => { if (!document.hidden) void refresh(); };
    const poll = setInterval(visible, 15000); document.addEventListener('visibilitychange', visible);
    return () => { disposed = true; stopSizing?.(); unsubscribe(); clearInterval(poll); document.removeEventListener('visibilitychange', visible); transport.dispose(); void app.close(); };
  }, [refresh]);
  const task = async (fn: () => Promise<void>) => { setBusy(true); setError(''); try { await fn(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível concluir a ação.'); } finally { setBusy(false); } };
  const pending = snapshot?.proposals.filter(proposal => proposal.status === 'pending') || [];
  const section = snapshot?.board.sections.find(s => s.id === selected), card = snapshot?.board.sections.flatMap(s => s.cards).find(c => c.id === selected);
  const selectedNode = snapshot ? getNode(snapshot.board, selected) : undefined;
  const selectedChildren = snapshot && selectedNode ? getChildren(snapshot.board, selected) : [];
  const closeReview = () => { setProposalId(''); transport.clearProposal(); void refresh(); };
  return <main className={`business-cloud map-widget ${fullscreen ? 'is-fullscreen' : ''}`} data-theme={theme}>
    <header className="widget-header"><div className="widget-brand"><svg width="25" height="25" viewBox="0 0 28 28" fill="none" aria-hidden="true"><path d="M14 25V14M14 17C5 17 3 10 4 4c7 0 11 4 10 13Zm0-3C14 7 19 3 25 3c1 7-3 12-11 12Z" stroke="currentColor" strokeWidth="1.65"/></svg><div><strong>{snapshot?.board.title || 'GrowYourPlan'}</strong><span>{snapshot ? `GrowYourPlan · revisão ${snapshot.board.revision}` : 'Conectando seu mapa…'}</span></div></div><div className="button-row"><button className="icon-button" aria-label="Atualizar mapa" disabled={busy} onClick={() => void refresh()}><RefreshCw size={16}/></button><button className="icon-button" aria-label="Desfazer última alteração" disabled={busy || !approvalAvailable || !snapshot?.lastTransactionId} onClick={() => void task(async () => { await transport.undo(); await refresh(); })}><Undo2 size={16}/></button>{canFullscreen && <button className="icon-button" aria-label={fullscreen ? 'Voltar ao mapa na conversa' : 'Abrir mapa em tela cheia'} onClick={() => void task(async () => { await app.requestDisplayMode({ mode: fullscreen ? 'inline' : 'fullscreen' }); })}><Maximize2 size={16}/></button>}</div></header>
    {error && <div role="alert" className="notice warning">{error}<button className="text-button" onClick={() => void refresh()}>Atualizar</button></div>}
    {snapshot && <><div className="widget-toolbar"><button className={`secondary ${!area ? 'selected' : ''}`} onClick={() => { setArea(null); setProposalId(''); setShowProposals(false); }}><ChevronLeft size={13}/> Visão geral</button><label className="search"><Search size={14}/><input aria-label="Buscar no mapa" placeholder="Encontrar no mapa" value={query} onChange={e => setQuery(e.target.value)}/></label><button className="secondary widget-proposals" onClick={() => { setShowProposals(!showProposals); setProposalId(''); }}><Sparkles size={14}/> Propostas {pending.length > 0 && <span className="nav-count">{pending.length}</span>}</button></div>
      <div className={`widget-body ${proposalId || selected || showProposals ? 'has-detail' : ''}`}><section className="widget-map" aria-label="Mapa visual do negócio">{snapshot.board.sections.length ? <BusinessMap board={snapshot.board} selected={selected} query={query} area={area} focusId={area} onFocusChange={setArea} onSelect={id => { setSelected(id); setProposalId(''); setShowProposals(false); }} onAdd={id => setArea(id)} onOpen={setArea} onProposal={id => { setProposalId(id); setSelected(''); }} theme={theme} readOnly/> : <div className="empty-resource"><BookOpen size={30}/><h2>Seu mapa está em branco.</h2><p>Conte ao ChatGPT sobre seu negócio e peça uma proposta de mapa. Você pode revisar e confirmar o lote aqui.</p></div>}</section>
        {(proposalId || selected || showProposals) && <aside className="widget-detail"><button className="icon-button widget-close" aria-label="Fechar detalhe" onClick={() => { setSelected(''); setShowProposals(false); closeReview(); }}><X size={16}/></button>
          {proposalId ? <ProposalReview key={`${proposalId}:${snapshot.board.revision}`} proposalId={proposalId} approvalAvailable={approvalAvailable} load={loadPreview} confirm={preview => task(async () => { await transport.resolve(preview, 'apply'); closeReview(); })} reject={preview => task(async () => { await transport.resolve(preview, 'reject'); closeReview(); })}/> : showProposals ? <><span className="eyebrow">PARA SUA REVISÃO</span><h2>Possibilidades em aberto.</h2>{pending.map(proposal => <button className="proposal-summary" key={proposal.id} onClick={() => setProposalId(proposal.id)}><Sparkles size={16}/><div><h3>{proposal.title}</h3><p>{proposal.commands.length} alterações</p></div></button>)}{!pending.length && <p className="muted">Nenhuma proposta aguardando confirmação.</p>}</> : <><span className="eyebrow">{section ? 'ÁREA DO NEGÓCIO' : 'NOTA CONFIRMADA'}</span><h2>{section?.title || card?.title || snapshot.board.title}</h2><p className="widget-content">{section?.questions || card?.text || snapshot.board.whereStopped || 'Selecione uma área ou nota para explorar.'}</p>{card?.firstStep && <div className="focus-first">Primeiro passo: {card.firstStep}</div>}{selectedChildren.length > 0 && <div className="detail-note-list">{selectedChildren.map(child => <button key={child.id} onClick={() => setSelected(child.id)}>{child.title}</button>)}</div>}{card?.sourceIds?.length ? <><h3>Fontes vinculadas</h3>{snapshot.board.sources?.filter(source => card.sourceIds?.includes(source.id)).map(source => <details key={source.id}><summary>{source.label}</summary><p className="widget-content">{source.text}</p>{source.url && safeURL(source.url) && <a href={safeURL(source.url)} target="_blank" rel="noreferrer">Abrir fonte</a>}</details>)}</> : null}<p className="small muted">Para editar manualmente, use o site GrowYourPlan. Para propor alterações, continue a conversa no ChatGPT.</p></>}
        </aside>}
      </div><footer className="widget-footer"><span>Mapa confirmado · <span title="Versão da interface para suporte">v{WIDGET_VERSION}</span></span><span>Propostas só entram após sua confirmação</span></footer>
    </>}
  </main>;
}
function safeURL(value: string) { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.toString() : undefined; } catch { return undefined; } }
createRoot(document.getElementById('root')!).render(<Widget/>);
