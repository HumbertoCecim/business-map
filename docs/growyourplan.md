# GrowYourPlan — foco por níveis

1. Abra o site com sua conta existente.
2. Na empresa (nível 1), use a seta de uma área para explorá-la.
3. A área vira o centro; a lateral acompanha automaticamente o nível anterior.
4. Explore uma nota ou subárea para continuar. O caminho no topo permite saltar de volta.
5. Use **Subárea** / **Criar aprofundamento**, ou peça uma proposta ao ChatGPT.
6. Revise a prévia calculada pelo servidor e confirme o lote.

São até cinco níveis, incluindo empresa e cada área/nota. Exemplo: empresa → clientes → hipótese de público → pesquisa → roteiro. Nenhum método é obrigatório.

## Pesquisa incorporada

- Busca global inclui ramos fechados e mostra seu caminho.
- A prévia de mudança de localização mostra o nome do destino.
- A exclusão informa o total de áreas e notas que serão removidas.
- Remover o foco externamente leva a navegação a um ancestral existente.
- Breadcrumbs e navegação textual funcionam no site e no widget. Em telas estreitas, a miniatura anterior vira um controle de retorno.

Referências: [Obsidian local graph](https://obsidian.md/help/plugins/graph), [WAI breadcrumbs](https://www.w3.org/WAI/ARIA/apg/patterns/breadcrumb/), [WAI keyboard focus](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/), [progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/).

## Compatibilidade

O formato continua schema v3, com `section.parentId` opcional. Boards sem esse campo continuam no nível da empresa. O JSON preserva a hierarquia; o Markdown acrescenta o caminho das áreas aninhadas. O ambiente local do negócio continua independente da nuvem.

O widget mantém altura inline explícita e não observa a altura do documento. No ChatGPT, atualize o conector e abra um mapa novo para carregar a interface 0.2.0. Os testes automatizados usam a ponte MCP Apps oficial em navegador e o SQLite real no workerd; não substituem uma nova sessão real do usuário no ChatGPT.
