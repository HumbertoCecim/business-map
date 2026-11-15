# Business Harness 0.4

Plugin nativo do Paseo para pensar um projeto na conversa e manter suas áreas, cards, decisões e próximos passos à vista. O chat do Paseo é a conversa principal; o quadro acompanha no Explorer. Todos os workspaces e worktrees do mesmo projeto compartilham o conteúdo, sem um canvas empresarial obrigatório.

## Instalar e abrir

Requer Paseo **0.15.4** no daemon e no aplicativo (`>=0.15.4 <0.16.0`). Para desenvolver:

```powershell
npm.cmd install
npm.cmd run typecheck
npm.cmd test
paseo plugin install .
```

A instalação usa o daemon selecionado pelo CLI. Para testar isoladamente, acrescente `--host <endpoint-do-daemon>`. Este projeto não instala nem ativa o plugin automaticamente no daemon principal. Use recarregar na lista de plugins após alterar o código.

Na conversa nativa do Paseo, use a pill **Criar Business Canvas** (projeto ainda sem board salvo) ou **Abrir Business Canvas**. O painel abre no Explorer desta conversa, mantendo o chat. Se o arquivo ou a raiz não puderem ser verificados, a pill mostra **Business Canvas: verificar**; isso não é tratado como um board vazio.

O Command Center do workspace também oferece **Abrir Business Harness**, com o fluxo anterior disponível. **Expandir** abre **Panorama / Ateliê / Bússola / Canvas**, quatro apresentações dos mesmos dados. **Abrir conversa** retoma o agente vinculado no seu workspace real, inclusive em outro worktree do projeto.

O pacote local contém fontes e documentação; o Paseo compila TypeScript ao carregar. Extraia e instale a pasta `package`:

```powershell
New-Item -ItemType Directory -Path BusinessHarness
tar -xzf dist/paseo-business-harness-0.4.0.tgz -C BusinessHarness
paseo plugin install (Resolve-Path BusinessHarness/package).Path
```

Não é necessário instalar dependências de desenvolvimento para usar o pacote no host compatível. O CLI 0.15.4 não oferece um comando separado de build/validate de plugin; as verificações deste projeto são TypeScript, testes e carregamento no daemon isolado.

## Primeira conversa

1. Abra uma conversa nativa e toque em **Criar Business Canvas**. A entrada **Vamos trabalhar nesta conversa** informa o projeto de destino; preencha o nome do negócio e o objetivo. Abrir a pill não cria agente, não salva o board e não envia mensagens.
2. Se quiser, use **Selecionar ou importar skills (opcional)**. A biblioteca mantém a prévia completa, confirmação e seleção explícita de versões. Ou use **Continuar sem skills**. Nomes e o catálogo `agent.commands()` permanecem **não lido** até a versão completa ser importada e lida.
3. Confirme **Iniciar sessão**. Nome, vínculo com esta conversa, seleção de versões e sessão são salvos em uma operação com revisão/fingerprint e `requestId` idempotente. Depois, somente com o agente ocioso, as ferramentas são vinculadas e a primeira pergunta é enviada ao mesmo chat. As áreas e candidatas ficam visíveis no painel ao lado; as abas Agente/Sessão não são necessárias para começar.
4. Responda no chat do Paseo. O modo de perguntas usa o conteúdo confirmado para perguntar uma coisa por vez. **Pausar perguntas** muda a orientação do próximo turno; para interromper uma geração já em curso, use **Parar** no chat nativo.
5. Para retomar, use **Abrir conversa** ou **Retomar conversa**. Objetivo, agente e versões de skills da sessão ficam registrados. Fechar o painel/app não encerra a sessão e não faz uma chamada ao modelo.
6. Em **Encerrar esta sessão**, peça um resumo candidato ou escreva um encerramento manual. Revise resumo, onde retomar e cada decisão; desmarque o que não deve entrar. Só **Confirmar resumo e encerrar** grava esses itens.

**Abrir Business Canvas** em um projeto já salvo mostra a sessão e permite retomar ou iniciar outra explicitamente. Abrir nunca muda o vínculo nem envia ao modelo. Uma sessão aberta em outra conversa bloqueia a troca até seu encerramento humano. Conversa ocupada preserva o rascunho e pede espera; o plugin não para o turno. Se o salvamento passou e o envio falhou, a sessão fica salva e **Enviar primeira pergunta** tenta apenas o envio. Diante de resultado incerto, confira o chat e confirme a tentativa; o plugin não reenvia automaticamente. O `messageId` é estável e o daemon 0.15.4 deduplicou envios repetidos no teste, sem promessa de entrega exatamente uma vez após falhas ou reinícios.

O plugin mantém um agente vinculado por vez. Arquivar a conversa remove sua pill; o board, o vínculo histórico e a sessão permanecem preservados. O encerramento manual continua acessível no quadro expandido. O fluxo anterior para criar um agente nativo com provider/modelo/permissões ou escolher um agente do projeto permanece na aba **Agente**.

Capturas reais no Paseo, com projeto fictício: [entrada guiada](docs/screenshots/chat-entry-onboarding.png), [sessão e quadro no tema claro](docs/screenshots/chat-entry-session-light.png), [tema escuro](docs/screenshots/chat-entry-session-dark.png) e [largura estreita](docs/screenshots/chat-entry-narrow.png).

Para experimentar o caminho completo, siga o [guia de primeiro uso](docs/primeiro-uso.md).

## Skills completas e versões

Informe a pasta absoluta que contém `SKILL.md`. A prévia mostra nome, descrição, texto integral, avisos e manifesto de **todos** os recursos (caminho relativo, bytes e SHA256). Confirmar importa a árvore para:

```text
.business-board/skills/<skillId>/<treeHash>/
  manifest.json
  files/SKILL.md
  files/references/...
  files/scripts/...
  files/assets/...
```

Metadados `.git` de um clone são ignorados com aviso. Links simbólicos/junctions internos, colisões de nomes/case, caminhos inválidos e arquivos especiais são recusados. A origem é resolvida para sua pasta real; aliases em ancestrais da origem são aceitos. Os destinos canônicos recusam links. Limites: 400 arquivos, 2 MB por arquivo e 20 MB por pasta. Scripts e binários são copiados byte a byte e **não são executados na instalação/importação**.

Para skills externas, peça ao agente que pesquise e baixe o pacote completo, com sua origem. Depois revise a mesma prévia local e confirme; não existe uma instalação global ou download implícito pelo plugin.

**Criar ajuste desta versão** abre o SKILL.md completo e exige um motivo. A prévia mostra as diferenças; todos os recursos restantes são preservados e o original permanece intacto. Derivar a partir de uma versão com descendentes avisa para revisar a base. Um ajuste deve partir da versão ativa da sessão para manter adaptações anteriores; ramificações conscientes continuam possíveis. Um texto idêntico ou uma árvore já registrada não cria outra versão: selecione a existente.

Depois de importar ou aceitar um ajuste, use **Selecionar esta versão → Confirmar skills ativas**. A seleção é explícita e atualiza os próximos turnos da sessão aberta, preservando as versões iniciais no histórico. A importação sozinha não troca a orientação da conversa. **Exportar pasta completa** produz uma pasta utilizável com todos os recursos em `.business-board/skills/exports/<skillId>/<treeHash>`.

A ferramenta `business_read_skill` verifica os hashes e fornece `canonicalSkillRoot`/`canonicalResourcePath`. O agente deve resolver referências, scripts e assets a partir dessa raiz, nunca da pasta original nem de cópias em worktrees. Quando uma tarefa autorizar usar um script, são as ferramentas normais do agente e suas permissões que o executam; saídas devem ir ao workspace. O plugin não executa scripts. Alteração externa de recurso é recusada como `externally_modified`.

## Quadro e revisão humana

- Áreas, títulos e perguntas são livres. Cards têm texto, primeiro passo e opções Agora/Depois, concluído, importante e urgente. Reordenação, movimento e exclusão ficam em ações progressivas.
- A pessoa escolhe 1,3 ou5 cards de foco ou oculta a faixa. O agente nunca escolhe a prioridade. Concluir/excluir remove o card do foco.
- **Onde parei** guarda a retomada; **Decisões** guarda contexto durável e decisões justificadas com alvo no quadro, área ou card.
- Insights ficam vinculados aos seus alvos e separados do texto humano. Manter conserva a dica; descartar a arquiva; incorporar abre uma edição humana com a sugestão como referência.
- Estruturas sugeridas abrem uma prévia com títulos/perguntas editáveis e itens desmarcáveis. Um card candidato abre um **novo** card revisável, sem reescrever o card humano anterior e sem entrar no foco.
- Áreas e cards criados a partir de candidatas guardam sua sugestão de origem. Edições humanas posteriores preservam esse vínculo; consulte **Mais ações** para distinguir a origem confirmada da autoria humana direta.
- Candidatas de importação/ajuste de skill e resumo de sessão abrem suas revisões próprias. Nenhuma ferramenta confirma decisões, texto, foco ou skill ativa.

Panorama oferece a grade; Ateliê dedica uma faixa lateral a foco, dicas e decisões; Bússola destaca o primeiro passo manual e o índice completo. **Canvas** reúne as áreas numa folha com divisórias finas e notas resumidas. Com 7–9 áreas, distribui a ordem existente em cinco colunas superiores e dois blocos largos inferiores; outras quantidades usam linhas equilibradas. A posição não depende do nome da área e nenhum framework é aplicado. Em telas estreitas, a folha vira uma lista ou duas colunas de resumos.

No Canvas, toque no título de uma área ou numa nota para abrir o editor existente, fora da folha. **Abrir área** e **+N · ver todas** mostram todos os cards; as prévias não descartam conteúdo. A borda de foco e os marcadores Agora/Depois/Importante/Urgente refletem escolhas humanas. Propostas pendentes têm tracejado e não se tornam notas confirmadas automaticamente; áreas propostas aparecem separadas como blocos de prévia. Essa distinção de autoria não classifica uma hipótese como evidência validada. Retomada e foco ficam em controles progressivos na barra compacta.

A preferência visual fica no estado da aba Paseo, fora do JSON do conteúdo. Trocar de apresentação não altera ordem, texto, foco ou revisão do board e mantém os rascunhos compartilhados. O painel lateral compacto usa os mesmos componentes de áreas e editores. As entregas 0.2 e 0.3 permanecem preservadas em `dist/`.

**Exportar Markdown** grava `.business-board/board.md` com áreas, cards, foco, retomada, insights mantidos, memórias, versões de skills e sessões. O texto fica disponível para copiar.

## Dados, migração e conflitos

O board canônico é **`<raiz registrada do projeto>/.business-board/board.json`**. O SDK resolve workspace→projectId→projectRootPath; não há fallback para o cwd do worktree. Raiz indisponível gera erro recuperável. O `boardId` é portátil; IDs de agentes e paths de origem são referências locais ao host.

O JSON usa **schemaVersion:2**, revisão crescente e IDs estáveis. Arquivos v1 são lidos sem alteração. A primeira gravação preserva os bytes v1 em **`board.v1.backup.json`** e grava v2. Esse backup de migração não é rotacionado. `board.backup.json` continua guardando o estado válido anterior a cada gravação. **A versão 0.1 não lê schema 2**; para downgrade, guarde uma cópia completa e restaure conscientemente o backup v1, que não inclui alterações posteriores.

Uma única store/reducer atende RPCs e tools. Escritas serializadas por raiz canônica exigem revisão e fingerprint do arquivo e usam temporário+rename. Corrupção, remoção do arquivo conhecido e alterações externas são mostradas sem apagar o último estado válido.

Rascunhos de editores, skills e encerramentos são compartilhados em memória entre superfícies/worktrees do mesmo **host+projeto**. Abrir uma segunda superfície não os reinicializa. Outro projeto/host tem estado separado. Conflitos preservam o rascunho e exigem comparar/revisar a base atual antes de salvar. **Recarregar/fechar o cliente perde rascunhos não salvos**; sessões e conteúdo já confirmados persistem no arquivo.

Árvores são copiadas, verificadas e renomeadas antes de registrar sua versão no board. Uma falha/conflito pode deixar uma pasta de staging ou versão ainda não referenciada. Não há limpeza automática desses materiais, para evitar apagar recursos ainda úteis ou referenciados.

## Ferramentas do agente

Somente o agente explicitamente escolhido recebe as ferramentas em `agent.open.before`; o opt-in e o escopo são rechecados em cada execução:

- `business_get_context`: board e sessão lógica atuais, conteúdo humano, foco, decisões, candidatas e seleção de versões.
- `business_read_skill`: texto integral ou recurso manifestado de uma versão confirmada, verificação de hash e caminhos canônicos.
- `business_submit_suggestion`: `insight`, `structure`, `memory`, `skill_import`, `skill_adjustment`, `card_draft` ou `session_summary`. Captura a autoria no servidor, exige revisão base e `requestId` idempotente. Retry idêntico não duplica; reutilizar o ID com outro conteúdo é recusado.

O hook não interrompe turnos. Vincular recarrega somente um agente ocioso. A opção de até duas notas úteis orienta o próprio turno; não há segunda chamada de modelo ou hook pós-turno. O plugin usa exclusivamente o provider do agente nativo, sem infraestrutura de IA própria.

Depois de recarregar o plugin durante desenvolvimento, use **Vincular ferramentas (ocioso)** antes de continuar uma sessão já aberta. Definições de ferramentas de uma instância anterior podem ter sido descartadas pelo host. Não recarregue o plugin durante um turno em curso.

## Arquitetura e limites

`client/` contém React Native, entrada por conversa/pills, biblioteca, sessões, temas/layouts e rascunhos. `shared/` reúne schemas, reducer puro, contratos RPC, observações agrupadas, estado transitório e exportação. `server/` resolve projeto, persiste arquivos, gerencia árvores de skills e coordena confirmação/envio. `conversation.start` usa a mesma store/reducer; `conversation.deliver` verifica sessão/agente e registra a tentativa e confirmação do envio. A RPC genérica recusa esses comandos reservados.

```powershell
npm.cmd run typecheck
npm.cmd test
```

Os testes cobrem domínio, CRUD/foco/autoria, memórias, sessões e seleção ativa, migração/backup, concorrência/fingerprint/idempotência, isolamento de projeto/host, árvores completas, recursos binários/scripts inertes, derivação/exportação e guardas de caminhos. Há testes da fronteira RPC/tools e compatibilidade de componentes nativos.

Uma observação owned da lista nativa acompanha conversas existentes e novas, com paginação, arquivamento/remoção e snapshots após reconexão. O cleanup aborta a descoberta pendente, libera a observação e remove suas pills. Leituras do board são agrupadas por host/projeto entre pills e painéis, com polling a cada seis segundos e publicação após ações locais. Não há um timer ou consulta global de agentes por conversa. Erros mantêm o último snapshot e os rascunhos; uma leitura antiga em trânsito não substitui uma alteração já confirmada.

Não há mesclagem automática, sincronização remota de rascunhos ou bloqueio transacional contra outros programas/daemons que escrevam simultaneamente. Guardas e hashes não são uma sandbox contra um agente autorizado a editar arquivos por fora. Imutabilidade é uma regra do plugin; modificações externas são detectadas ao ler.

O SDK 0.15.4 não oferece chat embutível nem cancelamento de turno via handle. Por isso usamos navegação/chat/Stop nativos. Recarregar uma sessão ocupada interromperia o turno e é recusado pelo plugin. Providers podem não listar comandos/skills/modelos/modos ou retornar erro; o vínculo com agente criado no fluxo nativo continua disponível. Não há operações Git, integrações GitHub/Operately/Fibery ou framework empresarial fixo.

O SDK não oferece uma operação atômica “vincular/enviar somente se ocioso”. O plugin verifica o estado antes de vincular e novamente antes de enviar; ainda existe uma janela de concorrência entre essas operações. O envio inicial usa `activeTurnBehavior: steer`: se outro turno começar nessa janela, a mensagem pode orientar esse turno em curso. Essa limitação do SDK não é resolvida por polling mais frequente.

Alguns threads Codex podem recusar a atualização do histórico visível com `thread/items/list is not supported yet`. No Paseo 0.15.4 inspecionado, essa leitura acontece depois de registrar a conversa reaberta. O início só continua nesse erro exato se o hook desta tentativa incluiu as ferramentas para o mesmo agente/projeto/board, uma nova leitura confirma agente ocioso e não arquivado e a mesma sessão continua ativa. A interface mostra um aviso sobre o histórico indisponível. Sem essas provas ou diante de outro erro, nada é enviado; o início salvo permanece disponível para nova tentativa. Não há alteração do provider, do SDK ou de arquivos globais.

Licença MIT: [LICENSE](LICENSE). Contexto e interface: [PRODUCT.md](PRODUCT.md), [DESIGN.md](DESIGN.md), [guia de conversa e quadro com capturas reais](docs/conversation-first.md). [Apresentações do quadro](docs/layouts.md), [pesquisa de skills](docs/research-skills.md), [livros](docs/research-books.md), [validação 0.1](docs/validation.md), [validação 0.2](docs/validation-evolution.md), [validação Canvas 0.3](docs/validation-canvas.md) e [validação da entrada por conversa 0.4](docs/validation-chat-entry.md).
