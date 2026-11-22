# Mapa livre × Canvas

Estudo visual local, com o mesmo negócio fictício nas duas apresentações. Abra `index.html` no navegador; não precisa instalar nada. Não acessa backend, rede, IA ou dados reais. Edições e decisões ficam somente em memória; recarregar reinicia tudo.

## O que comparar

- **Mapa livre:** entrar em quatro grupos de navegação e explorar as ideias por partes. Os grupos são apresentação; não alteram o modelo nem o Canvas.
- **Canvas:** nove blocos visíveis no desktop, em disposição de BMC; no compacto, os blocos aparecem em lista legível.
- Cores, textos, detalhe de cartão, edição e sugestão são compartilhados. Isso ajuda a comparar organização e navegação.
- A base visual aproveita a direção de `codex-mapa-vivo` e a preocupação da UI-01 com contexto, legibilidade e revisão. O produto e a PR UI-01 não são alterados.

## Roteiro de comparação

1. No mapa, entre em **Pessoas e valor** e abra **Desenhar sem precisar ter talento**.
2. Troque para **Canvas · 9 blocos**. Localize a mesma ideia e observe quais partes do negócio ficam mais fáceis de comparar.
3. Edite o texto e salve **no estudo**. A mudança deve aparecer nas duas visões. Use **Desfazer** para retornar.
4. Abra a sugestão simulada. Aceitar adiciona uma hipótese ao público, preservando a origem; rejeitar não altera as ideias. Nada disso valida a hipótese.
5. Repita no tema escuro e na janela estreita. O detalhe vira uma janela acessível; o Canvas usa lista em vez de reduzir as letras.
6. Avalie: em qual visão você se localiza mais rápido? Qual ajuda a pensar? Qual fica confortável quando há mais conteúdo?

Não simula colaboração, banco de dados, persistência, execução de agentes, zoom ou arraste. Não é um novo schema nem uma proposta de migração. A decisão atual é visual; backend e integrações continuam fora desta fatia.

## Conferência em 21/11/2026

- Edge instalado, controlado pelo Playwright já disponível no projeto; nenhuma dependência ou navegador baixado.
- 1440×1000 e 390×844, claro/escuro, nas duas visões: oito capturas inspecionadas, sem overflow horizontal ou texto cortado.
- Nove verificações de interação passaram: rascunho protegido ao navegar; edição compartilhada; desfazer; aceitar hipótese com origem preservada e desfazer; rejeitar e desfazer; busca global/sem resultado; reinício ao recarregar; edição compacta protegida de Esc; revisão compacta e desfazer.
- Busca global corrigida após o ensaio encontrar restrição indevida ao grupo aberto. Repetição final passou, sem erros de console ou página.
- Evidência local: `.local/visual-comparison/checks.json` e `.local/visual-comparison/screenshots/`. Comando usado: `node .local/visual-comparison/verify.cjs`.
- Preview ligado apenas a `127.0.0.1:6813` nesta sessão. O arquivo HTML também abre diretamente; não depende do servidor para funcionar.
- Nenhum commit, push, instalação de plugin ou alteração da PR UI-01 nesta entrega.
