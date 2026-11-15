> Documento histórico das apresentações Paseo 0.1–0.4. Para a versão standalone atual, veja o README e docs/paseo.md.

# Business Harness: interface de trabalho

Modo **Operate**, com leitura editorial no Ateliê. O conteúdo e o próximo passo humano vêm antes da decoração. Orientação adaptada da skill [Impeccable](https://github.com/pbakaus/impeccable/tree/main/plugin/skills/impeccable), referências Operate/craft-floor consultadas em 2026-11-14. Nenhum launcher, hook ou fonte foi instalado.

## Sistema comum

React Native (`View`, `Text`, `TextInput`, `Pressable`, `ScrollView`) e uma família de fonte do sistema. Títulos 21–27, card 17, corpo 14, metadados 13; linha 19–34 conforme papel. Escala de espaços 4/8/12/16/20/24. Sem fontes externas, gradientes, glass, movimentos decorativos ou texto em imagens.

Cores exclusivamente de `theme.colors`: `surface 0` para conteúdo, `surface 1` para apoio, `surface 2` para contexto vinculado; `foreground` e `foregroundMuted` para texto; `border` para separação; `accent`/`accentForeground` para ação principal, seleção e foco; `statusWarning`/`statusDanger` para recuperação/erro. O tema é do host, sem paletas paralelas por layout.

Botões têm altura mínima40, rótulo explícito e estados selecionado/desabilitado/acessível. Campos têm label e placeholder do tema. Reordenação e exclusão são progressivas em “Mais ações”. Um editor inline traz o rascunho à visão e marca a aba como modificada; conflitos mostram o conteúdo salvo para comparação e exigem rebase explícito. Sugestões têm origem e status separados visualmente do texto humano.

## Composições

**Conversa + Explorer (0.4)** é a entrada padrão. A pill nativa informa Criar/Abrir Business Canvas por projeto; erro de leitura informa Verificar. O painel contextual usa `params.agentId`, mantém o chat no centro e identifica o projeto de destino. Uma superfície guiada reúne nome, objetivo, skills opcionais e uma ação principal **Iniciar sessão**. Não há salto obrigatório pelas abas Agente/Sessão. Ocupado mantém os campos; conflitos pedem revisão da base; envio incerto pede conferir o chat antes de tentar novamente.

Depois da confirmação ou ao abrir um board existente, a sessão e as áreas aparecem juntas. O quadro embutido remove o segundo cabeçalho e a faixa de retomada duplicada, mantém Áreas/Sugestões/Decisões e reutiliza editores/revisões. A pessoa pode recolher o quadro ou expandir. Outra sessão ativa informa seu objetivo e oferece ir à conversa vinculada, sem trocar o vínculo. O painel anterior e as configurações completas continuam disponíveis. A aba expandida oferece as quatro composições abaixo.

**Panorama**: título e utilitários compactos. Faixa de retomada e foco lado a lado no desktop. Áreas por título/divisor, cards como unidades de conteúdo. Grade de três colunas acima1050 px, duas no médio, uma abaixo760 px ou em `layout.compact`. Ações secundárias recolhidas. O quadro começa na primeira viewport.

**Ateliê**: conteúdo humano em coluna principal e rail300 px com foco manual, onde parei, sugestões e decisões. Áreas usam divisores, cards uma sequência de leitura. Na largura compacta o rail vira um bloco progressivo abaixo do conteúdo. Dicas também permanecem vinculadas a seus alvos.

**Bússola**: primeiro passo do primeiro card no foco humano, onde parei e última decisão. Um índice completo de áreas mostra Agora/Depois/concluídos e abre a mesma edição do quadro. Foco e itens de Depois são acessíveis; nenhuma pontuação ou priorização automática. O quadro completo continua disponível abaixo.

**Canvas (0.3)**: uma folha contígua, divisórias de 1 px, cabeçalhos compactos e notas de título+uma linha de conteúdo. Sem panes arredondados separando cada área. Para 7–9 áreas, cinco colunas superiores permitem empilhamentos por ordem e dois blocos largos inferiores completam a folha; outras contagens usam linhas equilibradas. Em compacto, uma ou duas colunas resumidas preservam o acesso ao detalhe. Até 2 notas em células empilhadas,3 normais e 4 nos blocos largos, com contador de restante. Foco aparece na borda `accent` da nota; marcadores são humanos. Propostas usam tracejado e áreas candidatas aparecem fora da folha confirmada. Não há inferência de evidência, classificação ou prioridade.

Toolbar de Canvas usa controles de 32 px no desktop; no compacto mantém40 px. Seleção, hover e foco de teclado usam os tokens existentes. Editores e confirmação continuam fora da folha e reutilizam `expectedRevision`/fingerprint, sem um segundo motor de edição. A composição é uma função pura em `shared/canvas-layout.ts`; não persiste coordenadas, não muda o schema e não reconhece semanticamente nomes de áreas.

Referências visuais/operacionais consultadas em 14/11/2026: [LeanSpark Lean Canvas](https://leanspark.ai/leancanvas), pelo caminho conversa→quadro; [Business Model Canvas oficial da Strategyzer](https://www.strategyzer.com/library/the-business-model-canvas), pela visão integrada numa folha; e [plataforma Strategyzer](https://www.strategyzer.com/platform), pela relação entre hipóteses, notas e evidências. A apresentação é original, sem logos/assets/textos desses produtos e sem aplicar seus templates aos dados do usuário.

`useTabState` persiste somente a apresentação escolhida. `BoardAreas`, `FocusStrip`, `RelatedInsights`, campos e botões são compartilhados. As apresentações não têm reducers, persistência ou variantes do conteúdo próprios.

As contribuições nativas (`board-main` no workspace, `board-side` no Explorer e `board-conversation` no contexto do agente) compartilham o estado transitório por host+projectId. Rascunhos da entrada também distinguem o agente. O alias `board` preserva abas 0.1 já abertas; novas expansões usam `board-main` para evitar refocar uma aba antiga em outra superfície. O projeto é resolvido antes de abrir esse estado. Abrir outra superfície não limpa editores; mudar host/projeto não transporta rascunhos. O SDK 0.15.4 não fornece chat embutível; abrir conversa navega ao agente no workspace real e abre o Explorer correspondente.

A observação owned acompanha criação, arquivamento e reconexão das conversas e limpa registros ao descarregar. As pills do mesmo projeto recebem a mesma descoberta de board, compartilhada com os painéis. Selecionar/abrir não escreve nem inicia análise. A confirmação transacional e o envio são fases distintas: falhar no envio não duplica o board ou a sessão, e uma tentativa de resultado incerto exige confirmação humana.

A leitura agrupada escolhe um workspace de um membro atual do projeto a cada consulta. Arquivar a conversa/worktree que originou o grupo não prende os demais àquela referência. O leitor do diretório de conversas tem precedência sobre uma superfície aberta num workspace antigo; remover a última superfície remove também seu leitor e timer.

Importação e ajuste usam prévia de texto integral/manifesto, motivo e diferenças antes da confirmação. Bibliotecas distinguem Original/Derivada/Ativa sem marcar um nome de catálogo como conteúdo lido. Sessões distinguem Em andamento/Encerramento em revisão/Encerrada; as decisões candidatas podem ser editadas e desmarcadas individualmente. Controles de pausa explicam a diferença entre orientar o próximo turno e usar Parar no chat nativo.

## Verificação

Inspecionar cada composição com conteúdo real em desktop, largura estreita e temas claro/escuro. Verificar conteúdo inicial visível, navegação entre todas as áreas, foco humano, sugestões vinculadas, abertura do editor, preservação do rascunho ao trocar layout, erro de arquivo e contraste do tema. Provider/SDK devem ser validados em daemon isolado; não inferir mobile real apenas de um browser estreito.
