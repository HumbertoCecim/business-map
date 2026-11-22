'use strict';
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => crypto.randomUUID();
const kinds = { hypothesis:'Hipótese', statement:'Declaração', decision:'Decisão aprovada', suggestion:'Sugestão de IA', evidence:'Evidência externa', experiment:'Resultado de experimento' };
let snapshot, blocks = [], providers = [], selected = 'c2', blockId = 'value', scope = 'block', mode = 'card', query = '', provider = 'codex', busy = false, job = null, jobBlock, pollTimer;
const questions = new Map(), conversations = new Map();
let editDraft = null, proposalId = null, returnTo = 'card', toastTimer;
const cards = () => snapshot.board.sections.flatMap(s => s.cards.map(c => ({ ...c, sectionId:s.id })));
const block = id => blocks.find(b => b.id === id);
const card = () => cards().find(c => c.id === selected);
const pending = () => snapshot.board.suggestions.filter(s => ['pending','kept'].includes(s.status));
const isStale = s => s.stale || snapshot.board.revision > s.baseRevision + 1;
const chatKey = () => scope === 'canvas' ? '__canvas__' : blockId;
const isUpdate = s => s.kind === 'card_draft' && s.target.kind === 'card';
const proposalCard = s => cards().find(c => c.id === s.target.id);
function chatSuggestions() {
  const ids = conversations.get(chatKey())?.suggestionIds;
  return pending().filter(s => ids ? ids.includes(s.id) : scope === 'canvas' || s.target.id === blockId || proposalCard(s)?.sectionId === blockId);
}
const target = () => window.matchMedia('(max-width:1000px)').matches ? $('mobileDetail') : $('inspector');
const closeButton = '<button class="icon-button mobile-only" data-action="close" aria-label="Fechar detalhe">×</button>';
function message(text) { clearTimeout(toastTimer); $('toast').textContent = text; $('toast').hidden = false; toastTimer = setTimeout(() => $('toast').hidden = true, 5000); }
async function api(endpoint, body, method) {
  const token = sessionStorage.getItem('canvas.local.access');
  const response = await fetch(endpoint, { method:method || (body ? 'POST' : 'GET'), headers:{ ...(token ? { Authorization:`Bearer ${token}` } : {}), ...(body ? {'Content-Type':'application/json'} : {}) }, ...(body ? { body:JSON.stringify(body) } : {}) });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || `Erro ${response.status}`);
  return value;
}
async function connect() {
  const code = new URLSearchParams(location.hash.slice(1)).get('code');
  history.replaceState(null, '', location.pathname);
  if (code) {
    // Pairing never carries an old browser capability.
    const response = await fetch('/api/pair/viewer', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({code}) });
    const value = await response.json(); if (!response.ok) throw new Error(value.error);
    sessionStorage.setItem('canvas.local.access', value.token);
  }
  blocks = (await (await fetch('/data.json')).json()).blocks;
  providers = (await api('/api/providers')).providers;
  provider = providers.find(p => p.available)?.id || 'codex';
  await refresh();
  const active = sessionStorage.getItem('canvas.local.job');
  if (active) {
    const saved = JSON.parse(active); jobBlock = saved.block; job = await api(`/api/ask/${saved.id}`).catch(() => null);
    if (job) { if (job.status === 'running') schedulePoll(); else await finishJob(); }
  }
}
async function refresh() { snapshot = await api('/api/context'); renderStage(); renderDetail(false); }
async function command(cmd) {
  if (busy) throw new Error('Aguarde o salvamento atual.');
  busy = true; $('saveStatus').textContent = 'Salvando…';
  try {
    snapshot = await api('/api/command', { expectedRevision:snapshot.board.revision, expectedFingerprint:snapshot.fingerprint, requestId:uid(), command:cmd });
    renderStage(); return true;
  } catch (error) {
    await refresh();
    throw new Error(`Não foi salvo. ${error.message}\nSe outra janela alterou o modelo, revise seu rascunho e tente novamente.`);
  } finally { busy = false; $('saveStatus').textContent = `Salvo neste computador · revisão ${snapshot.board.revision}`; }
}
function renderStage() {
  $('businessTitle').textContent = snapshot.board.title;
  $('saveStatus').textContent = `Salvo neste computador · revisão ${snapshot.board.revision}`;
  $('review').innerHTML = `Sugestões <span class="count">${pending().length}</span>`;
  $('sessionFooter').textContent = 'Ateliê Aurora · dados fictícios · alterações salvas apenas no teste local.';
  const order = ['partners','activities','resources','value','relationships','channels','segments','costs','revenue'];
  $('stage').innerHTML = `<div class="canvas-view"><div class="canvas-intro"><p>Uma página para conectar as partes do negócio.</p><span>${cards().length} IDEIAS · EM ESTUDO</span></div><div class="bmc">${order.map(id => {
    const b = block(id), section = snapshot.board.sections.find(s => s.id === id);
    const list = (section?.cards || []).filter(c => `${c.title} ${c.text} ${b.name}`.toLocaleLowerCase('pt-BR').includes(query));
    return `<article class="block tone-${b.group}" data-block="${id}"><div class="block-header"><h3 class="block-label">${esc(b.name)}</h3><span class="block-number">${b.number}</span></div><div class="block-ideas">${list.map(c => `<button class="block-card ${selected === c.id ? 'is-selected' : ''}" data-card="${esc(c.id)}"><span class="card-title">${esc(c.title)}</span><span class="kind ${esc(c.semanticType)}">${esc(kinds[c.semanticType] || 'Ideia')}</span></button>`).join('') || '<p class="card-help">Espaço para uma nova ideia.</p>'}</div><button class="add-idea" data-add="${id}"><span aria-hidden="true">+</span> Adicionar ideia</button><button class="ask-block" data-ask="${id}">✧ Conversar sobre este bloco</button></article>`;
  }).join('')}</div><div class="canvas-foot"><span><i></i>Hipótese: ainda precisa ser testada</span><span><i class="solid"></i>Decisão: escolha, não prova de mercado</span></div></div>`;
}
function tabs() { return `<div class="mode-tabs"><button data-action="card" aria-pressed="${mode === 'card' || mode === 'edit'}">Ideia</button><button data-action="chat" aria-pressed="${mode === 'chat'}">✧ Conversa</button><button data-action="review" aria-pressed="${mode === 'review'}">Sugestões</button></div>`; }
function cardDetail() {
  const c = card(); if (!c) return '<p>Abra uma ideia ou converse sobre um bloco.</p>';
  const links = (snapshot.board.relations || []).filter(r => r.fromId === c.id || r.toId === c.id).map(r => cards().find(x => x.id === (r.fromId === c.id ? r.toId : r.fromId))).filter(Boolean);
  return `<span class="detail-tone">${esc(block(c.sectionId).name)}</span><h3 class="detail-title">${esc(c.title)}</h3><span class="kind ${esc(c.semanticType)}">${esc(kinds[c.semanticType] || 'Ideia')}</span><p class="detail-copy">${esc(c.text)}</p><div class="detail-section"><h4>Próximo passo</h4><p>${esc(c.firstStep || 'Ainda não definido.')}</p></div>${c.sourceSuggestionId ? '<p class="agent-note">Origem: sugestão de IA, revisada por uma pessoa. A hipótese continua precisando de teste.</p>' : ''}<div class="button-row"><button class="button" data-action="edit">Editar ideia</button><button class="button primary" data-ask="${c.sectionId}">Conversar sobre o bloco</button></div>${links.length ? `<div class="detail-section"><h4>Conecta com</h4><div class="related-links">${links.map(x => `<button data-card="${esc(x.id)}">${esc(x.title)} ↗</button>`).join('')}</div></div>` : ''}`;
}
function proposalHTML(s) {
  const update = isUpdate(s), current = update && proposalCard(s);
  const canReview = ['insight','card_draft'].includes(s.kind) && (!update || (current && s.cardDraft));
  const destination = update ? current?.sectionId : s.target.kind === 'section' ? s.target.id : proposalCard(s)?.sectionId;
  return `<article class="suggestion-item" data-suggestion="${esc(s.id)}"><span class="kind suggestion">${update ? 'Alterar cartão' : 'Nova sugestão'} · ${esc(s.sourceAgentId.split(':')[0])}</span><h4>${esc(s.title)}</h4><p>${esc(s.cardDraft?.text || s.text)}</p>${s.cardDraft?.firstStep ? `<div class="suggested-step"><strong>Próximo passo sugerido</strong><p>${esc(s.cardDraft.firstStep)}</p></div>` : ''}<p class="agent-note">${esc(block(destination)?.name || 'Escolha o bloco na revisão')}${update && current ? ` · ${esc(current.title)}` : ''}</p><p class="agent-note">${esc(s.rationale)}</p>${isStale(s) ? '<p class="proposal-warning">O modelo mudou desde o pedido. Confira o conteúdo atual ao revisar.</p>' : ''}${update && !current ? '<p class="proposal-warning">O cartão de destino não existe mais. Esta alteração não pode ser aplicada.</p>' : ''}<div class="button-row">${canReview ? `<button class="button primary" data-proposal="${esc(s.id)}">${update ? 'Revisar alteração' : 'Revisar para adicionar'}</button>` : '<p class="agent-note">Proposta disponível apenas para leitura/descarte.</p>'}<button class="button" data-discard="${esc(s.id)}">Descartar</button></div></article>`;
}
let reviewedCard = null;
function editor() {
  const d = editDraft, origin = proposalId && snapshot.board.suggestions.find(s => s.id === proposalId);
  const update = origin && isUpdate(origin), current = update && proposalCard(origin);
  const changed = update && JSON.stringify(current) !== JSON.stringify(reviewedCard);
  const resolved = origin && !pending().some(s => s.id === origin.id);
  const before = update && reviewedCard ? `<section class="change-before"><span class="eyebrow">ANTES · CONTEÚDO REVISADO</span><h4>${esc(reviewedCard.title)}</h4><p>${esc(reviewedCard.text)}</p><strong>Próximo passo atual</strong><p>${esc(reviewedCard.firstStep || 'Ainda não definido.')}</p></section>` : '';
  return `<span class="eyebrow">${origin ? update ? 'ALTERAÇÃO SUGERIDA PELA IA' : 'REVISAR SUGESTÃO DE IA' : d.id ? 'EDITAR IDEIA' : 'UMA NOVA IDEIA'}</span><h3 class="detail-title">${update ? 'Revise o que vai mudar.' : origin ? 'O que você quer levar ao Canvas?' : block(d.sectionId).question}</h3>${origin && isStale(origin) ? '<p class="proposal-warning">O modelo mudou desde o pedido. Compare com o contexto atual antes de aceitar.</p>' : ''}${before}${changed ? `<p class="proposal-warning">O cartão mudou desde que você abriu esta revisão. Seu rascunho foi preservado. ${current ? '<button class="button" data-action="compare-current">Atualizar comparação</button>' : 'O cartão foi removido; volte à conversa.'}</p>` : ''}${resolved ? '<p class="proposal-warning">Esta proposta já foi resolvida em outra janela.</p>' : ''}<form class="edit-form" id="editForm">${origin ? `<span class="eyebrow">${update ? 'DEPOIS · VOCÊ PODE AJUSTAR' : 'PROPOSTA PARA ADICIONAR'}</span>` : ''}<label for="cardTitle">Ideia</label><input id="cardTitle" name="title" value="${esc(d.title)}" maxlength="500" required><label for="cardText">Contexto</label><textarea id="cardText" name="text" maxlength="30000">${esc(d.text)}</textarea><label for="cardStep">Próximo passo</label><input id="cardStep" name="firstStep" value="${esc(d.firstStep)}" maxlength="500"><label for="cardKind">Como registrar</label><select id="cardKind" name="semanticType">${Object.entries(kinds).filter(([k]) => k !== 'suggestion').map(([k,v]) => `<option value="${k}" ${d.semanticType === k ? 'selected' : ''}>${v}</option>`).join('')}</select><label for="destination">Bloco</label><select id="destination" name="sectionId" ${d.id ? 'disabled' : ''}>${blocks.map(b => `<option value="${b.id}" ${d.sectionId === b.id ? 'selected' : ''}>${b.name}</option>`).join('')}</select><p class="agent-note">${update ? 'A alteração mantém o mesmo cartão, seus vínculos e prioridades. ' : ''}Aprovar o texto não comprova a hipótese.</p><div class="button-row"><button class="button" type="button" data-action="cancel-edit">Voltar</button><button class="button primary" type="submit" ${changed || resolved ? 'disabled' : ''}>${origin ? update ? 'Aprovar alteração' : 'Aprovar e adicionar' : 'Salvar ideia'}</button></div></form>`;
}
function chatDetail() {
  const b = block(blockId), available = providers.filter(p => p.available), entry = conversations.get(chatKey());
  const running = job?.status === 'running', relevant = (jobBlock?.key || jobBlock?.id) === chatKey();
  const jobNotice = running ? `Consultando ${jobBlock?.provider || provider}${relevant ? '' : ' em outra conversa'} · pode levar até 3 minutos…` : relevant && job?.status === 'error' ? job.error : relevant && job?.status === 'cancelled' ? 'Conversa cancelada. Nenhuma sugestão parcial foi aplicada.' : '';
  const history = entry?.history || [];
  const transcript = history.map(m => m.role === 'assistant' ? `<div class="answer"><h4>Resposta · ${esc(m.provider || entry.provider)}</h4>${esc(m.text)}</div>` : `<div class="human-message"><span class="eyebrow">VOCÊ</span><p>${esc(m.text)}</p></div>`).join('');
  const suggestions = chatSuggestions();
  return `<span class="eyebrow">CONVERSE PARA CONSTRUIR</span><h3 class="detail-title">${scope === 'canvas' ? 'Canvas inteiro' : b.name}</h3><p class="agent-note">Peça para melhorar ideias, criar hipóteses ou definir próximos passos. Revise as propostas aqui e aplique ao Canvas.</p><label class="scope-label" for="scope">Contexto da conversa</label><select class="agent-select" id="scope" ${running ? 'disabled' : ''}><option value="block" ${scope === 'block' ? 'selected' : ''}>Este bloco · ${esc(b.name)}</option><option value="canvas" ${scope === 'canvas' ? 'selected' : ''}>Canvas inteiro · nove blocos</option></select><details class="agent-context"><summary>O que o agente recebe</summary><p>${scope === 'canvas' ? 'Conteúdo dos nove blocos.' : 'Cartões deste bloco; nomes e contagem dos outros oito.'} Vínculos, fontes e skills confirmadas pertinentes, além das últimas três trocas desta conversa. Credenciais não entram no pedido.</p></details>${transcript}<section class="inline-proposals" aria-label="Propostas desta conversa">${suggestions.length ? `<h4>Propostas para o Canvas <span class="count">${suggestions.length}</span></h4>${suggestions.map(proposalHTML).join('')}` : entry?.suggestionIds?.length ? '<p class="agent-note">As propostas desta conversa já foram resolvidas. Você pode continuar pedindo ajustes.</p>' : ''}</section><div class="job-status" id="jobStatus" role="status">${esc(jobNotice)}</div><form class="agent-form" id="askForm"><label for="provider">Agente local</label><select class="agent-select" id="provider" name="provider" ${running ? 'disabled' : ''}>${providers.map(p => `<option value="${p.id}" ${provider === p.id ? 'selected' : ''} ${!p.available ? 'disabled' : ''}>${p.id === 'codex' ? 'Codex' : 'Claude Code'}${p.available ? ' · encontrado' : ' · não encontrado'}</option>`).join('')}</select><label for="question">O que vamos mudar ou investigar?</label><textarea id="question" name="question" maxlength="12000" placeholder="Melhore esta ideia e proponha o próximo passo para testá-la…" ${running ? 'disabled' : ''} required>${esc(questions.get(chatKey()) || '')}</textarea><div class="quick-prompts"><button type="button" data-prompt="Melhore os cartões existentes neste contexto e explique cada mudança.">Melhorar ideias</button><button type="button" data-prompt="Defina próximos passos concretos para testar as hipóteses dos cartões existentes.">Definir próximos passos</button><button type="button" data-prompt="Proponha novas hipóteses ou experimentos para este contexto, sem inventar evidências.">Criar sugestões</button></div><p class="agent-note">Usa o login do CLI e pode consumir limites ou créditos. O agente só propõe; você aplica. Uma conversa por vez.</p><div class="button-row"><button class="button primary" type="submit" ${running || !available.length ? 'disabled' : ''}>Enviar ao agente</button>${running ? '<button class="button" type="button" data-action="cancel-job">Cancelar conversa</button>' : ''}</div></form>`;
}
function reviewDetail() {
  return `<span class="eyebrow">VOCÊ DECIDE O QUE FICA</span><h3 class="detail-title">Sugestões do agente</h3><p class="agent-note">Novas ideias e mudanças propostas ficam pendentes até você revisar. Aprovação não significa validação de mercado.</p>${pending().map(proposalHTML).join('') || '<p class="detail-copy">Nenhuma sugestão pendente. Abra uma conversa para construir o Canvas.</p>'}`;
}
function renderDetail(open = false) {
  if (!snapshot) return;
  const html = `<div class="detail-shell"><div class="detail-top"><span class="eyebrow">ATELIÊ AURORA</span>${closeButton}</div>${tabs()}${mode === 'chat' ? chatDetail() : mode === 'review' ? reviewDetail() : mode === 'edit' ? editor() : cardDetail()}</div>`;
  const dest = target(); dest.innerHTML = html;
  if (dest === $('mobileDetail')) { if (open && !dest.open) dest.showModal(); $('inspector').innerHTML = ''; }
  else { if ($('mobileDetail').open) $('mobileDetail').close(); $('mobileDetail').innerHTML = ''; }
}
function openCard(id) { selected = id; blockId = card().sectionId; scope = 'block'; mode = 'card'; editDraft = null; proposalId = null; renderStage(); renderDetail(true); }
function openChat(id) { blockId = id; scope = 'block'; mode = 'chat'; renderDetail(true); }
function schedulePoll() { clearTimeout(pollTimer); pollTimer = setTimeout(() => void pollJob(), 700); }
async function pollJob() {
  try { job = await api(`/api/ask/${job.id}`); if (job.status === 'running') schedulePoll(); else await finishJob(); }
  catch (error) { message(`Não foi possível acompanhar: ${error.message}. Atualize a página para retomar.`); }
}
async function finishJob() {
  sessionStorage.removeItem('canvas.local.job');
  if (job.status === 'done') {
    const key = jobBlock.key || jobBlock.id, previous = conversations.get(key);
    conversations.set(key, { text:job.text, provider:jobBlock.provider, suggestionIds:[...new Set([...(previous?.suggestionIds || []),...(job.suggestionIds || [])])], history:[...(previous?.history || []),{role:'user',text:jobBlock.question},{role:'assistant',text:job.text,provider:jobBlock.provider}].slice(-6) });
    questions.set(key, '');
    snapshot = await api('/api/context'); renderStage();
    message(`${job.suggestionIds?.length || 0} propostas recebidas. Revise na conversa antes de aplicar.`);
  } else message(job.status === 'cancelled' ? 'Conversa cancelada.' : job.error);
  if (mode === 'chat' || mode === 'review') renderDetail(false);
}
document.addEventListener('click', event => {
  const el = event.target.closest('button'); if (!el || !snapshot) return;
  void (async () => {
    if (el.dataset.card) return openCard(el.dataset.card);
    if (el.dataset.ask) return openChat(el.dataset.ask);
    if (el.dataset.add) { blockId = el.dataset.add; mode = 'edit'; returnTo = 'card'; proposalId = null; editDraft = { sectionId:blockId, title:'', text:'', firstStep:'', semanticType:'hypothesis' }; return renderDetail(true); }
    if (el.dataset.prompt) { questions.set(chatKey(),el.dataset.prompt); $('question').value = el.dataset.prompt; $('question').focus(); return; }
    if (el.dataset.proposal) {
      const s = snapshot.board.suggestions.find(s => s.id === el.dataset.proposal);
      if (!s || !pending().some(x => x.id === s.id)) throw new Error('Esta proposta já foi resolvida.');
      returnTo = mode === 'chat' ? 'chat' : 'review'; proposalId = s.id; mode = 'edit';
      if (isUpdate(s)) {
        const current = proposalCard(s); if (!current || !s.cardDraft) { mode = returnTo; throw new Error('O cartão de destino ou a proposta não está mais disponível.'); }
        reviewedCard = structuredClone(current); editDraft = {...current,...s.cardDraft};
        return renderDetail(true);
      }
      reviewedCard = null;
      const destination = s.target.kind === 'section' ? s.target.id : cards().find(c => c.id === s.target.id)?.sectionId || blockId;
      editDraft = { sectionId:block(destination) ? destination : 'segments', title:s.cardDraft?.title || s.title, text:s.cardDraft?.text || s.text, firstStep:s.cardDraft?.firstStep || '', semanticType:'hypothesis' };
      return renderDetail(true);
    }
    if (el.dataset.discard) { await command({type:'suggestion.status',id:el.dataset.discard,status:'discarded'}); return renderDetail(false); }
    switch (el.dataset.action || el.id) {
      case 'theme': document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; break;
      case 'close': $('mobileDetail').close(); break;
      case 'review': mode = 'review'; renderDetail(true); break;
      case 'askCanvas': scope = 'canvas'; mode = 'chat'; renderDetail(true); break;
      case 'chat': mode = 'chat'; renderDetail(true); break;
      case 'compare-current': reviewedCard = structuredClone(proposalCard(snapshot.board.suggestions.find(s => s.id === proposalId))); renderDetail(false); break;
      case 'refresh': await refresh(); message('Dados atualizados.'); break;
      case 'card': mode = 'card'; renderDetail(true); break;
      case 'edit': editDraft = {...card()}; proposalId = null; returnTo = 'card'; mode = 'edit'; renderDetail(true); break;
      case 'cancel-edit': mode = returnTo; editDraft = null; proposalId = null; renderDetail(false); break;
      case 'cancel-job': job = await api(`/api/ask/${job.id}`, undefined, 'DELETE'); if (job.status !== 'running') await finishJob(); break;
    }
  })().catch(error => message(error.message));
});
document.addEventListener('input', event => {
  if (event.target.id === 'search') { query = event.target.value.toLocaleLowerCase('pt-BR'); if (snapshot) renderStage(); }
  if (event.target.id === 'question') questions.set(chatKey(), event.target.value);
  if (event.target.closest('#editForm')) editDraft[event.target.name] = event.target.value;
});
document.addEventListener('change', event => {
  if (event.target.id === 'provider') provider = event.target.value;
  if (event.target.id === 'scope') { scope = event.target.value; renderDetail(false); }
});
document.addEventListener('submit', event => {
  if (!['askForm','editForm'].includes(event.target.id)) return;
  event.preventDefault(); const form = event.target;
  void (async () => {
    const values = Object.fromEntries(new FormData(form));
    if (form.id === 'editForm') {
      const d = editDraft, sectionId = d.id ? d.sectionId : values.sectionId;
      if (proposalId && !pending().some(s => s.id === proposalId)) throw new Error('Esta proposta já foi resolvida. Volte à lista de sugestões.');
      const origin = proposalId && snapshot.board.suggestions.find(s => s.id === proposalId);
      if (origin && isUpdate(origin) && JSON.stringify(proposalCard(origin)) !== JSON.stringify(reviewedCard)) throw new Error('O cartão mudou. Atualize a comparação antes de aplicar.');
      const next = { ...(d.id ? cards().find(c => c.id === d.id) : { id:`card-${uid()}`, lane:'later', done:false, urgent:false, important:false }), title:values.title, text:values.text, firstStep:values.firstStep, semanticType:values.semanticType };
      delete next.sectionId;
      await command({type:'card.save', sectionId, card:next, ...(proposalId ? {sourceSuggestionId:proposalId} : {})});
      message(proposalId ? 'Proposta aplicada ao Canvas.' : 'Ideia salva.');
      if (proposalId && returnTo === 'chat') { selected = next.id; proposalId = null; editDraft = null; mode = 'chat'; renderStage(); renderDetail(false); }
      else openCard(next.id);
    } else {
      if (job?.status === 'running') return;
      const question = String(values.question).trim(); if (!question) return;
      const requestId = uid(); jobBlock = {id:blockId,key:chatKey(),scope,provider,question};
      // Disable immediately to prevent double submits while HTTP is in flight.
      form.querySelector('[type=submit]').disabled = true;
      try {
        const instructions = 'Responda em português e proponha no máximo três mudanças úteis, pendentes de revisão humana. Para CRIAR cartão: kind=card_draft, targetKind=section, targetId=ID de um bloco existente; cardDraft com title, text e firstStep. Para ALTERAR cartão existente ou seu próximo passo: kind=card_draft, targetKind=card, targetId=ID EXATO do cartão incluído no contexto; cardDraft deve conter o texto completo desejado, preservando title/text/firstStep que não precisem mudar. Não invente IDs, fontes ou validação de mercado; não proponha excluir cartões nem renomear os nove blocos. Se o conteúdo atual tiver trechos omitidos, peça contexto e não proponha substituí-lo por um resumo. Use insight apenas para observações. Você não aplica as mudanças: a pessoa revisa na interface. Pergunta da pessoa: ';
        job = await api('/api/ask', {requestId,provider,question:instructions+question,targetIds:scope === 'canvas' ? [snapshot.board.boardId] : [blockId],history:conversations.get(chatKey())?.history || []});
        sessionStorage.setItem('canvas.local.job',JSON.stringify({id:job.id,block:jobBlock}));
        renderDetail(false); schedulePoll();
      } catch (error) { renderDetail(false); throw error; }
    }
  })().catch(error => message(error.message));
});
window.matchMedia('(max-width:1000px)').addEventListener('change', () => renderDetail(mode !== 'card' || $('mobileDetail').open));
connect().catch(error => { $('connectionError').hidden = false; $('connectionError').textContent = `Não foi possível conectar. ${error.message}\nGere um novo link no terminal: npm run canvas:local:open`; $('saveStatus').textContent = 'Sem conexão'; });
