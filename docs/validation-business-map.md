# Validação Business Map 0.5

Verificado em 15 de novembro de 2026, Windows e Node.js 22.22.3. Os testes de produto e capturas usam negócio fictício; os dados do piloto não fazem parte do código ou pacote público.

- **TypeScript:** aplicação, serviço e adaptador sem erros.
- **Suíte:** 125 testes passando. Inclui schema/migração, backup imutável, concorrência, idempotência, confirmação parcial, preservação de texto/prioridades, isolamento, worktrees, corrupção, skills completas, pareamento, sessão nativa e cancelamento do Ask.
- **Build:** CLI Node e interface web gerados. O chunk do mapa incorpora ELK e é carregado separadamente; permanece maior que o aviso padrão de tamanho do Vite.
- **Interface real:** navegadores Chromium/Edge em 1600×1000 e 390×844, claro e escuro. Criar/editar/excluir, rascunho preservado após recarga e conflito concorrente por SSE foram exercitados. Um salvamento sobre base antiga foi recusado, o texto digitado permaneceu e só foi salvo após comparação/rebase. Nenhum erro de página nesses fluxos.
- **Ask real:** Codex e Claude responderam sobre dados fictícios. O schema usado pelo Claude foi ajustado para draft 7 após falha detectada no teste real. O processo recebe contexto delimitado, sem MCP ambiente; as validações de limite e exclusão de dados fora do alvo têm testes próprios.
- **MCP em agentes reais:** Claude Code e Codex chamaram `business_get_context` e `business_submit_suggestion`. As sugestões ficaram pendentes e não alteraram conteúdo confirmado. No Codex não interativo, a configuração de aprovação foi específica dessas ferramentas, somente naquela chamada; não houve alteração global ou desativação de sandbox.
- **Instalação independente:** pacote instalado com dependências de produção em pasta temporária fora do checkout. CLI, assets HTTP, repetição de abertura, pareamento de uso único, MCP stdio e encerramento ordenado funcionaram sem pacotes `@getpaseo` instalados.
- **Revisão:** Claude Opus revisou a fronteira de capacidades, escritor único e migração. O runtime visível aos agentes não contém credencial de edição. A distinção entre canais do produto e ferramentas externas do mesmo usuário está descrita em SECURITY.md.

Capturas: [claro](screenshots/business-map-light.png), [escuro](screenshots/business-map-dark.png) e [estreito](screenshots/business-map-narrow.png).

Antigravity não foi certificado como provider do Ask. SaaS, MCP remoto no ChatGPT web, sincronização e conectores contínuos de logs/issues não fazem parte desta versão.
