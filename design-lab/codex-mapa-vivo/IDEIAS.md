# Mapa vivo — um atlas pessoal

O mapa é um lugar bonito para deixar as ideias abertas, com a clareza de um atlas e a intimidade de um caderno.
Cada área tem identidade própria; mergulhar nela troca o assunto no centro e preserva uma pequena pista do caminho de volta.
O ChatGPT pensa junto nesse mesmo lugar: a proposta ganha forma antes de entrar no plano, e a pessoa continua no comando.

## Ideias, em ordem de vontade de pagar

1. **Um universo reconhecível de relance.**
   O quê: áreas com cor curada + emoji escolhido pela pessoa; notas herdam a identidade da área raiz, inclusive em níveis internos.
   Por quê: reconhecer “meu curso violeta” exige menos releitura e cria apego ao mapa; o objeto ganha personalidade suficiente para querer mostrar.
   Esforço: **M**. Dados: **NOVOS** `Section.appearance = { colorKey, emoji }`, ambos opcionais; ausência herda o ancestral, sem sortear outra cor a cada abertura.

2. **O mapa que pensa junto na conversa.**
   O quê: proposta do ChatGPT no lugar em que será inserida, contorno tracejado, justificativa curta, “Confirmar no meu mapa”, “Deixar passar” e desfazer visível.
   Por quê: torna tangível o valor de já pagar ChatGPT; a conversa produz uma estrutura que a pessoa pode reconhecer e revisar.
   Esforço: **M** de apresentação sobre o ciclo existente. Dados: existentes, `suggestions`, `mapDraft`, estados e desfazer; identidade de área usa o campo novo do item 1.

3. **Uma pista para voltar à própria cabeça.**
   O quê: “Onde parei” dentro da moldura do mapa, sempre legível; “Retomar” leva à nota e abre seu primeiro passo.
   Por quê: reduz o custo de recomeçar depois de uma interrupção, sem cobrar continuidade nem exibir atraso.
   Esforço: **P** para a faixa, **M** para o destino explícito. Dados: `whereStopped` e `firstStep` existentes; **NOVO** `whereStoppedTarget?: Target` para navegar com precisão, sem inferir a nota pelo texto.

4. **Três coisas importam agora; o resto está seguro.**
   O quê: foco de 1, 3 ou 5 notas no contexto do mapa; contorno duplo e selo “No foco”; primeiro passo imediatamente ao lado.
   Por quê: permite externalizar a memória sem encarar todas as tarefas como uma fila urgente. O foco é uma escolha, nunca uma pontuação.
   Esforço: **P**. Dados: existentes, `focus.cardIds`, `focus.limit`, `firstStep`, `done`; foco e importância são conceitos diferentes.

5. **Quarenta notas sem quarenta cartões minúsculos.**
   O quê: até 6 caminhos soltos no desktop; acima disso, conjuntos com capas empilhadas, contagem e abertura em lista de títulos legíveis.
   Por quê: o mapa mantém o ar e a beleza quando cresce; a pessoa não paga para administrar um emaranhado.
   Esforço: **G** no produto. Dados: existentes, `semanticType` e hierarquia; agrupamento é de visualização, sem criar `Section` nem consumir um dos 5 níveis.
   No mockup, os 40 títulos estão em quatro conjuntos editoriais definidos; a classificação automática ainda é uma hipótese de produto.

6. **Mergulhar sem perder o chão.**
   O quê: entrada de 280–320ms com escala leve, centro estável, breadcrumb clicável e miniatura do nível anterior à esquerda.
   Por quê: atende à curiosidade de explorar sem exigir que a memória de trabalho guarde onde estava.
   Esforço: **M**. Dados: existentes, `parentId` e caminho hierárquico. Com movimento reduzido, troca direta; no celular, a miniatura vira uma faixa “Voltar”.

7. **O prazer de operar um instrumento.**
   O quê: `Ctrl/⌘ K` mistura destinos e comandos; busca global revela o caminho; Tab + Enter percorrem o mapa; Esc volta; R revela relações.
   Por quê: oferece ao fã de Obsidian velocidade, descoberta e gosto por conexões, com uma linguagem visual própria e acolhedora.
   Esforço: **M**. Dados: existentes. Busca não reorganiza o mapa: marca o resultado com anel e preserva os vizinhos.

8. **Relações que explicam uma ideia.**
   O quê: hierarquia contínua e discreta; relações semânticas curvas, tracejadas e com rótulo, reveladas por um comando; em mapas densos, só as da seleção.
   Por quê: entrega o momento “essas duas coisas se conectam” sem transformar toda visita numa tarefa de decifrar linhas.
   Esforço: **M**. Dados: existentes, `relations` e `label`. No celular, pares em um painel de leitura substituem linhas que atravessariam os cartões.

9. **A mesma delicadeza em 600px.**
   O quê: o widget preserva centro, estado, retorno e revisão; detalhes rolam em painel limitado; em telas estreitas, até 3 caminhos por página, com contagem explícita.
   Por quê: a primeira experiência dentro da conversa precisa ter qualidade de produto pago e letras confortáveis, mesmo sem tela cheia.
   Esforço: **M**. Dados: existentes. Ações de edição manual continuam no SaaS; leitura, confirmação, rejeição e desfazer cabem no widget.

## Decisões visuais sem alternativas

- Papel claro `#FFFCF6`, tinta `#292F32`; no escuro, ardósia `#252D2E` e tinta `#F1EEE5`. Escuro não é apenas inverter o verde.
- Curso: violeta `#655295 / #EDE7F7`; escuro `#D4C0FC / #393346`.
- Freelance: petróleo `#246865 / #E1EFEB`; escuro `#A0DDD1 / #2B4241`.
- Projeto paralelo: terracota `#955137 / #F7E8DD`; escuro `#F0B798 / #493A33`.
- Reserva curada: ocre `#806119 / #F5EDD5`; escuro `#E6D08D / #464231`. Cor identifica área, nunca urgência.
- Área: emoji em pastilha, título 18px/600, pergunta-resumo 14px, contagem e seta. Emoji não se repete em toda nota.
- Nota: título 16px/600, estado textual 14px, marca lateral herdada; texto completo e primeiro passo ao abrir. Sem prévias cortadas em fontes minúsculas.
- Centro: círculo com título Georgia 26px, contexto 14px e contagem. A serifa é reservada ao centro e a poucas frases; o resto usa Segoe UI/sistema.
- Agora: marcador preenchido + palavra. Depois: fundo tonal + “Depois”. Concluída: check + título riscado, mantendo contraste; não desaparece automaticamente.
- Foco: contorno duplo + “No foco”. Proposta: tracejado + origem explícita, estado distinto de “Depois”. Busca: anel ocre + caminho na paleta.
- Forma, texto e contraste acompanham a cor. Corpo e metadados têm no mínimo 14px; pares de texto usam contraste AA, sem reduzir o mapa inteiro para caber.
- Cartões mantêm posições entre atualizações; novos itens ocupam vagas. Linhas hierárquicas ficam sob os cartões, sem rótulos repetindo “contém”.
- Os três caminhos iniciais deixam espaço em branco intencional; não há áreas vazias artificiais para preencher a tela.

## Três coisas que eu removeria

1. As entradas persistentes “Propostas”, “Memória”, “Fontes” e “Skills”: propostas chegam ao mapa; decisões e fontes pertencem ao detalhe; configuração fica sob um comando.
2. A segunda navegação por todas as áreas na lateral global: repete o mapa e compete com a lateral contextual “De onde você veio”.
3. “Conectar ChatGPT” como rodapé de integração: a ação principal passa a ser “Pensar com o ChatGPT”, com uma proposta concreta como demonstração de valor.

## A primeira e única aposta inicial

**Faria primeiro o universo reconhecível de relance, item 1.**
Uma pequena migração de aparência, três famílias de cor e anatomia tipográfica legível transformam todas as visitas, inclusive o widget que já funciona.
É o primeiro passo para alguém olhar uma captura e desejar ter o próprio mapa; retomada e propostas ganham uma base visual que merece atenção.

## Como explorar a entrega

- Abra `index.html` com duplo clique; tudo roda localmente, com CSS/JS inline, sem imagens remotas, dependências ou rede.
- Clique em qualquer área, volte pelo breadcrumb ou pela miniatura e entre em “Biblioteca de aulas” para explorar 40 notas reais do exemplo.
- “Ver no mapa” abre a proposta; confirme ou deixe passar e use “Desfazer”. Tema, busca, atalhos, foco e detalhes são interativos.
- “Dentro do ChatGPT · 600px” muda para uma simulação de altura fixa, sem conectar ao ChatGPT real.
- É um estudo de design: mudanças duram apenas nesta abertura. O modelo e o código do produto não foram alterados.
- Não foram executados build, servidor ou testes. A prévia no navegador foi bloqueada pela revisão automática: a janela disponível exibia outro aplicativo.
