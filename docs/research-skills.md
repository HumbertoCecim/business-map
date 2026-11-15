# Skills opcionais para o Business Harness

Pesquisa consultada em **14 de novembro de 2026**. Foram inspecionados arquivos `SKILL.md` reais e algumas referências e avaliações dos próprios projetos. **As skills não foram executadas ou instaladas.** Nenhum livro, script ou conteúdo integral de skill foi copiado.

A seleção procura peças pequenas para contexto comercial durável, descoberta, decisões econômicas e retomada do trabalho. Não propõe um coach permanente, método obrigatório ou infraestrutura de agentes. Popularidade e estrelas do GitHub não foram usadas como prova de qualidade. As evidências encontradas permitem avaliar instruções e estrutura, não afirmar resultados de negócio.

## Três prioridades para começar

1. **`product-marketing`, de Corey Haines:** reduz a repetição do contexto e preserva posicionamento, linguagem humana e aprendizados. No Harness, as entradas devem vir primeiro dos cards e notas do founder; extração de código fica opcional.
2. **`product-discovery`, de Magnus Hedemark, no caminho de problema externo:** distingue hipóteses de evidência e ajuda a definir o menor próximo passo de investigação, sem obrigar uma especificação de software.
3. **`financial-modeling`, de Magnus Hedemark:** complementa a visão comercial com margem, custos e caixa. Pode começar apenas com instruções e referências, sem contas conectadas ou scripts.

São prioridades para avaliar um catálogo opcional. O usuário escolhe quais skills usar e pode não escolher nenhuma.

## Shortlist de skills verificadas

“Verificada” significa **texto inspecionado**, não certificação de segurança, compatibilidade ou eficácia. Os links apontam diretamente aos arquivos dos autores.

### 1. `product-marketing` — Corey Haines

[SKILL.md](https://github.com/coreyhaines31/marketingskills/blob/main/skills/product-marketing/SKILL.md) · [Licença MIT](https://github.com/coreyhaines31/marketingskills/blob/main/LICENSE).

**Entradas → saídas:** descrição do negócio, materiais existentes, público e aprendizados → contexto compartilhado de ICP, posicionamento, objeções, linguagem, voz e objetivos, com versões e histórico.

**Avaliação:** boa estrutura de continuidade; perguntas por seção e atualizações localizadas. Há [avaliações declarativas publicadas](https://github.com/coreyhaines31/marketingskills/blob/main/skills/product-marketing/evals/evals.json), incluindo preservação de contexto e adaptação a negócios iniciais; não são prova independente de desempenho.

**Encaixe:** ação opcional “Revisar contexto comercial”. Markdown sem modelo obrigatório; presume arquivos em `.agents/`/`.claude/` e pode escrever ou mover contexto. Adaptar caminhos e apresentar alterações como sugestões antes de incorporar a memória humana.

### 2. `product-discovery` — Magnus Hedemark

[SKILL.md](https://github.com/magnus919/agent-skills/blob/main/product-discovery/SKILL.md) · [Licença MIT](https://github.com/magnus919/agent-skills/blob/main/LICENSE.md).

**Entradas → saídas:** decisão, segmento, hipóteses e evidências → lacunas, registro de evidência e recomendação delimitada de continuar, restringir, adiar ou parar.

**Avaliação:** o [caminho externo](https://github.com/magnus919/agent-skills/blob/main/product-discovery/references/customer-problem-discovery.md) distingue preferência, comportamento relatado, observado e compromisso custoso. Preserva contradições e evita contagens universais de entrevistas. A skill completa também inclui requisitos/SDD; esse fluxo não deve dominar o Harness.

**Encaixe:** “O que sustenta esta hipótese?” ou “Qual evidência falta?”. Declara independência de agente, mas exige suas referências. Consultá-la não autoriza contato com clientes, gravação, coleta ou escrita em sistemas externos.

### 3. `interview-script` — Paweł Huryn

[SKILL.md](https://github.com/phuryn/pm-skills/blob/main/pm-product-discovery/skills/interview-script/SKILL.md) · [Licença MIT](https://github.com/phuryn/pm-skills/blob/main/LICENSE).

**Entradas → saídas:** objetivo de pesquisa, público, hipóteses e notas anteriores → roteiro de entrevista e modelo de anotações em Markdown.

**Avaliação:** pequena, revisável e focada em episódios reais, alternativas e custos atuais. Algumas perguntas hipotéticas e pressupostos de equipe precisam de adaptação. Preparar uma entrevista não valida demanda.

**Encaixe:** roteiro curto ligado a um card. Texto portátil; substituir `$ARGUMENTS` pelo contexto escolhido. O arquivo orienta salvar Markdown, sem enviar mensagens. Gravação depende do consentimento do participante.

### 4. `business-model` — Paweł Huryn

[SKILL.md](https://github.com/phuryn/pm-skills/blob/main/pm-product-strategy/skills/business-model/SKILL.md) · [Licença MIT](https://github.com/phuryn/pm-skills/blob/main/LICENSE).

**Entradas → saídas:** oferta, clientes, operação, hipóteses e concorrência → Business Model Canvas com nove blocos e riscos.

**Avaliação:** ajuda a enxergar conexões comerciais e operacionais; é sobretudo um template. Pode parecer completo mesmo sem evidências. O limiar `LTV > 3× CAC` apresentado no texto não deve virar regra universal de viabilidade.

**Encaixe:** sessão opcional “Explorar modelo de negócio”. Texto sem provider obrigatório ou execução externa exigida no arquivo. Os blocos do canvas não devem definir as áreas obrigatórias do quadro.

### 5. `pricing` — Corey Haines

[SKILL.md](https://github.com/coreyhaines31/marketingskills/blob/main/skills/pricing/SKILL.md) · [Licença MIT](https://github.com/coreyhaines31/marketingskills/blob/main/LICENSE).

**Entradas → saídas:** valor, alternativas, público, preço e métricas disponíveis → opções de cobrança, pacotes, preços e testes.

**Avaliação:** possui referências e [casos de avaliação](https://github.com/coreyhaines31/marketingskills/blob/main/skills/pricing/evals/evals.json). Distingue percepção de preço de compra real. Sua inclinação para SaaS, três planos e heurísticas em dólares exige contexto local.

**Encaixe:** comparar opções num card de decisão, com hipótese e teste proposto. Markdown sem modelo obrigatório; lê contexto comercial convencional. Recomendações de migração de preços não autorizam mudanças em cobrança, site ou contratos.

### 6. `financial-modeling` — Magnus Hedemark

[SKILL.md](https://github.com/magnus919/agent-skills/blob/main/financial-modeling/SKILL.md) · [Licença MIT](https://github.com/magnus919/agent-skills/blob/main/LICENSE.md).

**Entradas → saídas:** receitas, custos, moeda, períodos, segmentos e premissas → cenários, margem, payback, caixa e registros de decisão.

**Avaliação:** explicita premissas, unidades e limitações. A [referência de unit economics](https://github.com/magnus919/agent-skills/blob/main/financial-modeling/references/unit-economics.md) trata coortes e benchmarks com cuidado. Seu [pacote](https://github.com/magnus919/agent-skills/tree/main/financial-modeling) anuncia script Python opcional e avaliações; esses arquivos não foram integralmente inspecionados.

**Encaixe:** área financeira livre, mantendo valores desconhecidos visíveis. Declara independência de host e serviços. Evitar presumir que métricas de SaaS financiado servem a qualquer pequeno negócio.

### 7. `strategy-and-roadmap` — AIDevGTM

[SKILL.md](https://github.com/AIDevGTM/gtm-cofounder/blob/main/skills/01-strategy-and-roadmap/SKILL.md) · [Licença MIT](https://github.com/AIDevGTM/gtm-cofounder/blob/main/LICENSE).

**Entradas → saídas:** brief e pesquisa → diagnóstico, um movimento agora, próximos movimentos, itens estacionados e aprendizados.

**Avaliação:** próximo da necessidade de retomada; orienta oferecer o plano sem impor tarefas. É especializado em devtools/IA e traz persona de cofounder e trilha própria. A pasta numerada difere do `name`; validar empacotamento antes de automatizar instalação.

**Encaixe:** sessão voluntária “Rever meu foco”. Usa arquivos locais e pode encaminhar a pesquisa web e outras skills. Adaptar a saída para sugestões, sem importar sua sequência como comportamento global.

### 8. `chief-of-staff-methodology` — Magnus Hedemark

[SKILL.md](https://github.com/magnus919/agent-skills/blob/main/chief-of-staff-methodology/SKILL.md) · [Licença MIT declarada](https://github.com/magnus919/agent-skills/blob/main/LICENSE.md).

**Entradas → saídas:** decisões, contexto e evidências autorizadas → opções, trade-offs, briefing e memória.

**Avaliação:** reconhece o solo founder como decisor. A [referência de memória](https://github.com/magnus919/agent-skills/blob/main/chief-of-staff-methodology/references/institutional-memory.md) preserva razões, fontes e correções. É ampla; sua exigência de responsável/data para tarefas não serve como regra para cards livres.

**Encaixe:** “Preparar esta decisão” e “Registrar o que decidimos”. Sem runtime obrigatório ou automação própria de e-mail/calendário. O [índice de origem](https://github.com/magnus919/agent-skills/blob/main/chief-of-staff-methodology/references/source-index.md) registra uma reescrita sem afirmar o status jurídico do material anterior; preferir referência ou adaptação original estreita antes de redistribuir conteúdo.

## Lacuna e proposta futura original

Não foi encontrada uma skill pronta que reúna, com leveza, retomada, agora/depois, importante/urgente e primeiro passo entre várias áreas de negócio. `strategy-and-roadmap` cobre GTM; [prioritization-frameworks](https://github.com/phuryn/pm-skills/blob/main/pm-execution/skills/prioritization-frameworks/SKILL.md) é um guia real de métodos, não um procedimento completo de retomada.

Uma futura **`revisar-foco-do-negocio`**, ainda inexistente, poderia receber objetivo humano, cards escolhidos, decisões e limites; devolver até três opções de foco com razões, urgência sustentada por consequência/data real e um primeiro passo por opção. A decisão aceita preservaria autoria, motivo e condição de revisão. Sem pontuação obrigatória, calendário inventado ou mudança automática de prioridade.

Livros e frameworks citados pelos autores são fontes de playbooks; sua menção não equivale a skill pronta ou eficácia comprovada. O [formato oficial Agent Skills](https://agentskills.io/specification) permite instruções, referências e scripts opcionais, mas o suporte depende do host. O plugin pode oferecer seleção e contexto para essas peças, conservando a separação entre fala humana, sugestões do agente e decisões aceitas.
