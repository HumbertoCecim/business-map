# GrowYourPlan: Laboratório de Design — "O que faço agora?"

## (a) O conceito em 3 frases
GrowYourPlan não é um editor de diagramas nem um gerenciador de tarefas convencional: é o ritual matinal e de encerramento para pessoas com mentes aceleradas e paralisia de execução. Ele transforma o caos de um despejo mental livre em um mapa radial hierárquico através da IA, reduzindo o peso do dia a um único próximo passo de cada vez. Ao substituir calendários culpogênicos por uma retomada serena de onde você parou, o produto faz o usuário sentir que seu negócio está seguro e em crescimento contínuo.

---

## (b) 10 ideias ordenadas por "faz alguém querer pagar"

### 1. Tela inicial "O que faço agora?" como âncora de abertura
- **O que é:** Ao abrir o app, a pessoa nunca vê uma tela vazia ou um mapa caótico; vê um cartão herói com o "Onde parei ontem" (`whereStopped`) e o único "Primeiro passo" (`firstStep`) prioritário, com o mapa em segundo plano.
- **Por que funciona:** Elimina a paralisia de iniciação (disfunção executiva). A pessoa não gasta energia decidindo por onde começar.
- **Esforço:** P | **Dados:** Dados existentes (`whereStopped`, `firstStep`, `focus`, `lane`).

### 2. Onboarding por Despejo Mental (Brain Dump to Map)
- **O que é:** O primeiro uso não tem botão "Nova área"; tem um campo aberto onde o usuário despeja em texto ou áudio todas as pendências da cabeça. Em um minuto, o ChatGPT devolve o mapa radial estruturado em até 5 níveis para aprovação.
- **Por que funciona:** Pessoas com TDAH travam ao categorizar no vácuo. Despejar tudo e ver a ordem nascer magicamente gera o momento "uau" que converte em assinatura na hora.
- **Esforço:** M | **Dados:** Dados existentes (`mapDraft`, `suggestions`, `sections`, `cards`).

### 3. Filtro de Energia e Micro-passos contra a Cegueira de Tempo
- **O que é:** Cada nota ganha um indicador de fôlego: ⚡ Micro (15 min), 🎯 Foco (45 min) ou 🌊 Bloco (90 min). Na tela inicial, um botão rápido filtra: "Tenho só 15 min agora".
- **Por que funciona:** Calendários e prazos rígidos causam vergonha e abandono quando atrasam. Saber que um passo leva apenas 15 minutos quebra a barreira psicológica de começar.
- **Esforço:** P | **Dados:** `[CAMPO NOVO]` `card.energyLevel: "micro" | "focus" | "deep"`.

### 4. Cores e Ícones Sutis por Macro-Área (Âncoras Espaciais)
- **O que é:** Cada área raiz recebe uma tonalidade sutil (sálvia, âmbar, lavanda, terracota, ardósia) e um ícone/emoji herdado pelos seus nós filhos no mapa radial.
- **Por que funciona:** Atualmente tudo tem o mesmo verde e o mesmo ícone. Cérebros visuais precisam de diferenciação cromática imediata para navegar sem cansar a leitura.
- **Esforço:** P | **Dados:** `[CAMPO NOVO]` `section.colorTheme` e `section.icon`.

### 5. Revisão de Propostas em Um Toque com Desfazer Onipresente
- **O que é:** As sugestões do ChatGPT aparecem diretamente no mapa como nós tracejados ("brotos"). Um painel flutuante oferece "Aceitar tudo" em 1 clique, com botão de desfazer sempre visível no topo.
- **Por que funciona:** Diffs técnicos e listas de arquivos causam exaustão mental. Ver a mudança no mapa e confiar que qualquer erro é desfeito com um clique dá segurança para aceitar.
- **Esforço:** M | **Dados:** Dados existentes (`suggestion.mapDraft`, `status`, transações de `undo`).

### 6. Ritual de Fechar o Dia em 5 Segundos
- **O que é:** Um botão fixo "🌙 Fechar o dia" abre um popover que pergunta: "Onde você parou para amanhã não fritar o cérebro?". Preenche com o último passo tocado e permite salvar em 5s.
- **Por que funciona:** Fornece descompressão cognitiva. A pessoa desliga o computador em paz porque sabe que o contexto de amanhã está blindado.
- **Esforço:** P | **Dados:** Dados existentes (`whereStopped`).

### 7. Metáfora de Crescimento Maduro ("Grow") sem Gamificação Infantil
- **O que é:** O mapa começa visualmente como uma semente central e vai ganhando textura orgânica discreta (anéis de crescimento ou folhas translúcidas) conforme nós são validados e concluídos.
- **Por que funciona:** Streaks diários do tipo Duolingo punem quem tem TDAH na primeira crise. Uma planta que espera pacientemente pelo seu retorno transmite acolhimento e longevidade.
- **Esforço:** M | **Dados:** `[CAMPO NOVO]` `board.growthStage` (derivado ou persistido).

### 8. Botão "Destravar Passo com ChatGPT" (Micro-quebra em 1 toque)
- **O que é:** Ao lado do primeiro passo da nota atual, um botão "Não consigo começar" aciona o ChatGPT para quebrar o passo em 3 micro-ações ridículas de fáceis (ex: "só abrir a aba e colar o link").
- **Por que funciona:** A maior causa de procrastinação em TDAH é o primeiro passo ainda estar grande demais ou abstrato. Reduzir a fricção reativa a dopamina.
- **Esforço:** M | **Dados:** Dados existentes (chamadas MCP via proposta rápida).

### 9. Zoom Semântico Radial com Navegação "De onde você veio"
- **O que é:** Ao explorar uma subárea, o nó se expande para o centro com transição suave, enquanto a lateral esquerda guarda o nó pai e os irmãos como um mapa astronômico em miniatura.
- **Por que funciona:** Mantém o modelo mental de até 5 níveis sem que a pessoa se sinta perdida em labirintos de pastas como no Obsidian ou Notion.
- **Esforço:** M | **Dados:** Dados existentes (estrutura hierárquica `sections` e `cards`).

### 10. Tipografia Ampliada e Contraste Confortável (Mínimo 14px)
- **O que é:** Eliminar as fontes minúsculas de 7px a 10px dos nós atuais, adotando no mínimo 14px para textos secundários e 16px para títulos, com alto contraste AA.
- **Por que funciona:** Reduz o esforço de foco visual. Quem tem déficit de atenção abandona interfaces que exigem aperto de olhos e esforço para decifrar cartões.
- **Esforço:** P | **Dados:** Tokens visuais em CSS (sem alteração de modelo).

---

## (c) 3 coisas que eu removeria da interface atual
1. **A navegação lateral técnica (Skills, Memória, Fontes):** Esse encanamento de LLM/MCP confunde o usuário final. Deve sumir da barra principal; fontes e memórias viram metadados colapsáveis dentro do card, e skills ficam na configuração da IA.
2. **A tela inicial de "Mapa Vazio com botão Nova Área":** Abrir num vácuo cinza é a maior causa de abandono. Deve ser substituída pelo fluxo de Boas-Vindas com Despejo Mental guiado.
3. **A faixa minúscula de rodapé para "Onde parei" e o editor lateral superlotado:** "Onde parei" é o elemento mais valioso do produto e deve estar no topo da tela inicial. O inspetor lateral deve esconder campos secundários em abas colapsáveis.

---

## (d) A única ideia que eu faria primeiro
**A Tela Inicial "O que faço agora?"**: Não exige mexer no backend nem criar campos novos, pois reaproveita `whereStopped`, `firstStep`, `focus` e `lane`. Ela resolve de imediato a maior dor do público-alvo (paralisia ao abrir o app), cria um ritual matinal viciante pelo alívio que proporciona e muda a percepção de um "canvas complicado" para um "copiloto de clareza diária".
