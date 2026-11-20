# GrowYourPlan · o chat e o momento de pagar

Mockup: `index.html` (abre com duplo clique). Aba 1: widget numa conversa simulada, com quatro momentos. Aba 2: landing, preço e a tela depois de pagar.

## (a) Conceito em 3 frases

1. O widget no chat não é um visualizador de mapa. É uma **mesa de decisão**: o mapa encolhe no topo e a bandeja de propostas fica fixa embaixo, com um botão que diz quantas mudanças vão entrar ("Aceitar 4").
2. Cada pergunta muda a forma do widget. "Despejar a cabeça" mostra itens já distribuídos por áreas coloridas. "O que eu faço agora?" esconde o mapa e mostra uma coisa só, com o primeiro passo.
3. A venda é honesta: a IA é da pessoa, então cobramos pouco pelo lugar onde o plano mora. A exportação em Markdown nunca fica atrás do pagamento.

## (b) Ideias, da que mais faz querer pagar para a que menos

**1. Despejo que já sai arrumado (triagem no chat)**
- O que é: uma frase bagunçada vira N itens, cada um numa área existente, com chip de cor. Um seletor por linha muda a área, e o mapa acima atualiza ao vivo. "Palpite" marca as dúvidas do assistente. Um único "Aceitar 7".
- Por que funciona: é o "uau" para quem tem TDAH. Transforma ansiedade em lista revisável em 15 segundos, sem preencher formulário.
- Esforço: M. Dados: existentes (`card.save` em lote, `section`). Campo novo opcional: `proposal.items[].confidence` para o "palpite".

**2. Bandeja de propostas com aceite em um toque**
- O que é: linhas com caixa já marcada. Desmarcar significa "isso não". Desmarcar a criação de uma subárea desmarca as notas dela. O tracejado vira sólido no lugar, e o Desfazer fica visível sem prazo até a próxima mudança.
- Por que funciona: deixa claro que a pessoa tem o controle, que é a principal objeção a uma IA mexendo no plano.
- Esforço: M. Dados: existentes (proposta, `apply`/`reject`, `undo`). Exige aplicar parte da proposta (sub-seleção), que o `map.apply` já aceita por IDs.

**3. Visão "Agora" dentro do widget**
- O que é: quando a pergunta é "o que eu faço agora?", aparece um cartão grande com o caminho, o título, o **primeiro passo** em destaque e o motivo vindo do mapa (foco, relação "destrava"). Os botões são "Fiz isso" e "Agora não". "Agora não" não pune e mostra o próximo item.
- Por que funciona: resolve a paralisia de escolha sem pontuação. É o motivo para abrir o app todo dia.
- Esforço: M. Dados: existentes (`focus.cardIds`, `firstStep`, `relations`). Novo: parâmetro `view: "map" | "now"` em `business_show_map`.

**4. Uma cor e um ícone por área**
- O que é: uma paleta de 6 tons (íris, coral, folha, âmbar, azul-petróleo, ameixa) com pares claro e escuro em contraste AA. Emoji opcional. As notas herdam a cor da área.
- Por que funciona: hoje tudo é o mesmo verde. A cor faz o mapa parecer da pessoa e ajuda a reconhecer as áreas num relance. Fica no plano gratuito, porque é o que dá vontade de mostrar o mapa para alguém.
- Esforço: P. Dados: **campos novos** `section.color` (enum de 6 tons) e `section.icon` (até 2 caracteres).

**5. Landing que é o produto (demonstração no topo)**
- O que é: o título "Despeje tudo no chat. Aprove um mapa em um toque." e, ao lado, uma demonstração animada do ciclo frase → tracejado → aceitar → sólido, com botão de pausa e respeito a movimento reduzido. Três provas: mora no chat, nada entra sem você, sai em Markdown.
- Por que funciona: hoje o ChatGPT aparece como "integração opcional" num link de canto. A demonstração vende o diferencial em 5 segundos.
- Esforço: M. Dados: nenhum (conteúdo estático).

**6. Preço justo e explicado**
- Grátis, R$ 0 para sempre: 1 mapa com os 5 níveis, até 80 notas, ChatGPT completo, desfazer a última mudança, exportar Markdown e JSON.
- Pro, **R$ 16/mês ou R$ 160/ano**: mapas e notas ilimitados, histórico de versões de 90 dias, revisão da semana, skills e fontes ilimitadas.
- Fundador, **R$ 290 pagos uma vez**, só durante o piloto: Pro sem mensalidade. Não há contador. Avisamos 30 dias antes de encerrar essa opção.
- Por que funciona: o limite gratuito aparece depois que a pessoa já depende do mapa (cerca de 80 notas). A justificativa "a IA é sua" torna o preço baixo crível. Cancelar fica num botão visível. Depois de cancelar, os mapas continuam abertos para leitura e exportação.
- Esforço: M (checkout, limites). Dados: **novo** `account.plan`. Vários mapas exige confirmar se um usuário pode ter vários `businessId`.

**7. O momento logo depois de pagar**
- O que é: "Pronto. Seu mapa não mudou, só perdeu o teto." Um recibo claro mostra o valor, a próxima cobrança com aviso 3 dias antes e onde cancelar. Em seguida vem uma sugestão útil (dar cor às áreas). Sem confete.
- Por que funciona: reduz o arrependimento da compra e mostra respeito, que é o que faz algo barato parecer caro.
- Esforço: P. Dados: `account.plan` (novo).

**8. Revisão da semana sem IA (Pro)**
- O que é: uma página determinística com o que foi concluído, o que entrou e o "onde parei". Não usa pontos nem sequências de dias. O tom é "olha o que você fechou", nunca "você falhou".
- Por que funciona: quem tem TDAH esquece o que já fez, e ver o progresso devolve motivação. É a função que justifica a assinatura mensal.
- Esforço: M. Dados: **campos novos** `card.doneAt` e `card.createdAt`. O histórico de transações pode servir de base.

**9. Exportar como pasta do Obsidian**
- O que é: além do `.md` único de hoje (uma seção `##` por área, `###` por nota), gerar um zip com uma nota por arquivo, propriedades no topo (lane, done, important) e links `[[ ]]` para as relações.
- Por que funciona: para um fã de Obsidian, "seus dados são seus" precisa ser verificável. Na landing isso aparece como "em breve", sem fingir que já existe.
- Esforço: P/M. Dados: existentes.

**10. Estados vazios e microtextos**
- O que é: o mapa vazio dentro do chat diz "Seu mapa começa por uma frase." e oferece frases prontas para mandar. "Agora não" responde "Guardado para depois. Sem pressa." O widget repete sempre "Nada muda até você aceitar".
- Por que funciona: é aqui que um produto barato parece cuidado. Os textos tiram a culpa sem infantilizar.
- Esforço: P. Dados: existentes.

## Primeiros 60 segundos (como aparece na landing)

0 s: a pessoa vê a demonstração. 10 s: clica em "Usar no ChatGPT" e faz login com Google. 25 s: o assistente faz uma pergunta só ("O que está ocupando sua cabeça?"). 35 s: a pessoa despeja tudo. 50 s: vê as propostas tracejadas e coloridas. 60 s: toca em "Aceitar 7".
Dependência real: isso só cabe em 60 s se o app estiver no diretório do ChatGPT. Conectar manualmente pelo modo desenvolvedor leva minutos. Até lá, a promessa de "um minuto" deve valer a partir do chat já conectado.

## (c) Três coisas que eu removeria da interface atual

1. **Fontes de 7 a 10 px nos nós e metadados.** O mínimo seria 13 px para rótulos e 15 px para títulos de nó. É melhor cortar a meta-informação ("0 itens") do que encolher o texto.
2. **"Conectar ChatGPT" repetido no canto, como item opcional.** Deve virar o estado principal de conexão. A mesma ação aparece hoje duas vezes, no topo e na lateral.
3. **Controles de zoom, legenda e "Clique para ver detalhes · Abra a seta para explorar" dentro do widget.** Em 600 px de altura, eles roubam espaço da decisão. O mapa se ajusta sozinho, e um toque no nó abre o nível.

## (d) A única coisa que eu faria primeiro

**A bandeja de propostas com aceite em um toque e o tracejado que vira sólido no lugar (ideia 2), já com a cor por área (ideia 4).** Esse momento vende o produto na demonstração, na landing e no uso diário. As outras ideias dependem dele.
