# Validação do piloto Cloud

Validado em 15–16/11/2026, com staging Cloudflare e dados sintéticos. Nenhum dado do negócio local foi enviado à nuvem.

## Verificado

- 27 testes de domínio: SQLite Durable Object, isolamento por dono, CAS concorrente, lotes atômicos, capabilities vinculadas/expiradas/adulteradas, replay, undo, importação determinística, R2 privado de skills/exportações e WebSocket.
- 13 testes de acesso: D1 com migrações reais, cadastro por senha/social passando pelo mesmo hook de convite, convites revogados/expirados, verificação de e-mail, sessão fresca, CSRF e proxy de consentimento OAuth.
- 31 testes MCP/OAuth: transportes reais SDK v2, registro, PKCE, consentimento, refresh, audience, revogação, cliente confidencial fixo sem TTL, escopos, metadados ocultos, confirmação e skills apenas textuais. A biblioteca OAuth instalada valida assinaturas ES256 com chaves efêmeras de teste; assinatura inválida, audience/sub incorretos, expiração e replay são recusados.
- 3 testes do transporte do widget; 8 testes de navegador, incluindo ponte MCP Apps oficial em iframe sob CSP sem rede/eval, tela cheia, confirmação integral, revisão legível com detalhes técnicos opcionais, preservação de rascunho, controles móveis e avisos de remoção apesar de uma justificativa enganosa. O formulário nativo de consentimento preserva Origin sem sobrescrever esse cabeçalho no teste e alcança a origem do callback validado, sem enviar a URL de consentimento como Referer.
- Build de produção e typecheck do Cloud; 125 testes e typecheck da instalação local também passaram.
- [CI em checkout limpo Ubuntu](https://github.com/HumbertoCecim/business-map/actions/runs/43795734891): instalação com lockfiles, build completo, typecheck, todos os 63 testes Cloud e os seis testes de navegador passaram sem segredos ou SDK Paseo instalados.

## Correção CIMD no staging — 16/11/2026

Os Workers OAuth e principal foram publicados somente em staging. A descoberta pública anuncia CIMD e `private_key_jwt`. DCR e o cliente confidencial legado continuam cobertos pelas regressões.

Um navegador Edge real, com conta sintética do operador, completou o formulário publicado sem forçar seu Origin e alcançou os callbacks validados de DCR e CIMD. A integração MCP leu contexto e mapa; DCR permaneceu sem confirmação no widget. Com CIMD, uma proposta sintética foi confirmada, apareceu na API do site e o conteúdo temporário foi restaurado.

Esse cliente de integração usou PKCE público (`none`), também permitido pelos metadados oficiais do ChatGPT. Ele não possui a chave privada da OpenAI e não representa uma conexão real do host ChatGPT. A validação de `private_key_jwt` usa fixtures ES256 na suíte Workers. A instalação pelo próprio ChatGPT, a abertura do componente e a confirmação por um participante continuam aguardando o teste do usuário. Produção não foi publicada.

A reprodução em uma cópia limpa Windows teve um resultado diferente: instalação, widget e TypeScript passaram, mas o build completo atingiu o limite de três minutos na transformação do cliente, sem erro de importação. Esse TypeScript também encontrou 22 declarações genéricas de tipos no diretório ancestral. O CI Linux independente acima concluiu o fluxo inteiro; o timeout específico do ensaio Windows permanece registrado, sem causa estabelecida.

## Fluxo realmente executado na Cloudflare

Duas contas sintéticas, provisionadas pelo operador somente para QA, autenticaram com BetterAuth. A API ignorou a tentativa de selecionar o negócio de outra conta e recusou CSRF. OAuth confidencial completou consentimento e PKCE com issuer/audience públicos. Um cliente SDK chamou o MCP HTTPS real, enviou uma proposta e confirmou que o quadro continuava inalterado. A capability veio somente em `_meta`; uma inválida falhou. Aplicação válida atualizou a mesma revisão vista no site; retry devolveu o mesmo recibo. A outra conta permaneceu intacta. O recurso HTML MCP e exportação JSON foram recuperados.

O navegador também testou o staging: login em português, criação/edição de nota sintética pela interface, recarga/reabertura, temas, largura estreita e saída/entrada. Notas temporárias de teste foram removidas; as contas de QA não correspondem a participantes reais.

Isso valida a integração Cloudflare/MCP e a interface incorporável. **Não equivale a uma confirmação pelo usuário dentro do ChatGPT real.** O teste de API leu a capability como cliente de integração, conforme a fronteira de confiança documentada.

## Critérios ainda pendentes

- Configurar transporte de e-mail e remetente verificado antes de admitir participantes. O staging mantém a verificação obrigatória; o cadastro da interface informa indisponibilidade enquanto não há envio.
- Conectar com OAuth e CIMD, sem copiar credenciais, na conta ChatGPT do piloto e validar abrir → propor → confirmar → reencontrar o mapa na conversa real. O acesso de automação ao navegador da máquina não permitiu concluir esse passo.
- Acompanhar um participante leigo do convite à retomada.

Staging e produção têm configurações separadas. Produção não é liberada enquanto esses critérios do piloto estiverem pendentes. O script de deploy valida o ambiente e recusa placeholders. Segredos e fixtures de QA ficam fora do Git.
