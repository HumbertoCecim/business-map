# Validação do piloto Cloud

Validado em 15/11/2026, com staging Cloudflare e dados sintéticos. Nenhum dado do negócio local foi enviado à nuvem.

## Verificado

- 27 testes de domínio: SQLite Durable Object, isolamento por dono, CAS concorrente, lotes atômicos, capabilities vinculadas/expiradas/adulteradas, replay, undo, importação determinística, R2 privado de skills/exportações e WebSocket.
- 13 testes de acesso: D1 com migrações reais, cadastro por senha/social passando pelo mesmo hook de convite, convites revogados/expirados, verificação de e-mail, sessão fresca, CSRF e proxy de consentimento OAuth.
- 20 testes MCP/OAuth: transportes reais SDK v2, registro, PKCE, consentimento, refresh, audience, revogação, cliente confidencial fixo sem TTL, escopos, metadados ocultos, confirmação e skills apenas textuais.
- 3 testes do transporte do widget; 6 testes de navegador, incluindo ponte MCP Apps oficial em iframe sob CSP sem rede/eval, tela cheia, confirmação integral, revisão legível com detalhes técnicos opcionais, preservação de rascunho, controles móveis e avisos de remoção apesar de uma justificativa enganosa.
- Build de produção e typecheck do Cloud; 125 testes e typecheck da instalação local também passaram.

Uma cópia limpa instalou dependências, construiu o widget e passou no TypeScript sem instalar ou compilar pacotes Paseo. O TypeScript ainda encontrou 22 declarações genéricas de tipos no diretório ancestral; portanto, esse ensaio não comprova isolamento completo dos tipos. O build completo dessa cópia foi interrompido no limite de três minutos durante a transformação do cliente, sem erro de importação. O build de produção usado no deploy passou no checkout de desenvolvimento; a reprodução integral a partir de um checkout limpo permanece pendente.

## Fluxo realmente executado na Cloudflare

Duas contas sintéticas, provisionadas pelo operador somente para QA, autenticaram com BetterAuth. A API ignorou a tentativa de selecionar o negócio de outra conta e recusou CSRF. OAuth confidencial completou consentimento e PKCE com issuer/audience públicos. Um cliente SDK chamou o MCP HTTPS real, enviou uma proposta e confirmou que o quadro continuava inalterado. A capability veio somente em `_meta`; uma inválida falhou. Aplicação válida atualizou a mesma revisão vista no site; retry devolveu o mesmo recibo. A outra conta permaneceu intacta. O recurso HTML MCP e exportação JSON foram recuperados.

O navegador também testou o staging: login em português, criação/edição de nota sintética pela interface, recarga/reabertura, temas, largura estreita e saída/entrada. Notas temporárias de teste foram removidas; as contas de QA não correspondem a participantes reais.

Isso valida a integração Cloudflare/MCP e a interface incorporável. **Não equivale a uma confirmação pelo usuário dentro do ChatGPT real.** O teste de API leu a capability como cliente de integração, conforme a fronteira de confiança documentada.

## Critérios ainda pendentes

- Configurar transporte de e-mail e remetente verificado antes de admitir participantes. O staging mantém a verificação obrigatória; o cadastro da interface informa indisponibilidade enquanto não há envio.
- Configurar o conector privado com as credenciais fixas na conta ChatGPT do piloto e validar abrir → propor → confirmar → reencontrar o mapa na conversa real. O acesso de automação ao navegador da máquina não permitiu concluir esse passo.
- Acompanhar um participante leigo do convite à retomada.

Staging e produção têm configurações separadas. Produção não é liberada enquanto esses critérios do piloto estiverem pendentes. O script de deploy valida o ambiente e recusa placeholders. Segredos e fixtures de QA ficam fora do Git.
