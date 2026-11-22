import assert from "node:assert/strict";
import path from "node:path";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { startCanvasTrial, assetsDir } from "./serve";
import { controlRequest } from "../../local/control";

const evidence = path.resolve(assetsDir, "../../.local/canvas-agente/verification");
await mkdir(evidence, { recursive: true });
const base = await mkdtemp(path.join(evidence, "run-"));
const service = await startCanvasTrial(base, { fake:true, timeoutMs:1200 });
const browser = await chromium.launch({ channel:"msedge", headless:true });
const checks: string[] = [], errors: string[] = [];
const context = await browser.newContext({ viewport:{width:1440,height:1050} });
const page = await context.newPage();
page.on("pageerror", error => errors.push(error.message));
page.on("console", event => { if (event.type() === "error" && !event.text().includes("status of 409")) errors.push(event.text()); });
const pair = await controlRequest(service.runtime, "open");
const req = async (url: string, data?: unknown, method = data ? "POST" : "GET", extra = {}) => fetch(service.runtime.url + url, { method, headers:{ Authorization:`Bearer ${service.runtime.humanToken}`, ...(data ? {"Content-Type":"application/json"} : {}), ...extra }, ...(data ? { body:JSON.stringify(data) } : {}) });
const read = async () => (await req("/api/context")).json() as Promise<any>;
const until = async (fn: () => Promise<boolean>) => { for (let i=0;i<400;i++) { if (await fn()) return; await new Promise(resolve => setTimeout(resolve,20)); } throw new Error("Timed out waiting for fake provider."); };
try {
  assert.equal((await fetch(service.runtime.url + "/api/context")).status,401);
  assert.equal((await req("/api/context", undefined, "GET", {Origin:"https://untrusted.invalid"})).status,403);
  await page.goto(`${service.runtime.url}/#code=${pair.code}`);
  await page.locator('.block').nth(8).waitFor();
  assert.equal(await page.locator('.block').count(),9);
  assert.equal(await page.locator('.block-card').count(),9);
  assert.equal(new URL(page.url()).hash, '');
  checks.push("Pareamento, Host/Origin, nove blocos e nenhum agente iniciado no carregamento");
  assert.equal(service.ask.jobs.size,0);
  assert.equal((await fetch(service.runtime.url+'/api/pair/viewer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:pair.code})})).status,403);

  await page.locator('[data-add=segments]').click();
  await page.locator('#cardTitle').fill('Ideia humana <script>não executar</script>');
  await page.locator('#cardText').fill('Contexto salvo no writer isolado.');
  await page.getByRole('button',{name:'Salvar ideia',exact:true}).click();
  await until(async () => (await read()).board.sections[0].cards.some((c:any)=>c.title.startsWith('Ideia humana')));
  await page.reload(); await page.locator('.block-card').nth(9).waitFor();
  assert.equal(await page.locator('.block-card').count(),10);
  checks.push("Edição humana salva, persistência após recarregar e texto HTML escapado");

  await page.locator('[data-ask=segments]').first().click();
  await page.locator('#question').fill('Qual hipótese devo testar primeiro?');
  await page.getByRole('button',{name:'Enviar ao agente',exact:true}).click();
  await page.locator('.answer').waitFor();
  assert.match(await page.locator('.answer').innerText(),/TESTE FALSO.*Segmentos de clientes/s);
  assert.equal(await page.locator('.block-card').count(),10);
  let state = await read(); assert.equal(state.board.suggestions.length,1); assert.equal(state.board.suggestions[0].status,'pending');
  checks.push("Codex falso recebe contexto do bloco; resposta não altera cartões confirmados");
  assert.equal(await page.locator('.inline-proposals [data-proposal]').count(),1);
  await page.getByRole('button',{name:'Revisar para adicionar'}).click();
  await page.locator('#cardTitle').fill('Minha versão revisada da proposta');
  await page.getByRole('button',{name:'Aprovar e adicionar'}).click();
  await until(async()=> (await read()).board.suggestions[0].status==='incorporated');
  state = await read(); const accepted=state.board.sections.flatMap((s:any)=>s.cards).find((c:any)=>c.title==='Minha versão revisada da proposta');
  assert.equal(accepted.sourceSuggestionId,state.board.suggestions[0].id); assert.equal(accepted.semanticType,'hypothesis');
  assert.equal(state.board.sections.flatMap((s:any)=>s.cards).length,11);
  checks.push("Revisão humana modifica proposta; aprovação atômica cria hipótese com origem preservada");

  // Claude uses its structured_output envelope; reject without touching cards.
  await page.locator('[data-ask=value]').first().click();
  await page.locator('#provider').selectOption('claude');
  await page.locator('#question').fill('Como testar a promessa?');
  await page.getByRole('button',{name:'Enviar ao agente',exact:true}).click();
  await until(async()=> (await read()).board.suggestions.length===2);
  await page.locator('#review').click();
  await page.getByRole('button',{name:'Descartar',exact:true}).click();
  await until(async()=> (await read()).board.suggestions[1].status==='discarded');
  checks.push("Claude falso, envelope estruturado e descarte sem alterar Canvas");

  // An existing card is revised in place, with an explicit before/after review.
  await page.locator('[data-ask=segments]').first().click();
  await page.locator('#question').fill('UPDATE_TEST melhore esta ideia e seu próximo passo');
  await page.getByRole('button',{name:'Enviar ao agente',exact:true}).click();
  await page.locator('.inline-proposals [data-proposal]').waitFor();
  state=await read(); const original=structuredClone(state.board.sections[0].cards[0]);
  const originalRelations=structuredClone(state.board.relations), count=state.board.sections.flatMap((s:any)=>s.cards).length;
  assert.equal(original.title,'Adultos que querem voltar a desenhar');
  await page.getByRole('button',{name:'Revisar alteração',exact:true}).click();
  assert.match(await page.locator('.change-before').innerText(),/Adultos que querem voltar a desenhar/);
  assert.equal(await page.locator('#cardStep').inputValue(),'Convidar três pessoas para uma conversa de quinze minutos.');
  await page.locator('#cardTitle').fill('Título revisado pela pessoa');
  for (const width of [1440,390]) for (const theme of ['light','dark']) {
    await page.setViewportSize({width,height:width===390 ? 844 : 1050});
    await page.locator('html').evaluate((el:any,theme)=>el.setAttribute('data-theme',theme),theme);
    await page.locator('#cardTitle').waitFor({state:'visible'});
    assert.equal(await page.locator('#cardTitle').inputValue(),'Título revisado pela pessoa');
    await page.screenshot({path:path.join(evidence,`review-${width}-${theme}.png`),fullPage:width!==390});
  }
  await page.setViewportSize({width:1440,height:1050});
  await page.locator('html').evaluate((el:any)=>el.setAttribute('data-theme','light'));
  // Simulate another window editing exactly this card while review is open.
  await req('/api/command',{requestId:crypto.randomUUID(),expectedRevision:state.board.revision,expectedFingerprint:state.fingerprint,command:{type:'card.save',sectionId:'segments',card:{...original,title:'Outra janela escreveu',important:true}}});
  await page.getByRole('button',{name:'Aprovar alteração',exact:true}).click();
  await page.getByRole('button',{name:'Atualizar comparação',exact:true}).waitFor();
  assert.ok(await page.getByRole('button',{name:'Aprovar alteração',exact:true}).isDisabled());
  assert.equal(await page.locator('#cardTitle').inputValue(),'Título revisado pela pessoa');
  await page.getByRole('button',{name:'Atualizar comparação',exact:true}).click();
  assert.match(await page.locator('.change-before').innerText(),/Outra janela escreveu/);
  await page.getByRole('button',{name:'Aprovar alteração',exact:true}).click();
  await until(async()=> (await read()).board.suggestions[2].status==='incorporated');
  state=await read(); const updated=state.board.sections[0].cards[0];
  assert.equal(updated.id,original.id); assert.equal(updated.title,'Título revisado pela pessoa'); assert.equal(updated.text,original.text);
  assert.equal(updated.firstStep,'Convidar três pessoas para uma conversa de quinze minutos.');
  assert.equal(updated.important,true); assert.equal(updated.lane,original.lane); assert.equal(updated.done,original.done); assert.equal(updated.urgent,original.urgent);
  assert.deepEqual(state.board.relations,originalRelations); assert.equal(state.board.sections.flatMap((s:any)=>s.cards).length,count);
  assert.equal(await page.locator('#askForm').count(),1);
  checks.push("Alteração na conversa mantém cartão/vínculos/prioridades; conflito bloqueia até renovar comparação e aceitar");

  await page.locator('#question').fill('STEP_TEST defina somente o próximo passo');
  await page.getByRole('button',{name:'Enviar ao agente',exact:true}).click();
  await page.getByRole('button',{name:'Revisar alteração',exact:true}).waitFor();
  const beforeStep=structuredClone((await read()).board.sections[0].cards[0]);
  await page.getByRole('button',{name:'Revisar alteração',exact:true}).click();
  await page.getByRole('button',{name:'Aprovar alteração',exact:true}).click();
  await until(async()=> (await read()).board.suggestions[3].status==='incorporated');
  state=await read(); assert.deepEqual(state.board.sections[0].cards[0],{...beforeStep,firstStep:'Reservar duas conversas para amanhã.'});
  checks.push("Pedido de próximo passo não duplica cartão nem substitui título/contexto");

  await page.locator('#askCanvas').click();
  assert.equal(await page.locator('#scope').inputValue(),'canvas');
  await page.locator('#question').fill('GLOBAL_TEST crie uma hipótese sobre custos');
  await page.getByRole('button',{name:'Enviar ao agente',exact:true}).click();
  await page.locator('.answer').filter({hasText:'nove blocos completos'}).waitFor();
  await page.getByRole('button',{name:'Revisar para adicionar',exact:true}).click();
  assert.equal(await page.locator('#destination').inputValue(),'costs');
  await page.getByRole('button',{name:'Aprovar e adicionar',exact:true}).click();
  await until(async()=> (await read()).board.suggestions[4].status==='incorporated');
  state=await read(); assert.equal(state.board.sections.find((s:any)=>s.id==='costs').cards.length,2);
  assert.equal(await page.locator('#scope').inputValue(),'canvas');
  checks.push("Conversa global recebe nove blocos completos e cria cartão no bloco proposto com aprovação");

  await page.locator('[data-ask=segments]').first().click();
  await page.locator('#question').fill('MISSING_TEST');
  await page.getByRole('button',{name:'Enviar ao agente',exact:true}).click();
  await until(async()=>[...service.ask.jobs.values()].at(-1)?.status==='error');
  assert.equal((await read()).board.suggestions.length,5);
  checks.push("ID de alvo inventado é rejeitado pelo domínio sem escrita parcial");
  await page.locator('#question').waitFor({state:'visible'});
  await until(async()=>await page.getByRole('button',{name:'Enviar ao agente',exact:true}).isEnabled());
  await page.locator('#question').fill('UPDATE_TEST proposta antes de remover o alvo');
  await page.getByRole('button',{name:'Enviar ao agente',exact:true}).click();
  await page.getByRole('button',{name:'Revisar alteração',exact:true}).waitFor();
  state=await read();
  await req('/api/command',{requestId:crypto.randomUUID(),expectedRevision:state.board.revision,expectedFingerprint:state.fingerprint,command:{type:'card.delete',id:'c1'}});
  await page.locator('#refresh').click();
  await page.locator('.inline-proposals').getByText('O cartão de destino não existe mais.',{exact:false}).waitFor();
  assert.equal(await page.locator('.inline-proposals [data-proposal]').count(),0);
  await page.locator('.inline-proposals [data-discard]').click();
  await until(async()=> (await read()).board.suggestions[5].status==='discarded');
  checks.push("ID de cartão inexistente fica sem ação de aplicar, sem virar cartão novo silenciosamente");

  const before=(await read()).board.revision;
  for (const question of ['BAD_TEST','ERROR_TEST','SLOW_TEST']) {
    const response = await req('/api/ask',{requestId:crypto.randomUUID(),provider:'codex',question,targetIds:['segments']}); assert.equal(response.status,202);
    const job=await response.json() as any;
    if(question==='SLOW_TEST') {
      assert.equal((await req('/api/ask',{requestId:crypto.randomUUID(),provider:'codex',question:'parallel'})).status,409);
    }
    await until(async()=>service.ask.jobs.get(job.id)?.status!=='running');
    assert.equal(service.ask.jobs.get(job.id)?.status,'error');
    if(question==='SLOW_TEST') assert.match(service.ask.jobs.get(job.id)?.error || '',/ASK_TIMEOUT/);
    await service.ask.close();
  }
  assert.equal((await read()).board.revision,before);
  checks.push("Schema inválido, falha de processo, timeout e concorrência recusam escrita parcial");

  await page.locator('[data-ask=costs]').first().click();
  await page.locator('#question').fill('SLOW_TEST');
  await page.getByRole('button',{name:'Enviar ao agente',exact:true}).click();
  await page.getByRole('button',{name:'Cancelar conversa',exact:true}).click();
  await page.getByRole('button',{name:'Enviar ao agente',exact:true}).waitFor();
  await until(async()=>[...service.ask.jobs.values()].at(-1)?.status==='cancelled');
  assert.equal((await read()).board.revision,before);
  checks.push("Cancelamento pelo Canvas encerra o job sem salvar sugestões parciais");

  await page.locator('[data-card=c2]').first().click();
  await page.getByRole('button',{name:'Editar ideia',exact:true}).click();
  await page.locator('#cardTitle').fill('Rascunho preservado em conflito');
  state=await read(); await req('/api/command',{requestId:crypto.randomUUID(),expectedRevision:state.board.revision,expectedFingerprint:state.fingerprint,command:{type:'title',title:'Ateliê Aurora'}});
  await page.getByRole('button',{name:'Salvar ideia',exact:true}).click();
  await page.locator('#toast').filter({hasText:'Não foi salvo'}).waitFor();
  assert.equal(await page.locator('#cardTitle').inputValue(),'Rascunho preservado em conflito');
  assert.notEqual((await read()).board.sections.find((s:any)=>s.id==='value').cards[0].title,'Rascunho preservado em conflito');
  checks.push("Conflito entre janelas não sobrescreve dados e preserva rascunho humano");

  await page.getByRole('button',{name:'Voltar',exact:true}).click();
  await page.locator('#toast').waitFor({state:'hidden'});
  for (const width of [1440,390]) for (const theme of ['light','dark']) {
    await page.setViewportSize({width,height:width===390 ? 844 : 1050});
    await page.locator('html').evaluate((el:any,theme)=>el.setAttribute('data-theme',theme),theme);
    if(await page.locator('#mobileDetail').evaluate((el:any)=>el.open)) await page.keyboard.press('Escape');
    assert.ok(await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'));
    await page.screenshot({path:path.join(evidence,`canvas-${width}-${theme}.png`),fullPage:true});
    await page.locator('[data-ask=segments]').first().click();
    await page.screenshot({path:path.join(evidence,`chat-${width}-${theme}.png`),fullPage:true});
    if(width===390) {
      assert.ok(await page.locator('#mobileDetail').evaluate((el:any)=>el.open));
      assert.ok(await page.getByRole('button',{name:'Enviar ao agente',exact:true}).isEnabled());
      await page.getByRole('button',{name:'Enviar ao agente',exact:true}).scrollIntoViewIfNeeded();
      await page.screenshot({path:path.join(evidence,`chat-actions-390-${theme}.png`)});
      await page.keyboard.press('Escape');
    }
  }
  assert.deepEqual(errors,[]);
  checks.push("Canvas/conversa em 1440 e390, claro/escuro, sem overflow horizontal ou erros de página/console");
  await writeFile(path.join(evidence,'checks.json'),JSON.stringify({mode:'fake-provider-only',passed:checks,errors,fixture:base},null,2));
  console.log(JSON.stringify({passed:checks.length,checks,evidence},null,2));
} finally { await browser.close(); await service.stop(); }
