# Canvas como direção principal

Em 21/11/2026, após experimentar a comparação Mapa × Canvas, o usuário escolheu explicitamente o Canvas de nove blocos como direção visual. Este estudo refina essa escolha. A comparação anterior permanece em `../mapa-vs-canvas/`.

Abra `index.html` diretamente no navegador. O preview desta sessão está em `http://127.0.0.1:6814`, somente neste computador.

## O que experimentar

1. O Canvas abre como visão principal, com os nove blocos. Em qualquer bloco, **Adicionar ideia** cria um cartão no estudo; você escolhe se é hipótese ou declaração.
2. Abra um cartão para editar contexto e consultar suas conexões. Rascunhos ficam protegidos enquanto você edita. **Desfazer** retorna à alteração anterior.
3. Em Clientes ou Proposta de valor, escolha **Aprofundar clientes e valor**. A visão relaciona o perfil de cliente à oferta: tarefas, dores, ganhos, produtos/serviços, aliviadores de dores e criadores de ganhos.
4. **Editar perfil** e **Editar oferta** permitem ajustar os textos, uma ideia por linha. Os títulos dos cartões de origem vêm do Canvas: renomear o cartão também atualiza sua referência no aprofundamento.
5. Clique no cartão de origem para voltar ao Canvas. A revisão de sugestão simulada continua disponível; aceitar registra uma hipótese e preserva a origem de IA.
6. Experimente temas claro/escuro e janela estreita. O Canvas vira lista legível e o detalhe abre em uma janela; o aprofundamento mantém perfil e oferta em sequência.

## Limites do estudo

Todos os dados são fictícios. Alterações ficam em memória e são reiniciadas ao recarregar. Não há conexão a backend, execução de IA, publicação, migração ou alteração do plugin instalado. Aprofundamento demonstra um par fixo de cartões do exemplo (`c1`/`c2`); não implementa múltiplos pares ou o schema definitivo de VPC. Ideias aceitas continuam sendo hipóteses, não evidências de mercado.

O arquivo HTML é independente e reutiliza a linguagem visual aprovada no estudo anterior. Não é integração da PR UI-01 nem implementação do produto. O próximo refinamento depende da avaliação desta experiência.

## Verificação

Em 21/11/2026, `node .local/canvas-principal/verify.cjs` passou usando Edge instalado e Playwright já disponível, sem baixar dependências. Foram nove verificações de interação e oito capturas: Canvas/aprofundamento × 1440×1000/390×844 × claro/escuro.

Foram verificados criação/edição, vínculo entre títulos do Canvas e aprofundamento, edição de perfil/oferta, proteção do rascunho ao redimensionar e pressionar Esc, retorno ao cartão original, sugestão com proveniência, busca e undo. Sem erros de console/página, chamadas externas, overflow horizontal ou ações fora dos blocos. A revisão visual ajustou a altura de Custos/Receitas para acomodar seus botões.

Evidência: `.local/canvas-principal/checks.json` e `.local/canvas-principal/screenshots/`. Nenhum commit ou push nesta rodada.
