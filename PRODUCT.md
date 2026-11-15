# Business Map 0.5

Ferramenta independente para enxergar o negócio, perceber conexões e retomar um próximo passo. A entrada principal é GitHub + skill portátil; o mapa funciona no navegador sem Paseo. A integração Paseo é opcional.

Áreas, perguntas e cards são livres. Relações e fontes são explícitas, com origem visível. A pessoa decide a estrutura e prioridades. Propostas estruturadas podem criar um rascunho de mapa e são confirmadas parcialmente; não substituem conteúdo existente. Novas notas começam com prioridades neutras.

O agente escolhido conduz a conversa e utiliza skills opcionais. Contexto existente pode gerar um rascunho imediatamente; não há entrevista obrigatória. A skill de entrada orienta até quatro perguntas iniciais e permite gerar com o que há. O Ask local Codex/Claude usa contexto delimitado e devolve candidatos, sem continuar automaticamente outra conversa.

O serviço local é o único escritor. CLI, MCP, navegador e adaptador Paseo são clientes. Runtime de agente não contém credenciais de edição. Browser e Paseo utilizam códigos temporários e canais autorizados, com o limite de confiança entre processos do mesmo usuário descrito em SECURITY.md.

Schema v3, revisão, fingerprint, recibos, gravação atômica e backups protegem a persistência. Migração anterior exige confirmação explícita e encerramento do escritor legado. Não há SaaS, cobrança, colaboração em tempo real, sincronização, priorização automática ou coleta contínua de logs nesta versão.

Critério de sucesso: abrir o negócio, reconhecer o contexto e encontrar um próximo passo em menos de dois minutos, sem precisar repetir uma entrevista. O caminho GitHub deve permitir instalar, abrir, perguntar, revisar e reabrir um mapa sem depender de Paseo.