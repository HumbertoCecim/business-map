# M1 e M2 — baseline, compatibilidade e prova do túnel

Data: 19 de novembro de 2026. Referência: [PLUGIN-MVP.md](PLUGIN-MVP.md), frentes M1 e M2.

Estado (20/11): M1 concluído. No M2, a leitura e a proposta pelo ChatGPT web funcionaram de verdade, com dados fictícios. O critério "erro claro com túnel desligado" ficou **parcial**: o ChatGPT mostra erro 429, sem dado vazio, mas a mensagem não explica a causa. Isso vira requisito do M7 (seção 4).

## 1. Ficha de runtime e base

| Item | Valor observado | Como foi obtido |
|---|---|---|
| Branch / HEAD | `feat/ui-01` @ `8aac5e3a305cbaedc40ccfac5debf94c2d9f820e` | `git log` |
| Alterações locais | Só pastas não rastreadas: `.agy-staff/`, `design-lab/`, `docs/plans/`. Nada rastreado foi alterado. | `git status --short` |
| PR UI-01 | #2 "Refine map interface and preserve desktop layouts", **draft**, aberta contra `main`, head = HEAD local | `gh pr view` |
| Paseo app/daemon | **0.16.1** (Desktop em `C:\Program Files\Paseo`, daemon `127.0.0.1:6767`, terminal-worker 0.16.1) | `paseo --version`, `daemon.log` |
| SDK no repositório | `@getpaseo/plugin`, `client`, `protocol` = **0.15.4** | `package.json` |
| Manifest | `requirements.paseo: ">=0.15.4 <0.16.0"` | `paseo-plugin.json` |
| Plugin instalado no Paseo | `business-model-board` a partir de `%LOCALAPPDATA%\BusinessMap\releases\0.5.0` — **status `failed`**: "requires Paseo >=0.15.4 <0.16.0. Your daemon is 0.16.1" | `paseo plugin ls` |
| Serviço Business Map real | Nenhum ativo. Um registro antigo em `~/.business-map` aponta para um processo que não existe mais. Não foi tocado. | só nomes de arquivos, PID e URL; sem tokens |
| CLI `business` global | Não está no PATH. O teste usa `build/cli.mjs` com caminho absoluto. | `which business` |
| Node / npm | 22.22.3 / 10.9.8 | `node --version` |
| SDK MCP | `@modelcontextprotocol/sdk` ^1.32.2 | `package.json` |

Nenhum serviço, daemon ou plugin de trabalho foi parado, reiniciado ou reconfigurado. A branch não foi trocada.

## 2. Baseline de testes (HEAD `8aac5e3`, sem alteração em arquivos rastreados)

| Check | Resultado |
|---|---|
| `npm run typecheck` | Passou |
| `npm test` no **PowerShell** | Passou: 125/125 |
| `npm run build` | Passou (só avisos de `"use client"` do lucide-react) |

**Falha que já existia, ligada ao ambiente:** `npm test` no **Git Bash** falha em 45/125 testes. O motivo é `whoami.exe /user` em `server/service-runtime.ts`: no Git Bash, o PATH encontra primeiro o `whoami` do MSYS, e não o `C:\Windows\System32\whoami.exe`. O código não tem defeito no Windows nativo, mas depende do PATH. Rode a suíte pelo PowerShell até corrigir isso.

## 3. Decisão de compatibilidade

O Paseo 0.16.1 rejeita o pacote 0.5.0 por causa da faixa de versão do manifest. Para testar, usei uma cópia isolada (`git archive HEAD` em `.local/m1/compat`, que o Git ignora), com SDK 0.16.1 e faixa `>=0.15.4 <0.17.0`:

- `tsc --noEmit`: **1 erro, só em fixture de teste**. Em `server/tests/tools.test.ts:111`, `PluginHookAgent` agora exige `background` e `metadata`. O código de produção compila sem erro.
- Suíte completa com SDK 0.16.1: **125/125**.
- Daemon Paseo 0.16.1 **isolado** (`--home .local/m1/paseo-home`, porta 6797, relay desligado): o plugin foi instalado por diretório, ficou `running` e o log registra "Plugin ready". O daemon principal não foi tocado.
- Ainda não verificado: a renderização do bundle client no app real. Isso exige conectar o app à instância de teste ou fazer o reload no host. Fica para a fatia de compatibilidade.

**Decisão:** fazer uma **fatia exclusiva de compatibilidade 0.16.x** antes de M3. Ela inclui: SDK 0.16.1 em `devDependencies`, faixa do manifest `>=0.16.1 <0.17.0` (ou `>=0.15.4 <0.17.0` se quisermos manter 0.15), a correção do fixture `PluginHookAgent`, typecheck/test/build e inspeção visual do plugin no app. Não é atualização geral, e o pacote instalado em `AppData` não é trocado sem sua confirmação. A 0.17.0 está em beta; ainda não é alvo.

### Resultado da fatia de compatibilidade (20/11)

Consulta prévia ao Claude Opus 5.5 (perfil `Claude - Advisor`): manter pinos exatos, corrigir somente o fixture e evitar migrações ou mudanças de produção nesta fatia. A branch `feat/plugin-mvp` nasceu de `origin/main` em `3b7c207d601f09aa25087c6852ca61b07dc0b9c4`. Antes do checkout, as 13 cópias não rastreadas presentes na main foram conferidas com `git hash-object` contra os blobs de `origin/main`; somente essas cópias idênticas foram removidas. Os arquivos extras foram preservados. A branch `feat/ui-01` permaneceu em `8aac5e3`; sua PR não foi alterada.

- `@getpaseo/plugin`, `@getpaseo/client` e `@getpaseo/protocol`: **0.16.1**, com pinos exatos. O lockfile mudou somente os pacotes `@getpaseo/*`, incluindo o transitivo `relay`.
- Manifest: **`>=0.16.1 <0.17.0`**. Não mantemos a promessa de compatibilidade com 0.15.4 sem validar esse runtime com o novo SDK. A faixa inclui os patches 0.16.x e exclui 0.17.
- Fixture `PluginHookAgent`: `background: false` e `metadata: {}`, conforme o contrato publicado em `@getpaseo/plugin@0.16.1`.
- Revisão das APIs usadas: os registros de painéis, Command Center, `openPanel`, `server.addHook("agent.open.before", ...)` e chamadas do SDK continuam disponíveis. O typecheck de produção e client passou sem outras adaptações. Nenhuma alteração em código de produção, schema, M3 ou UI.

Checks executados pelo PowerShell sobre `3b7c207` com o diff de compatibilidade (`dirty=true`):

| Comando | Resultado |
|---|---|
| `npm ci` | Passou; 436 pacotes instalados, 0 vulnerabilidades reportadas |
| `npm run typecheck` | Passou; os dois projetos TypeScript sem erros |
| `npm test` | Passou: **125/125**, 0 falhas |
| `npm run build` | Passou; avisos de `"use client"` do lucide-react já observados na baseline |

Logs locais: `.local/compat-016/{npm-ci,typecheck,test-powershell,build}.log`. Esses arquivos são ignorados pelo Git. O workpad do card registra os commits e as execuções posteriores.

**Prova do servidor:** a instalação local do Paseo foi atualizada desde a baseline e agora é **0.16.2** (app/CLI e daemon principal). O teste novo usou esse runtime 0.16.x, com os SDKs em 0.16.1; não foi uma nova execução no daemon 0.16.1. Instância isolada iniciada com `paseo daemon run --home .local/compat-016/paseo-home`, `daemon.listen: 127.0.0.1:6798`, relay desligado e plugins habilitados somente nesse home. Instalação por diretório:

```powershell
paseo plugin install 'C:\Users\Humbe\Documents\PluginBusinessCanvas\mvp' --home .local/compat-016/paseo-home --json
paseo plugin ls --home .local/compat-016/paseo-home --json
paseo plugin logs business-model-board --home .local/compat-016/paseo-home
```

Resultado: **`running`**, sem erro de carregamento; log **`[paseo] Plugin ready`** em `2026-11-20T23:55:33.798Z`. Evidências em `.local/compat-016/{plugin-ls,plugin-logs,daemon-stdout,daemon-stderr}.log`.

**Validação visual: aprovada pelo usuário nas quatro combinações (20/11).** O daemon isolado fica ligado para esta etapa. No Paseo, abrir **Settings → Add host → Direct connection**, Host `127.0.0.1`, Port `6798`, SSL desligado. Selecionar esse host, o projeto `visual-check`, o workspace **Compatibilidade 0.16 — teste visual**, e **Ctrl+K → Abrir Business Harness**. A raiz fictícia é `.local/compat-016/visual-check`, sem mapas reais. Conferir as quatro combinações: janela larga/claro, larga/escuro, compacta/claro e compacta/escuro; exigir tela renderizada, texto legível, controles acessíveis e ausência de erro de carregamento do bundle. Não confundir `Plugin ready` do servidor com aprovação visual do client. Referência de conexão: [documentação oficial](https://paseo.sh/docs/connectivity).

**Acompanhamento da navegação (20/11):** o host já estava conectado. O workspace aparece no fim da barra lateral, no projeto **visual-check**. Clique em **Compatibilidade 0.16 — teste visual**; na tela **Nova aba**, escolha **Business Harness**, sem o sufixo “aba anterior”. Esse caminho foi confirmado no app e dispensa Ctrl+K.

Na primeira abertura, o bundle renderizou corretamente o erro de serviço indisponível: faltava iniciar o serviço fictício. O serviço foi iniciado com `BUSINESS_MAP_HOME` isolado, e somente o daemon de teste foi reiniciado com o mesmo ambiente. Depois disso, o painel carregou no app em **desktop/tema escuro**, sem o erro anterior. O formulário **Conectar ao Business Map** é esperado para autorizar gravações. Depois dessa observação, o usuário confirmou explicitamente: “Sim, as quatro combinações funcionaram”. Matriz aprovada: desktop/claro, desktop/escuro, compacto/claro e compacto/escuro. Essa confirmação cobre renderização visual; não significa autorização para atualizar a instalação principal.

Para retomar o ambiente, use dois terminais PowerShell na raiz do repositório. No primeiro, inicie o serviço sem abrir o visualizador; não compartilhe a URL com código temporário que o comando imprime:

```powershell
$env:BUSINESS_MAP_HOME = Join-Path $PWD '.local/compat-016/bm-home'
node build/cli.mjs open --root .local/compat-016/visual-check --no-browser
```

No segundo, defina o mesmo ambiente antes de iniciar o daemon:

```powershell
$env:BUSINESS_MAP_HOME = Join-Path $PWD '.local/compat-016/bm-home'
paseo daemon run --home .local/compat-016/paseo-home
```

O home conserva a instalação e o workspace. Para encerrar apenas os componentes fictícios: `paseo daemon stop --home .local/compat-016/paseo-home` e, com o mesmo `BUSINESS_MAP_HOME`, `node build/cli.mjs stop --root .local/compat-016/visual-check`. O script local ignorado `.local/compat-016/run-daemon.ps1` também define esse ambiente.

**Instalação principal: atualizada com autorização explícita em 21/11.** Após aprovar as quatro combinações visuais, o usuário autorizou “Atualizar com rollback”. O pacote testado de `f694478` foi copiado para `%LOCALAPPDATA%\BusinessMap\releases\0.5.0-paseo016-f694478`; o registro de `business-model-board` passou a apontar para `node_modules/business-map` nessa pasta. O release `0.5.0` ficou intacto. Backup integral em `.local/compat-016/backup-main-0.5.0`, conferido anteriormente por SHA-256 nos 3.779 arquivos; o manifest antigo permaneceu idêntico ao backup depois da troca.

Resultado no daemon principal **0.16.2**, `127.0.0.1:6767`: **`running`**, com **`[paseo] Plugin ready`** em `2026-11-21T14:05:46.573Z`. O daemon manteve PID `23756` e `startedAt` `2026-11-20T16:53:37.357Z`; nenhum reinício. Os demais plugins conservaram ID, caminho, estado e enabled. Evidências locais: `.local/compat-016/main-{plugins-after.json,plugin-logs.log,daemon-before.json,daemon-after.json}`. Nenhum push ou PR foi feito.

A primeira tentativa de registro foi interrompida porque `$ErrorActionPreference = 'Stop'` tratou o aviso normal de confiança da CLI em stderr como erro fatal (`NativeCommandError`). O catálogo foi inspecionado antes de retomar; a instalação foi repetida usando o código de saída da CLI e terminou com sucesso. Nenhum dado de negócio foi alterado. O rollback não precisou ser aplicado após a instalação bem-sucedida.

Se for necessário voltar atrás, remova apenas o registro novo e reinstale o diretório antigo (não apagar nenhuma pasta):

```powershell
$oldPlugin = Join-Path $env:LOCALAPPDATA 'BusinessMap\releases\0.5.0\node_modules\business-map'
paseo plugin remove business-model-board --host 127.0.0.1:6767 --json
paseo plugin install $oldPlugin --host 127.0.0.1:6767 --json
paseo plugin ls --host 127.0.0.1:6767 --json
```

A CLI não substitui uma origem já registrada com o mesmo ID; por isso o rollback remove o registro antes de reinstalar. Isso restaura o estado anterior, que já falhava pela faixa 0.15; não torna o pacote antigo compatível com 0.16. Não reiniciar o daemon principal.

## 4. M2 — prova do túnel

### Pronto e verificado localmente

| Peça | Estado |
|---|---|
| Empresa fictícia | "Padaria Aurora (FICTÍCIA)", raiz `.local/m2/padaria-ficticia`, runtime isolado `BUSINESS_MAP_HOME=.local/m2/bm-home`. Nenhum mapa privado foi lido. |
| `boardId` esperado | `board-a4aff4aa-9476-4f33-992d-54fca12c6ce8` (revisão 1) |
| Proposta existente | `suggestion-7bd90dc5dde88b5f375e33eeb2130a0f` (map_draft pendente, enviado pelo CLI) |
| MCP stdio | `.local/m2/mcp-padaria.cmd`, validado por um cliente MCP SDK: 4 ferramentas (`business_get_context`, `business_query` e `business_read_skill` com readOnly; `business_submit_suggestion` como escrita). `boardId` correto. |
| tunnel-client oficial | `openai/tunnel-client` v0.0.21 windows-amd64, SHA256 `2faf80ae…c575a` conferido com `SHA256SUMS.txt`. Fica em `.local/m2/tunnel-client/` e não foi instalado no sistema. |
| Perfil | `.local/m2/tc-profiles/padaria-ficticia.yaml` (stdio, health em `127.0.0.1:18080`) |
| `doctor` | Todos os checks locais passam. Falta só `control_plane_api_key`. |
| Script | `.local/m2/INICIAR-TUNEL.cmd` (duplo clique), que chama `.local/m2/start-tunnel.ps1 -TunnelId tunnel_…`. Liga o serviço fictício se estiver parado, regenera o perfil, pede a chave de forma oculta (opcionalmente a guarda cifrada por DPAPI em `.local/m2/runtime-key.dpapi`, que só o usuário do Windows consegue ler) e roda `doctor` e depois `run`. |

### Requisitos de conta que dependem de você

1. **Organização na OpenAI Platform** com acesso a Tunnels. Na conta pessoal, use a organização Platform pessoal. Em Enterprise/Edu, o túnel precisa estar associado ao workspace do ChatGPT.
2. **Permissões** na organização: Tunnels **Read + Manage** (para criar o túnel) e **Read + Use** (para rodar o client e escolher o túnel no ChatGPT). Quem concede é o owner ou um admin RBAC. A propagação pode levar até 30 min.
3. **Criar o túnel** em https://platform.openai.com/settings/organization/tunnels e copiar o `tunnel_id` (formato `tunnel_` + 32 hex). O ID não é segredo.
4. **Criar a chave de runtime** em https://platform.openai.com/settings/organization/api-keys, com permissão Tunnels Read + Use. **Não cole a chave no chat.** O script pede a chave no seu terminal.
5. **ChatGPT web:** o plano/workspace precisa permitir custom MCP servers (num workspace, o admin libera). Caminho: https://chatgpt.com/plugins → **+** → **Add custom MCP server** → Connection **Tunnel** → escolher o túnel → Authentication **No authentication** (aceitável só para esta prova com dados fictícios) → **I understand and want to continue** → **Create as a plugin** → instalar. A documentação oficial não diz quais planos (Plus/Pro/Business) dão acesso. Isso precisa ser conferido na sua conta.
6. **Custo:** a documentação não cita cobrança pelo túnel. Exigir uma chave de API não prova que há cobrança de inferência, mas confira o billing da organização.

### Roteiro da chamada real (quando os itens acima estiverem prontos)

1. Dê duplo clique em `.local\m2\INICIAR-TUNEL.cmd` (ou rode `powershell -ExecutionPolicy Bypass -File .local\m2\start-tunnel.ps1 -TunnelId tunnel_<seu_id>`) e deixe a janela aberta.
2. Crie o plugin no ChatGPT **com o túnel rodando**. A descoberta das ferramentas depende disso.
3. Numa conversa nova: `@<plugin>` e "Leia o contexto do negócio e me diga o boardId e a revisão". Esperado: `board-a4aff4aa-9476-4f33-992d-54fca12c6ce8`.
4. Peça um insight fictício (por exemplo, "proponha um insight sobre fornadas extras às 6h"). O ChatGPT vai pedir confirmação para **enviar**. Isso não aplica a proposta ao negócio.
5. Eu confiro localmente (`business context`) se a nova proposta ficou pendente e registro o ID.
6. Feche o túnel (Ctrl+C), repita uma chamada e registre o erro exibido.

Inspector, localhost e screenshot da configuração **não** contam como a chamada real (aceite do M2).

### Ocorrência na 1ª tentativa (19/11)

Ao criar o plugin, o ChatGPT mostrou "Um serviço necessário para criar o aplicativo está temporariamente indisponível". As métricas do `tunnel-client` mostraram que o `server/discover` **chegou** pelo túnel e voltou com `tunnel_service_status=502` em cerca de 0,3 s. A causa é que o `tunnel-client` divide `--mcp-command` no estilo shell POSIX e remove as `\` de caminhos Windows (`C:Users<usuário>…mcp-padaria.cmd`), então o processo MCP morria ao iniciar. Para corrigir, o caminho vai entre aspas simples: `cmd.exe /d /c 'C:\…\mcp-padaria.cmd'`. A correção foi validada com `tunnel-client dev proxy` (control plane local em memória) e um cliente MCP HTTP: 4 ferramentas e `boardId` correto. O assistente de conexão do M7 precisa gerar o comando já com essas aspas.

### Resultado no ChatGPT web (19–20/11)

- **Leitura: aceita.** O plugin "GYPtesting" executou `business_get_context` pelo túnel e exibiu `board-a4aff4aa-9476-4f33-992d-54fca12c6ce8`, revisão 1 e 1 pendente. Pelas métricas do `tunnel-client`, `server/discover`, `tools/list` e `tools/call` voltaram 200, e houve 1 `tools/call` com **409** antes do sucesso (causa ainda não investigada).
- **Proposta: aceita (20/11, 23:22).** O ChatGPT chamou `business_submit_suggestion` pelo túnel e devolveu `suggestion-cf7fdc1aca8ef7d10a2ad01ed1a13c50`. No `board.json` local, o board passou da revisão 1 para a 2 e a proposta ficou **pendente**, com `kind: insight`, título "Testar uma fornada extra às 6h", `requestId` `insight-fornada-06h-20261120-934b7e120c4f`, `baseRevision` 1, origem autodeclarada `chatgpt:gyp-insight` e recibo gravado. Nenhum conteúdo confirmado mudou (0 seções). O ChatGPT pediu confirmação para **enviar**, e isso não aplicou nada ao negócio. Nas métricas, os `tools/call` voltaram com 200 e houve de novo **um 409** antes do sucesso. O padrão se repetiu nos dois dias e precisa ser investigado antes do M7.
- Antes do envio, em 20/11, o serviço fictício (pid 48576) foi encontrado parado, sem reinício do Windows (houve suspensão às 00:44), e com um `service.owner.json` órfão. `business open` recuperou o serviço sem perda (pid 5608, mesmo `boardId`). Requisito para o M4: um serviço parado depois de suspensão precisa aparecer como indisponível e ser recuperável pelo plugin.
- **Túnel desligado:** o ChatGPT retornou erro **429**. Não apareceu dado vazio nem inventado, o que é bom. Mas 429 ("too many requests") não explica que o computador ou o túnel estão offline, então o critério "erro claro" ainda não está atendido. O M7 deve mostrar o estado do túnel separado e orientar o usuário.

## 5. Esboço das abas (orienta M5/M6; sem placeholders de funções futuras)

```
┌ Business Map · Padaria Aurora (fictícia) · projeto/pasta ─────────── ● Serviço conectado ┐
│ [Painel] [Áreas/Mapa] [Ideias] [Sessões e decisões] [Conexão]                            │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ PAINEL                                    │ IDEIAS                                       │
│ ┌ Indicador ─────┐ ┌ Lista ────────────┐  │ Filtro: Aberta·Explorando·Adiada·Rejeitada·  │
│ │ Fornadas/dia   │ │ Propostas         │  │         Adotada   [+ Nova ideia]             │
│ │ 4 un · manual  │ │ pendentes (2)     │  │ ┌ Fornada extra às 6h ─── explorando ─────┐  │
│ │ nov/26 · fonte │ │ › Insight 6h      │  │ │ 2 fontes · sessão "Manhãs" · ↗ histórico│  │
│ └ ↑ ↓ ✕ ─────────┘ └ ↑ ↓ ✕ ────────────┘  │ └ [Adiar (motivo)] [Rejeitar (motivo)] ───┘  │
│ ┌ Nota ─────────────────────────────────┐ │ Pendentes do ChatGPT/agente → Revisar ›      │
│ │ "Testar só às terças"                 │ │ Vazio: "Nenhuma ideia ainda. Registre uma    │
│ └───────────────────────────────────────┘ │  ou peça a um agente para propor."           │
│ [+ Bloco: Indicador | Lista | Nota]       │                                              │
│ Vazio: "Painel vazio — adicione um bloco."│                                              │
├───────────────────────────────────────────┼──────────────────────────────────────────────┤
│ ÁREAS/MAPA                                │ SESSÕES E DECISÕES                           │
│ Mapa nativo atual (preservado), foco e    │ [+ Sessão: objetivo + agente do Paseo]       │
│ áreas livres; inspetor à direita.         │ Sessão "Manhãs" · Claude · ativa             │
│                                           │  ideias ligadas (1) · decisões (0)           │
│                                           │  [Abrir chat no Paseo] [Encerrar sessão]     │
├───────────────────────────────────────────┴──────────────────────────────────────────────┤
│ CONEXÃO                                                                                  │
│ Serviço local ● ativo   Cliente do túnel ○ parado   Autorização ○ sem grant              │
│ Última chamada remota válida: —        (readyz saudável ≠ integração comprovada)         │
│ Passos: 1 Empresa ✓ → 2 Conceder acesso limitado → 3 Túnel/conta oficial → 4 Testar     │
│ [Revogar acesso]  [Parar cliente]  (desligar no ChatGPT é feito no ChatGPT)              │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

Estados globais: sem serviço / iniciando / precisa parear / conectado / incompatível / erro recuperável (M4). Em largura compacta, as abas viram uma lista rolável e o inspetor vira uma folha. Os rascunhos ficam preservados.

## 6. Evidências e limpeza

- Logs: `.local/m1/{typecheck,test,test-ps,build}.log`, `.local/m1/compat-*.log`, `.local/m1/paseo-iso-daemon.log`. Pasta ignorada pelo Git, sem segredos.
- O daemon Paseo isolado (porta 6797) foi parado depois da prova. O daemon principal continua sem alterações.
- O serviço fictício do M2 continua ativo para o teste (o script reutiliza ou inicia). Para encerrar: com `BUSINESS_MAP_HOME=.local\m2\bm-home`, rode `node build\cli.mjs stop --root .local\m2\padaria-ficticia`.
- Tudo em `.local/` é local e não versionado: o `tunnel-client`, o perfil, os scripts, a base fictícia e a chave cifrada. Para refazer o setup em outra máquina, siga a seção 4. Para "esquecer" a chave, apague `.local/m2/runtime-key.dpapi`. A chave também pode ser revogada em https://platform.openai.com/settings/organization/api-keys.
- No ChatGPT ficou criado o plugin de teste "GYPtesting" (Tunnel, No authentication). Ele só funciona com a janela do túnel aberta. Para remover, use https://chatgpt.com/plugins.
- Lição registrada na memória do projeto: o `tunnel-client` remove `\` de `--mcp-command`, então use aspas simples no caminho Windows.

## 7. Situação dos critérios e próxima etapa

| Critério | Situação |
|---|---|
| M1: baseline, compatibilidade, raiz fictícia, esboço | Concluído |
| M2: chamada real `business_get_context` com `boardId` correto | Concluído (19/11) |
| M2: proposta pendente visível localmente, com ID | Concluído (20/11, `suggestion-cf7fdc1aca8ef7d10a2ad01ed1a13c50`) |
| M2: erro claro com túnel desconectado | Parcial: erro visível (429), mas sem mensagem explicativa. Vira requisito do M7 |

Pendências que seguem para as próximas frentes:

1. **Fatia de compatibilidade Paseo 0.16.x** (seção 3): SDK, fixture, checks e servidor isolado aprovados. Inspeção visual aprovada pelo usuário nas quatro combinações e atualização principal autorizada concluída em 21/11, com running/Plugin ready e rollback preservado. Fatia concluída antes do M3.
2. **M3:** schema v4, congelamento do contrato v3 usado pelo `cloud/` e migração protegida (PLUGIN-MVP.md §M3).
3. **M4:** serviço parado depois de suspensão do PC deve aparecer como indisponível e ser recuperável, incluindo `service.owner.json` órfão.
4. **M7:** perfil remoto restrito, aspas no `--mcp-command`, estado do túnel separado (429 ≠ "sem dados"), investigação do 409 recorrente no primeiro `tools/call`.
5. Ideias abertas no card: `whoami.exe`/`icacls.exe` por caminho absoluto, investigação do 409, prova de widget visual (MCP App) no ChatGPT.

**Base para a próxima etapa:** a `main` (com estes documentos). A branch `feat/ui-01` (PR #2, draft) só altera a UI do `cloud/` e não toca `shared/`, `server/`, `local/` nem `web/`. Por isso o MVP do plugin pode nascer da `main` sem integrar a UI-01 sem querer.
