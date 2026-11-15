# Registro de validação — 14 de novembro de 2026

## Ambiente e isolamento

Paseo e SDK **0.15.4**, Windows, TypeScript/React Native/Zod. O plugin foi instalado, carregado e recarregado em um **daemon de desenvolvimento isolado**, ouvindo somente `127.0.0.1:6778`, com relay desativado. O daemon principal não recebeu instalação, alteração de configuração ou ativação do plugin.

Os dados usados foram sintéticos, em dois projetos de teste e um worktree Git real do primeiro projeto. Não foi aberto nem preenchido um negócio real do usuário. Os scripts e dados transitórios de QA ficam em `.local/`, fora do pacote.

## Verificações automatizadas

`npm.cmd run typecheck` passou. `npm.cmd test` passou com **25 testes, zero falhas**.

Os testes cobrem:

- versão e limites do schema; CRUD e ordenação estável; movimentação entre áreas;
- foco humano, limite e limpeza de cards concluídos/excluídos;
- sugestões sem alterações em texto ou prioridade humana; confirmação separada de memórias e preservação da origem após edição;
- prévia com seleção parcial e perguntas editadas; Markdown determinístico;
- concorrência serializada, revisão antiga, alteração externa sem incremento de revisão e hashes;
- arquivo inválido preservado com backup válido; desaparecimento do arquivo sem recriação silenciosa;
- submissões idempotentes após recriar a store e rejeição de reutilização de identificador com outro conteúdo;
- isolamento de projetos, resolução de worktree para raiz registrada, falha sem fallback para cwd e rejeição de links simbólicos;
- opt-in, revogação de ferramentas já anexadas, origem não falsificável e RPC humana sem impersonar um agente;
- mensagens recuperáveis sem detalhes do transporte; textos literais React Native dentro de componentes apropriados.

O CLI 0.15.4 não oferece comando `plugin validate` ou `plugin build`. A validação adicional foi a compilação/carregamento pelo próprio Paseo, instalação por diretório, RPCs reais e logs `Plugin ready` sem erro do plugin.

## Integração com providers reais

**Codex / GPT‑6.1 Sol, raciocínio high: passou.** Um agente real foi criado no worktree sintético; a seleção foi persistida e as ferramentas foram vinculadas com a sessão ociosa. O agente chamou `business_get_context` e `business_submit_suggestion`. O servidor registrou a origem correta e deixou o insight pendente. Texto humano, foco e memórias confirmadas ficaram intactos. A enumeração de comandos retornou 82 entradas nesse agente.

Em uma segunda solicitação explícita, o mesmo agente submeteu uma memória candidata e uma prévia de duas áreas. Nenhuma delas virou conteúdo confirmado automaticamente. A segunda sugestão, baseada em revisão anterior à primeira submissão, apareceu marcada como contexto desatualizado.

**Claude / Opus 5.5: validação ponta a ponta pendente.** O agente real foi criado e vinculado; a enumeração retornou 84 comandos. A execução do modelo foi impedida pela mensagem de limite de uso de cinco horas do provider. Portanto, não se afirma que as ferramentas foram chamadas com sucesso por Claude. A contribuição consultiva anterior do Opus foi utilizada; não foi simulada uma revisão adicional.

A enumeração bem-sucedida em dois agentes não garante que todo provider exponha skills, nem certifica a qualidade de uma skill. Referências manuais continuam disponíveis.

## Operações reais e persistência

RPCs reais confirmaram que workspace local e worktree compartilham a mesma raiz, fingerprint e board; o segundo projeto permaneceu isolado. Não foi criado JSON duplicado no worktree. A exportação Markdown foi gravada e continha o conteúdo humano.

Pela interface foram criados/editados uma área e um card, incluindo texto, primeiro passo e marcação urgente. Foi mantido um insight separado; “incorporar” abriu o texto humano existente ao lado da referência, sem substituí-lo. Uma memória candidata foi confirmada no formulário, com vínculo à sugestão de origem. Na prévia de estrutura foram editadas perguntas e desmarcada uma das duas áreas: só a área selecionada foi criada.

Com um rascunho aberto, outra gravação foi feita por RPC. O salvamento da revisão antiga foi recusado; o rascunho permaneceu visível com comparação do estado atual. Após revisão explícita da nova base, o salvamento funcionou. Trocar de layout durante essa edição preservou o rascunho.

O worker do daemon de desenvolvimento foi reiniciado pelo CLI, mantendo o mesmo supervisor. Depois do reinício, as RPCs e a reabertura/reload do painel recuperaram revisão, áreas, cards, foco, sugestões mantidas/incorporadas e memórias com suas origens. Recargas do plugin também preservaram o conteúdo.

## Verificação visual

O painel foi inspecionado no **cliente web oficial do Paseo servido pelo daemon**, em Windows, com larguras de desktop e viewport estreito de **430 CSS pixels**. As três apresentações foram abertas nos temas claro e escuro durante a revisão. Na largura estreita inspecionada, `documentElement.scrollWidth` permaneceu igual a `innerWidth`, sem transbordamento horizontal.

Foram corrigidos excesso de ações sempre abertas, altura da faixa superior, metadados técnicos expostos, comparação de conflito em JSON e posicionamento do foco na Bússola. A interface usa tokens do tema, labels acessíveis e estados de foco/hover/pressionado/desabilitado.

As [capturas dos três layouts](layouts.md) são imagens do produto em execução, não mockups. Nos logs do navegador, houve um aviso do bundle do Paseo sobre fallback de animação React Native para JavaScript no web; não foi observado erro de execução do plugin.

## Limites ainda não validados

- Execução real das ferramentas pelo Claude após restabelecimento da quota.
- Aplicativos nativos Android/iOS e controles por toque em aparelho físico. Layout estreito no web não substitui esse teste.
- Uso continuado no negócio real do piloto. O critério “retomar em menos de dois minutos após alguns dias” precisa dessa experiência; não foi declarado atingido com uma demonstração sintética.
- Escrita simultânea por múltiplos daemons e editores externos não é uma transação distribuída. A revisão/hash e o backup cobrem o escritor do plugin e conflitos observados, conforme limites do README.

Não houve commits, publicação, sincronização externa, instalação de skills pesquisadas ou execução de ações empresariais em nome do usuário.
