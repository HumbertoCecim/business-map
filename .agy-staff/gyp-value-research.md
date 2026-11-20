Status: DONE

## Summary

O **Vault for Founders** (v2.0) não é um aplicativo nem um produto pronto: é uma metodologia com 13 templates Markdown sobre Obsidian, Git/GitHub e instruções globais de agentes locais, exigindo manutenção contínua contra deriva de índice e inflação de contexto. Alternativas comerciais já entregam dados locais, Android e sync E2EE por US$ 4–8/mês (Obsidian Sync e Anytype), enquanto **MCP remoto** com **relay E2EE cego** gera uma contradição técnica se o servidor precisar ler ou buscar arquivos para responder à IA. Do **gstack**, apenas o diagnóstico de demanda (`office-hours`), os cortes de escopo (`plan-ceo-review`) e o ataque a premissas (`ETHOS.md`) são transferíveis a negócios; o próprio gstack afirma que consenso entre modelos não substitui evidência externa. Um teste de até 7 dias sem código novo distingue uso pessoal, serviço de setup e demanda pagante antes de investir em desktop/Android ou E2EE.

## Findings

1. **O que o Vault for Founders entrega, exige e onde falha na memória**
   - **Fatos documentados (`cwlin0131/Vault-for-Founders`, v2.0, 2026-07-05, CC BY 4.0):** não há app ou instalador; entrega guias (`en/README.md`, `setup-guide.md`, `architecture.md`, `optimization-guide.md`) e 13 templates `.md`. Depende de **Obsidian**, **Git + GitHub** (repo privado), plugin **Obsidian Git** (`Vinzent03/obsidian-git`) e agentes locais com Global Instructions (**Claude Cowork**, **OpenClaw** ou **Claude Code**).
   - **Trabalho e atritos documentados:** instalar Git/Obsidian, configurar `git config/init/remote/push`, `.gitattributes`/`.gitignore` e Obsidian Git (sync a cada 30 min); colar Global Instructions **por ferramenta e em cada máquina** (não sincronizam; OpenClaw exige escrita restrita a `openclaw/` para não sobrescrever o `README.md` raiz); conduzir entrevistas para `agent-persona.md`, `decision-style.md` e `voice-and-tone.md`; limpar `memory-summary.md` semanalmente; rodar `vault-audit` e resolver conflitos Git manualmente (`<<<<<<< HEAD` ou `git reset --hard origin/main`, em `git-workflow.md`).
   - **Falhas de memória/retrieval documentadas:** o autor admite que regra única falha (*"Relying on the AI to just 'remember' these rules over time is unreliable"*, `cowork-instructions.md`), exigindo 4 camadas de defesa (`Forced Rules`, `after-action.md`, `vault-audit.md`, `README.md`). Os 3 arquivos lidos em todo boot (`README.md`, `agent-persona.md`, `memory-summary.md`) cobram uma *"fixed attention tax"*, degradam se incharem e causam omissão silenciosa (*"Agent confidently misses something important"*, `vault-audit.md`) ou decisões erradas por memória obsoleta (`optimization-guide.md`). Após ~10 arquivos/pasta, depende de `INDEX.md` e 3 campos YAML.
   - **Karpathy LLM Wiki e FounderOS (fatos documentados):** o gist de Karpathy (`llm-wiki.md`) é uma ideia abstrata (*"idea file"*) com o mesmo padrão: fontes imutáveis, wiki Markdown mantida pelo LLM (`index.md` + `log.md`), schema (`CLAUDE.md`/`AGENTS.md`), *lint* e busca local opcional (`qmd`). Já `Bennettxai/FounderOS` (MIT) é outro produto: painel web local em Next.js 14 + SQLite (`better-sqlite3`) + `d3-force` em `localhost:4100` (CRM, inbox, finanças, agentes e CLI opcional `gbrain`), não um cofre leve de templates.
   - **Não testado:** não executamos o Vault for Founders em uso real; o atrito acima vem da documentação e dos SOPs do repositório.

2. **Alternativas comerciais próximas já cobrem "dados locais + Android + E2EE"**
   - **Obsidian + Obsidian Sync** (`obsidian.md/pricing`, `obsidian.md/sync`, consulta 2026-11-18): app gratuito (Windows/macOS/Linux/iOS/Android) sem conta. Sync custa **US$ 4/mês anual** (US$ 5 mensal) no Standard (1 vault, 1 GB, 1 mês de histórico) ou **US$ 8/mês anual** (US$ 10 mensal) no Plus (10 vaults, 10 GB), com **E2EE AES-256** e `.md` portáteis, sem Git manual. Não traz IA, processos de negócio nem MCP nativo (depende de agentes locais ou plugins comunitários no desktop).
   - **Anytype** (`anytype.io/pricing`, `github.com/anyproto/anytype-mcp`, consulta 2026-11-18): local-first com **E2EE**, apps desktop e Android nativos; Free (100 MB remoto), Plus **US$ 4/mês** (1 GB), Pro **US$ 8/mês** (10 GB), Ultra **US$ 16/mês** (100 GB; -20% anual) ou self-hosting grátis. Traz objetos/relações e MCP oficial (`@anyproto/anytype-mcp`), mas conectado localmente a `http://127.0.0.1:31009` (desktop) ou `anytype-cli` (`31012`), não a relay remoto.
   - **Inferência:** "dados locais + Android + E2EE" já existe a US$ 4–8/mês. Sem prova de que o mapa de 5 níveis ou a ausência de setup gerem valor superior, construir sync E2EE + Android apenas replica commodity.

3. **O que do `gstack` é transferível a negócios vs. exclusivo de engenharia**
   - **Transferível:** em `office-hours` (`phase-2a-startup-diagnostic.md`), as **6 perguntas forçadas** (*Demand Reality, Status Quo, Desperate Specificity, Narrowest Wedge, Observation & Surprise, Future-Fit*), regras anti-adulação (*"Interest is not demand"*, *"Watch, don't demo"*, *"Surveys lie. Demos are theater"*) e os modos de escopo de `plan-ceo-review` (*Expansion/Hold/Reduction*), além de *Search Before Building* e *Attack the Premise* (`ETHOS.md`).
   - **Só engenharia:** `/plan-eng-review`, `/review`, `/qa`, `/verify`, `/ship`, `/land-and-deploy`, `/cso`, `/canary`, `/benchmark` e `/browse` dependem de diffs Git, testes, browser e CI. *"Boil the Ocean"* (`ETHOS.md`) pressupõe custo marginal quase zero de código/testes; **inferência:** aplicá-lo a produto sem demanda validada multiplica desperdício (*"Most wasted work in this craft is excellent work on a false premise"*).
   - **Agentes vs. evidência externa:** `ETHOS.md` adverte (*"Agreement is signal, not proof"*). Debate entre modelos aponta furos lógicos, nunca disposição a pagar ou retenção.

4. **Condições técnicas mínimas para local + Android + E2EE + MCP remoto**
   - **TLS no relay ≠ E2EE:** TLS cifra apenas o transporte; se o relay descriptografa para indexar ou executar MCP, não há E2EE ponta a ponta.
   - **Contradição "servidor cego + MCP remoto":** pela spec MCP (`modelcontextprotocol.io/specification/2025-06-18/basic/authorization`), MCP remoto HTTP usa OAuth 2.1 para clientes externos. Logo: (a) se o MCP roda no relay/nuvem, ele precisa das chaves/texto claro para responder — acessa dados e resultados MCP (quebra E2EE); (b) se o MCP roda **no dispositivo do usuário** para manter o relay cego, o dispositivo precisa estar **ligado, online e alcançável** durante a consulta; (c) os **resultados retornados ao provedor de IA** chegam sempre em texto claro à API/chat do provedor.
   - **Limites do Android (`developer.android.com`):** **Doze mode** e **App Standby Buckets** adiam tarefas em background (`WorkManager`/`JobScheduler`) para janelas esparsas. Um Android ocioso não sustenta servidor MCP sempre ativo sem foreground service/FCM, nem executa fluxos CLI (Claude Code/Git) com a ergonomia do desktop.
   - **Contraste SaaS:** o Notion (`notion.com/pricing`, `developers.notion.com/guides/mcp/overview`) entrega MCP remoto oficial (`mcp.notion.com`) + mobile + IA por **US$ 20/membro/mês** (Business), sem E2EE zero-knowledge.

5. **Três hipóteses e evidência que as distingue (sem números inventados)**
   - **H1 — Necessidade pessoal:** usar Vault for Founders + Obsidian Sync/Git. *Evidência:* em 7 dias reais, você sustenta o método ou abandona o índice?
   - **H2 — Serviço / instalador one-time:** vender setup/onboarding sem nuvem nem Android. *Evidência:* pessoas que já organizam contexto para IA aceitam pagar/agendar para eliminar o setup hoje?
   - **H3 — Produto recorrente (app local + Android + E2EE + MCP):** construir plataforma própria. *Evidência:* usuários reais preferem pagar recorrência pelo mapa de 5 níveis + MCP em vez de Obsidian/Anytype/Notion?

## Details

### Comparação rápida (fontes em 2026-11-18)

| Solução | Memória / Arquivos | Processos / IA | Interface / Mobile | Execução / Sync | Preço oficial (2026-11-18) |
|---|---|---|---|---|---|
| **Vault for Founders (v2.0)** | `.md` locais + `README`/`INDEX.md` + YAML | Persona, `after-action`, `vault-audit` (agente externo) | Obsidian desktop | Manual + Obsidian Git (30 min) + GitHub privado | Grátis (CC BY 4.0) |
| **Obsidian + Obsidian Sync** | `.md` locais portáteis | Sem IA/MCP nativo (agentes/plugins externos) | Desktop + Android/iOS | **AES-256 E2EE** nativo offline-first | App grátis; Sync **US$ 4–8/mês** (anual) |
| **Anytype** | Objetos tipados + relações locais | Sem workflow de fundador; MCP local (`127.0.0.1:31009`) | Desktop + Android/iOS | **E2EE** (rede Anytype ou self-host) | Free (100 MB); **US$ 4 / 8 / 16/mês** |

### Teste de até 1 semana (máx. 7 dias, zero código novo)

1. **Dias 1–2 (H1):** configure só o mínimo do Vault (`README.md`, `agent-persona.md`, `memory-summary.md` + 1 pasta `context/`) no Obsidian com Sync ou Git em 1 máquina. Use em trabalho real e anote atritos e falhas de memória.
2. **Dias 3–5 (H2 vs. H3):** entreviste **5 fundadores/autônomos** que já usam IA semanalmente (sem pedir elogio à UI). Aplique Q1–Q3 do `gstack` (*como guardam contexto, quanto tempo perdem, pelo que já pagam?*), ofereça configurar o fluxo em 30 min e observe onde travam sozinhos e se pagariam.
3. **Dias 6–7 (Decisão para o Opus):**
   - Abandonou o Vault e nenhum dos 5 sente dor urgente → **pare / não construa** app local, Android ou E2EE.
   - O Vault + Obsidian Sync resolveu **sua** dor → **pare em H1**.
   - Terceiros querem pronto e travam no setup → teste **H2** antes de escrever infraestrutura.
   - Só avance para **H3** se houver puxão concreto pelo mapa de 5 níveis + MCP que Obsidian e Anytype não atendam.

### Fontes consultadas (2026-11-18)

1. Vault for Founders: https://github.com/cwlin0131/Vault-for-Founders
2. Karpathy LLM Wiki: https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
3. gstack (`README.md`, `ETHOS.md`, `office-hours`, `plan-ceo-review`): https://github.com/garrytan/gstack
4. FounderOS: https://github.com/Bennettxai/FounderOS
5. Obsidian Pricing & Sync: https://obsidian.md/pricing e https://obsidian.md/sync
6. Anytype Pricing & MCP: https://anytype.io/pricing e https://github.com/anyproto/anytype-mcp
7. Notion Pricing & MCP: https://www.notion.com/pricing e https://developers.notion.com/guides/mcp/overview
8. MCP Authorization & Android Doze: https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization e https://developer.android.com/training/monitoring-device-state/doze-standby

## Unverified / open questions

- **Uso prático não testado:** não instalamos nem rodamos Vault for Founders, `obsidian-git`, `anytype-mcp` ou Claude Cowork; estabilidade diária, conflitos práticos e latência não foram medidos.
- **Demanda do GrowYourPlan:** não há entrevistas, observação sem ajuda (*watch, don't demo*) ou testes de pagamento que separem atração pela UI de necessidade pelo mapa de 5 níveis ou por MCP/E2EE.
- **Plugins MCP de terceiros para Obsidian:** confirmamos pela busca no domínio `obsidian.md` a existência de plugins comunitários (Local REST API + wrappers MCP), sem auditar código ou suporte móvel.
