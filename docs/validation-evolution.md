# Validação da evolução 0.2 — conversa primeiro

Verificado em **14/11/2026**, Windows, Paseo e SDK **0.15.4**. Este registro complementa o [registro do MVP](validation.md). A restrição anterior de uso do Claude foi superada nesta rodada: os dois providers executaram as ferramentas reais.

## Ambiente

Plugin instalado por diretório e recarregado no daemon isolado `127.0.0.1:6778`, com relay desativado. O daemon principal não recebeu instalação ou configuração do plugin. Foram utilizados projetos sintéticos separados e um worktree Git real. Dados e scripts de QA estão em `.local/`, excluídos do pacote.

Claude Opus aconselhou e revisou o código; GPT‑6.1 Sol high implementou. Um segundo Sol high escreveu e executou testes independentes de migração, skills e sessões. A revisão encontrou e corrigiu: base incorreta para adaptações sucessivas, cópia indevida de `.git`, rejeição de ancestrais legítimos com junction, excesso de controles laterais, expansão que reutilizava aba antiga e alternância em largura estreita.

## Verificações automatizadas

`npm.cmd run typecheck` passou. A suíte final passou com **56 testes, zero falhas e zero skips**.

Cobertura: schemas e ordenação; autorização e revogação; autoria humana e proveniência de áreas/cards; aprovação parcial; serialização, revisão e fingerprint; idempotência; arquivo inválido e backups; migração pura v1→v2; importação integral, limites, hash da árvore, binários, scripts inertes, exclusão de `.git` com aviso, junction ancestral legítima e links internos rejeitados; derivadas, retorno a versão existente e alteração externa; sessões, seleção explícita de versões e confirmação separada de decisões.

O pacote foi extraído para uma pasta temporária **fora da árvore de desenvolvimento**, sem `node_modules` local ou nos ancestrais, e instalado no daemon de teste. Compilou e carregou como `running`; a RPC pelo worktree recuperou schema 2, revisão 33, quatro versões de skills e três sessões na raiz canônica. Depois, a instalação por diretório de desenvolvimento foi restaurada e o mesmo estado foi conferido. Esse gate identificou e eliminou imports de tipos que dependiam das dependências locais: o código carregado utiliza somente as entradas públicas do SDK fornecidas pelo host. O pacote extraído também passou no typecheck, e seus arquivos foram comparados por SHA256 com os fontes.

## Integração real

**Codex / GPT‑6.1 Sol high:** leu contexto, SKILL.md e referência textual com `business_read_skill`, confirmou o código sintético `HORIZON-214` e fez uma pergunta. Submeteu card e resumo de sessão pendentes. Texto humano, foco e memórias permaneceram intactos. Enumeração: 82 comandos naquele agente.

**Claude / Opus 5.5:** criado pela interface do plugin com modelo, raciocínio e modo de permissões escolhidos. Executou o mesmo fluxo numa segunda sessão, usando a skill derivada e o caminho canônico do projeto a partir de um worktree. Card e resumo permaneceram candidatos.

Em uma terceira sessão iniciada pela UI, Claude propôs uma adaptação da versão ativa. A revisão exibiu texto, diferenças e justificativa; a confirmação criou outra cópia integral. A seleção explícita atualizou a sessão, preservando a versão inicial. O turno seguinte leu a nova versão e seguiu a adaptação, mantendo o ajuste anterior para negócios de serviços.

Claude também consultou o repositório oficial `phuryn/pm-skills`, baixou a pasta completa de `interview-script` e sua licença MIT para a caixa de entrada do projeto e submeteu uma proposta de importação. A UI mostrou finalidade, origem e manifesto dos dois arquivos; a confirmação registrou a skill. Nenhum script foi executado nem houve instalação global. O material externo de teste não está incluído no pacote do plugin.

Um reload deliberado durante esse teste removeu as ferramentas da sessão em curso. Após vincular novamente com o agente ocioso, a submissão funcionou. O README explica essa recuperação em desenvolvimento; os pedidos enviados pelo painel fazem o vínculo antes do envio.

## Dados e interface

- GET de um board v1 retornou estado compatível sem alterar o arquivo. A primeira gravação v2 preservou `board.v1.backup.json` byte a byte; outra gravação não substituiu esse backup.
- Uma skill sintética com cinco arquivos — instruções, referência, CSV, binário e script sentinela — manteve todos os bytes na importação, derivação e exportação. A sentinela não foi executada. Leitura após adulteração foi recusada; leitura fora do manifesto também.
- Workspace principal e worktree acessaram o mesmo board e os mesmos recursos canônicos. Outro projeto continuou sem essas skills.
- A UI incorporou um card por edição humana. No resumo do Codex, desmarcar uma das duas decisões fez apenas a escolhida virar memória.
- A confirmação de outro card pela RPC registrou sua sugestão de origem real do Claude; uma edição humana posterior preservou o vínculo.
- Explorer e quadro expandido compartilharam o mesmo rascunho. Alterar o JSON externamente durante a edição atualizou o conteúdo salvo e mostrou conflito, preservando o texto ainda não salvo.
- A expansão abriu o quadro central; retornar abriu a conversa nativa com a lateral. Em **430 CSS px**, o painel lateral pôde ser aberto e recolhido para alternar com o chat. Cards permaneceram legíveis.
- Inspeção no cliente oficial web do Paseo: desktop, tema claro/escuro, onboarding, biblioteca, revisão, sessão e layout estreito. As três apresentações anteriores continuam disponíveis. [Capturas e guia](conversation-first.md).
- O daemon confirmou reinício real do worker, de PID 49576 para 15572. Após reconectar e reabrir, o JSON permaneceu idêntico, incluindo sessão ativa, sugestões, memórias e quatro versões de skills. A leitura de referência pelo worktree continuou válida.

## Limites da validação

Não foram validados clientes nativos iOS/Android, todos os providers possíveis, pesquisa externa sem rede ou o piloto com um negócio real do usuário. A meta de retomar em menos de dois minutos depende desse piloto. Rascunhos de formulário são compartilhados em memória no mesmo cliente; não sobrevivem a reinício do cliente. Conteúdo confirmado e sessões são persistidos. O plugin não impede ferramentas externas de editar diretamente seus arquivos.
