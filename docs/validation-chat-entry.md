# Validação 0.4 — começar pelo chat

Verificado em **15/11/2026**, Windows, Paseo e SDK **0.15.4**. Este registro complementa a [validação 0.3](validation-canvas.md) e o [guia curto de primeiro uso](primeiro-uso.md).

## Revisões e testes

Claude Opus aconselhou e revisou a integração; GPT‑6.1 Sol high implementou. Outro Sol high criou 34 testes independentes de transação, envio e ciclo de vida das pills, incluindo a compatibilidade do provider principal. O typecheck e a suíte completa final passaram com **101 testes**, zero falhas e zero skips.

Foram corrigidos: envio após encerramento durante o reload do agente; recriação indevida de pill removida no replay da assinatura do SDK; leitor preso ao primeiro worktree depois de seu arquivamento; ações de agente em painel contextual de outra conversa; aviso transitório de envio incerto enquanto a operação ainda estava em andamento.

Os testes cobrem atomicidade e idempotência do início, concorrência e fingerprints, isolamento de projetos/worktrees, agente ocupado, falhas de envio e confirmação explícita de retry, paginação, snapshot e updates, cleanup e troca do leitor por um membro atual do projeto. Os 62 testes anteriores continuam na suíte.

## Fluxo real no daemon de testes

Usado o daemon isolado `127.0.0.1:6778`, com projetos fictícios separados do piloto real. Dados, transportes e provas de QA ficam em `.local/`, fora do pacote.

- Uma conversa Codex já existente exibiu **Criar Business Canvas**. Abrir o formulário e preencher nome/objetivo não criou `board.json`.
- **Continuar sem skills → Iniciar sessão** salvou um único vínculo e sessão. A pill mudou para **Abrir Business Canvas**; após o reload ocioso, o Codex chamou `business_get_context` e fez uma pergunta baseada no objetivo.
- Uma resposta fictícia levou a uma proposta real de duas áreas. A interface permitiu editar a pergunta e desmarcar uma área. Confirmar criou somente **Clientes**, com proveniência, preservando o texto humano, sem foco nem decisões automáticas.
- Abrir o quadro pelo outro agente mostrou o aviso de sessão em outra conversa. O SHA256 do JSON permaneceu `2421a8be831e5d85dde828203d9e791a632a4558d091551d30f0be42e30a67c4` antes e depois da abertura.
- Após encerramento explícito da sessão de teste, **Iniciar nova sessão nesta conversa** iniciou Claude Opus 5.5. O kickoff em linguagem natural levou a uma chamada real de `business_get_context`; o agente reconheceu a pergunta humana editada e a área não confirmada. Fez uma pergunta e manteve duas sessões, sem duplicação.
- Dois envios sequenciais com o mesmo `messageId` para um agente de teste produziram uma mensagem humana e uma resposta na timeline. Isso comprova a deduplicação observada nesse host; não é uma promessa transacional entre arquivo e provider. Envios incertos continuam exigindo conferência e confirmação humana.
- Um arquivo JSON propositalmente inválido exibiu **Business Canvas: verificar**, sem ação de criação. Arquivo e backup mantiveram seus hashes: `630e00b3f2870977ca91bf166f562bc662ccaa9a1a235df438320d340dae5e19` e `73c1783dfa06fdebadcb999f4d78c630608bae387479d5739f0eaffd28dd55f4`.
- Foi criado e arquivado um worktree Git descartável do projeto C. Seu diretório foi removido pelo Paseo; as conversas no worktree restante continuaram exibindo **Abrir Business Canvas**, sem reload. O arquivo canônico manteve SHA256 `06980cfe7d98fc1c08eed630a5f61256ed63f59a892c16b5d1f12a0ddcd10fc2`.
- Desktop em 1440 × 900, temas claro/escuro e largura de 430 × 932 foram inspecionados. Em largura estreita, documento e viewport tiveram 430 px; **Retomar conversa** fechou o painel sobreposto e voltou ao chat. A preferência Sistema foi restaurada.

As capturas do [guia](primeiro-uso.md) mostram o negócio fictício Estúdio Aurora; não são dados do piloto real. O teste estreito foi feito no navegador do Paseo, não em um aparelho físico.

## Reinício e reabertura

O daemon de testes foi reiniciado de fato, com troca do worker `15572 → 58760`. Antes e depois, o quadro F manteve revisão 9, duas sessões, uma mensagem de kickoff na conversa Claude e SHA256 `33a3e1bee4a27801fbf8322c77c1b3372108117a00cd2275dd3ab66ff5d1cb9d`. Repetir `conversation.deliver` para essa sessão devolveu `already_sent`, sem alterar o arquivo ou gerar outro início. O daemon principal não foi reiniciado.

## Instalação estável no Paseo principal

O pacote 0.4 foi extraído fora do repositório e instalado sem `node_modules` próprios ou ancestrais no daemon de testes. O plugin ficou `running`; a consulta do worktree do projeto C retornou o quadro canônico em schema 2, revisão 33, com quatro versões de skills e três sessões. A instalação de desenvolvimento foi restaurada na fonte após esse gate.

No daemon principal `127.0.0.1:6767`, a cópia estável foi instalada em `%LOCALAPPDATA%/BusinessHarness/releases/0.4.0/package`, sem reiniciar o daemon. Houve exatamente um registro `business-model-board`, habilitado e `running`, com log `Plugin ready`. Os nove plugins anteriores conservaram caminho, estado e habilitação.

Uma conversa do negócio piloto criada antes da instalação recebeu a pill **Criar Business Canvas**. O formulário abriu ao lado do chat nativo; nome, objetivo fornecido pelo usuário e **Continuar sem skills** foram confirmados pela interface. A gravação produziu um único quadro e sessão e a pill passou a **Abrir Business Canvas**.

A preparação inicial encontrou uma incompatibilidade do provider Codex do daemon principal: `thread/items/list is not supported yet` durante a recarga do agente. O quadro permaneceu salvo na revisão 1; nenhuma mensagem havia sido enviada.

A leitura do `app.asar` instalado confirmou que essa falha ocorre na hidratação do histórico, depois de registrar a nova sessão do provider com as ferramentas. A correção aceita somente a mensagem conhecida, com marcador novo do hook para o mesmo agente, projeto e quadro durante aquela tentativa. Em seguida verifica novamente o agente e a sessão antes de gravar a tentativa e enviar. Sem o marcador, com outro erro ou com sessão/agente incompatível, não envia. O usuário recebe um aviso sobre a sincronização do histórico; não há mudança do core ou da configuração do provider.

Os 34 testes independentes passaram após essa correção, incluindo nove novos casos de recusa e continuidade estritamente condicionada. A suíte completa passou com **101/101**. O pacote corrigido teve 72/72 arquivos com hashes iguais à fonte e passou no typecheck após extração.

Na retomada pela interface nativa, **Enviar primeira pergunta** usou a sessão já salva. O log registrou o novo marcador de ferramentas; o Codex chamou efetivamente `paseo.business_get_context`, reconheceu o quadro vazio e a ausência de skills e perguntou quem seria o primeiro cliente. Ficaram exatamente uma mensagem de início, uma sessão e revisão 3, sem áreas ou decisões inventadas.

Fechar e reabrir o painel pelo botão do chat manteve sessão, revisão e quantidade de mensagens. O SHA256 do quadro antes e depois foi `d2da4d9b6a0c2ecfa15822cfd98b1ae6056b962ce8e93029b1448f37d7539419`. O chat permaneceu visível com o quadro compacto, o objetivo resumido e os controles de sessão recolhidos. A captura do piloto fica em `.local/qa-chat-entry/`, fora do pacote.

O piloto real está pronto para a resposta do fundador à primeira pergunta. A aprovação parcial e a primeira área confirmada já foram exercitadas com dados fictícios; a confirmação no negócio real continua pendente dessa interação. O plugin não respondeu nem confirmou decisões pelo usuário.

## Limites de execução

As verificações de agente ocioso acontecem antes do reload e do envio. O protocolo 0.15.4 não oferece uma operação condicional de envio somente se continuar ocioso: outro turno pode começar entre a verificação e o envio. O plugin usa `steer`, preserva o turno e nunca escolhe `interrupt`; essa janela residual está documentada no README.

Abrir o quadro é uma operação de leitura. Criar uma sessão, selecionar skills e confirmar sugestões são ações explícitas. O JSON continua em schema 2, com revisão, fingerprints e receipts; esta evolução não exige migração do formato.
