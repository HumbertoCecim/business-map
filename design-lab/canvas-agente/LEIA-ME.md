# Canvas com agente local — laboratório

Direção visual: Canvas de nove blocos aprovada pelo usuário, reaproveitando os estilos e o exemplo fictício Ateliê Aurora de `../canvas-principal/`. Esta fatia conecta o Canvas ao serviço local existente. Não instala uma nova versão no Paseo.

## Abrir para testar

No PowerShell, na raiz do repositório:

```powershell
npm run canvas:local
```

Deixe esse terminal aberto. Em outro terminal:

```powershell
npm run canvas:local:open
```

O segundo comando gera um código de pareamento de uso único (60 segundos) e abre o navegador padrão. Depois do pareamento, a mesma aba pode recarregar sem novo código. Se o código expirar, repita o segundo comando. O endereço do serviço é `http://127.0.0.1:6815`; abrir só esse endereço numa aba sem sessão não concede acesso.

1. Abra uma ideia para editar ou use **Adicionar ideia**. Recarregue para conferir o salvamento.
2. Em um bloco, clique **Conversar sobre este bloco**, ou use **Conversar com o Canvas** para os nove blocos completos. O seletor **Contexto da conversa** permite alternar entre os escopos, com histórico separado.
3. Escolha **Codex** ou **Claude Code**, escreva a pergunta e clique **Enviar ao agente**. Só esse clique inicia o processo real. Usa a autenticação/configuração existente do CLI e pode consumir limites/créditos do provedor. Nenhuma chave deve ser digitada no Canvas.
4. As propostas aparecem na própria conversa (e também em **Sugestões**). Para uma nova ideia, use **Revisar para adicionar** e **Aprovar e adicionar**. Para alterar cartão existente ou seu próximo passo, use **Revisar alteração**: confira o conteúdo anterior, ajuste a proposta e clique **Aprovar alteração**. Você pode descartar qualquer proposta. Nenhuma resposta muda os blocos automaticamente.
5. Confira janela larga/estreita, claro/escuro. Durante uma consulta, **Cancelar conversa** encerra o processo local. Há uma execução por vez e limite de três minutos para a consulta; um lote já entregue ao writer conclui atomicamente.

**Encerrar:** Ctrl+C no primeiro terminal. Não para o daemon Paseo principal. Os dados do teste ficam em `.local/canvas-agente/live/project/.business-board/`; a descoberta/controle ficam em `.local/canvas-agente/live/home/`. Os arquivos não são enviados ao Git e não se misturam ao negócio principal. O exemplo só é criado quando não existe; reiniciar não apaga edições. Para recomeçar, pare o teste e guarde/renomeie a pasta `live`, antes de iniciá-lo novamente.

## O que está conectado

- Mesmo `local/server.ts`, `AskManager`, seleção de contexto, validação do JSON, writer v3, CAS por revisão/fingerprint e recibos de idempotência existentes no produto.
- Pareamento pelo canal local de controle; capability humana na sessionStorage da aba. API em loopback com validação de Host/Origin. Sem liberar CORS ou enfraquecer a CSP; assets externos, texto escapado.
- Contexto da consulta: cartões do bloco selecionado com resumo dos demais, ou os nove blocos completos quando você escolher **Canvas inteiro**. Inclui vínculos/fontes pertinentes e skills confirmadas (o exemplo começa sem skills). O CLI roda num diretório privado, com as restrições já existentes. Conteúdo confirmado só muda pelo writer, após revisão/aprovação humana.
- Codex nativo e Claude Code são descobertos sem chamar modelo. Erros de instalação/login/configuração aparecem no resultado da consulta. Disponibilidade do executável não prova que a autenticação funciona.
- Contrato reaproveitado, sem esquema/endpoints novos: `card_draft` com `targetKind=section` cria cartão; com `targetKind=card` e ID exato propõe alteração do cartão existente. `cardDraft.title/text/firstStep` contêm o resultado completo proposto. Próximo passo é o campo existente `firstStep`, não uma fila nova de tarefas. `insight` pode virar novo cartão após revisão. Outros tipos ficam apenas para leitura/descarte.
- A alteração mantém o ID, vínculos, fontes, classificação e prioridades atuais, salvo classificação que a pessoa ajuste no editor. A proposta fica registrada com alvo no cartão e status incorporado. O campo de origem original do cartão segue as regras existentes do domínio. Um alvo removido fica sem ação de aplicar; não vira criação por engano. Num conflito de edição do mesmo cartão, o rascunho permanece e a aprovação exige **Atualizar comparação** antes de tentar novamente.
- Cancelamento/deadline não gravam resposta parcial. Concorrência fica ocupada até o processo terminar, inclusive depois de cancelar. Não há retry automático.

## Limites desta fatia

Não inclui Cloudflare, conector remoto, Paperclip, publicação, migração, esquema novo, agentes permanentes ou instalação no Paseo principal. O aprofundamento VPC continua no protótipo anterior; não foi conectado ao armazenamento nem misturado com dados persistentes aqui. O Canvas agora é o teste principal desta integração.

A resposta da conversa fica na memória do navegador/serviço; as sugestões e os cartões ficam no board. Ao recarregar durante uma consulta, a aba retoma o job; ao reiniciar o serviço, jobs/conversas não são retomados. Não há histórico de chat persistente nem streaming de tokens. Uma aba concorrente pode causar conflito de edição: o Canvas preserva o rascunho e pede revisão. Não há undo geral nesta fatia; os backups e o histórico do writer existente continuam disponíveis.

Não foi executada inferência real pelo agente implementador. A prova com login/modelo reais será feita pelo usuário em **Enviar**; as verificações automatizadas usam um processo Node falso, sem rede/modelo. O CLI real envia o contexto ao provedor escolhido; execução local não significa modelo offline.

## Verificação reproduzível (PowerShell)

```powershell
npm run typecheck
npm test
npm run build
node --import tsx design-lab/canvas-agente/verify.ts
git diff --check
```

`verify.ts` usa o Edge já instalado via Playwright, sem baixar browser. Cria fixture nova dentro de `.local/canvas-agente/verification/`, porta aleatória e processo falso para ambos os formatos de saída. Verifica pareamento e Origin, contexto por bloco, escrita humana/persistência, propostas pendentes/aprovação/descarte, saída inválida, falha de processo, timeout, concorrência, cancelamento e conflito entre janelas. Gera oito capturas gerais, duas dos controles no compacto e `checks.json`. O teste de limites do Ask também integra `npm test`.

Resultado em21/11/2026, sobre `5704053` com o diff desta branch (`dirty=true`): typecheck e build aprovados; última execução de `npm test` no PowerShell aprovada126/126, usando TEMP/TMP em `.local/t`. Build mantém avisos de tamanho de chunk e diretivas `use client` das dependências existentes. As duas rodadas anteriores de testes tiveram ENOENT intermitentes ao ler versões de skills após staging (123/126 e125/126); encurtar TEMP não eliminou sozinho a falha. `server/skills.ts` e seus testes não foram alterados. Logs preservados em `.local/canvas-agente/tests*.log`; a causa dessas falhas não foi estabelecida nem corrigida nesta fatia. A falha inicial de tipos no script novo de verificação (nomes DOM num projeto Node) foi corrigida antes do typecheck aprovado.

O primeiro harness de integração passou nos nove cenários e gerou as capturas de Canvas/conversa em1440×1050 e390×844, claro/escuro. A evolução da conversa acrescenta testes de edição do mesmo cartão, aprovação após conflito, preservação de prioridades/vínculos, alteração só do próximo passo, contexto global/criação em outro bloco e alvo inexistente. O resultado mais recente fica em `.local/canvas-agente/verification/checks.json`. Nenhuma inferência real faz parte dessa evidência. Os testes usam o mesmo parsing e writer do serviço, substituindo somente o executável por um processo Node falso. O histórico enviado ao CLI inclui no máximo as últimas três trocas de cada escopo, mantidas apenas enquanto a aba está aberta.

Na evolução da conversa (21/11/2026), typecheck, build e `npm test` passaram127/127; log `.local/canvas-agente/tests-conversation.log`. O harness passou14/14, incluindo recusa de ID inventado pelo domínio e cartão removido depois da proposta. Há quatro capturas adicionais da revisão antes/depois; o rascunho editado permanece ao mudar a largura. A primeira tentativa do teste de alvo ausente esperava proposta na UI, mas o domínio corretamente a rejeitou: o teste foi corrigido para distinguir ID inventado de remoção posterior, sem relaxar a validação. Sem inferência real executada pelo implementador.

Exemplos para testar: “Melhore a descrição deste segmento e mantenha o que já sabemos”; “Defina um próximo passo concreto para esse cartão”; em **Canvas inteiro**, “Compare clientes e proposta de valor e proponha ajustes”. Os atalhos da conversa apenas preenchem a pergunta; o envio continua explícito.

Para explorar somente simulação: `npm run canvas:local -- --fake`, seguido por `npm run canvas:local:open -- --fake` (porta6816). As respostas dizem **TESTE FALSO** e não vêm de Codex/Claude. Não use essa simulação como evidência de funcionamento de um modelo real.

Branch: `feat/canvas-cli-local`, a partir de `main`5704053. Inputs: protótipo Canvas aprovado, parecer local de viabilidade do agente CLI, domínio/serviço e testes já existentes.

## Encerramento em22/11/2026

O usuário aprovou o resultado e pediu finalizar esta etapa. Esse aceite é qualitativo; não foi relatado qual CLI ou quais combinações visuais ele utilizou. Os checks acima mantêm a proveniência de21/11. Fechamento local: laboratório e estudos visuais em commits separados, sem push, PR ou instalação no principal. Os dados e logs em `.local/` ficam fora do Git.

A próxima direção recomendada é ChatGPT+MCP+web, reaproveitando o backend cloud e a revisão humana existentes. Ver `docs/plans/CANVAS-CHATGPT-NEXT.md`. Nenhuma implementação ou implantação cloud foi feita neste fechamento.
