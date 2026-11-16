# OAuth e MCP do piloto

O Worker OAuth é privado: `workers_dev: false`, sem rotas públicas e sem preview URL. O Worker principal publica `/authorize`, `/token`, `/register` e a descoberta OAuth por service binding para `OAuthBinding`. O issuer público é a origem do SaaS; o recurso protegido é exatamente `<origem>/mcp`.

O principal autentica a sessão BetterAuth, confere convite/conta e deriva o negócio em D1 antes de encaminhar `/authorize`. Ele remove os headers externos `x-business-user-id`, `x-business-user-email` e `x-business-oauth-generation`, e fornece seus valores por service binding. O Worker OAuth nunca deve receber uma rota pública independente: esses headers são uma fronteira interna de confiança, e não uma autenticação de Internet.

## Conectar automaticamente com CIMD

No ChatGPT, informe a URL HTTPS `<origem>/mcp`, escolha **OAuth** e selecione **CIMD**. Não é necessário preencher Client ID nem Client Secret. Entre com sua conta do Business Map, autorize e instale o plugin antes de usá-lo na conversa.

O Worker OAuth usa `clientIdMetadataDocumentEnabled: true` e a flag `global_fetch_strictly_public`. A biblioteca instalada recupera e valida os metadados CIMD e as chaves públicas JWKS; a troca `private_key_jwt` verifica a assinatura do cliente. Somente o ID exato `https://chatgpt.com/oauth/client.json` recebe a política de confirmação ChatGPT automaticamente. Nome, prefixos, query strings ou URLs semelhantes não concedem essa permissão.

A página de consentimento preserva a origem do POST nativo com `Referrer-Policy: same-origin`. Seu CSP permite somente a própria origem e a origem do callback previamente validado pela biblioteca. A verificação estrita de Origin, cookies de vínculo, handle de uso único e PKCE continua aplicada.

O registro DCR permanece disponível para outros clientes: consulta e propostas com confirmação pelo site. Clientes fixos existentes também continuam funcionando por sua allowlist explícita; o procedimento abaixo é legado, não um requisito para novos participantes no ChatGPT.

## Compatibilidade: conector fixo legado

Conectores legados podem usar um **cliente confidencial fixo**, criado pelo operador com `OAuthHelpers.createClient`. O ID é gerado uma vez e reutilizado; cada conta ainda autentica e autoriza seu próprio negócio. Novos participantes devem preferir CIMD.

1. Faça deploy do Worker OAuth privado com `OAuthBinding.ensureChatgptClient`. Esse método existe somente na service binding; nenhuma rota HTTP de bootstrap é publicada.
2. Da pasta `cloud`, execute `node oauth/bootstrap/run.mjs staging` uma única vez por operador. O script abre um helper **somente em 127.0.0.1**, com chave aleatória efêmera e service binding remota autenticada pelo Wrangler, chama o método privado e encerra o helper. As credenciais são gravadas em `oauth/.credentials/chatgpt-staging.json`, ignorado pelo Git. Nada imprime o secret. Para produção, use o argumento `production` após configurar o ambiente e a URL MCP de produção.
3. O cliente criado não tem TTL de registro. O provedor armazena somente o hash do secret, e o valor original é retornado apenas na primeira criação. Uma segunda execução mantém o mesmo ID, não gira o secret e preserva a cópia local existente. Guarde essa cópia em local seguro; se ela for perdida, faça reparo/rotação explícita pelo operador, sem criar clientes adicionais às cegas. Execute o bootstrap de forma serial: o ponteiro em KV não é um lock distribuído.
4. Defina `APPROVED_CHATGPT_CLIENT_IDS` nos **dois Workers**, principal e OAuth, com um array JSON contendo o `clientId` desse arquivo. Uma lista separada por vírgulas também é aceita. Use `wrangler secret put APPROVED_CHATGPT_CLIENT_IDS --config oauth/wrangler.jsonc --env staging` para o OAuth e a configuração do principal para o outro secret. Não use nome, e-mail, hostname ou prefixo no lugar do ID exato.
5. Configure o conector MCP no ChatGPT com a URL HTTPS `<origem>/mcp`, OAuth e o **Client ID e Client Secret fixos** do arquivo, em vez de criar um cliente DCR novo. A descoberta anuncia `business:read`, `business:propose` e `business:approve`. O cliente confidencial exige seu secret no token endpoint; a biblioteca aceita Basic ou POST e nunca aceita `none` para esse cliente.
6. O único callback permitido no cliente fixo é `https://chatgpt.com/connector_platform_oauth_redirect`, o callback estável documentado oficialmente para servidores que anunciam e retornam `iss`, como este. Confira o callback exibido pela configuração do ChatGPT. Um callback diferente exige revisão explícita da configuração; `chat.openai.com` e padrões com curingas não são cadastrados automaticamente.
7. Cada pessoa convidada entra no SaaS e aceita o consentimento. A página mostra o ID fixo e `business:approve`. Teste leitura, proposta, prévia canônica e confirmação por clique. O modelo pode criar propostas; somente a interface recebe os valores de confirmação em `_meta`. Se uma conexão antiga só tiver leitura/propostas, reconecte com as credenciais fixas: grants existentes não ganham escopos retroativamente.

O registro dinâmico `/register` continua disponível para outros clientes OAuth, mas sua permissão `business:approve` é removida no consentimento e em cada emissão/renovação de token. O principal exige o ID oficial CIMD ou um ID legado explicitamente aprovado antes de atribuir o canal `chatgpt`. Clientes DCR podem ler/propor e confirmar no site autenticado. Um nome DCR como “ChatGPT” nunca é suficiente para obter aprovação.

Ferramentas públicas: `business_get_context`, `business_query`, `business_read_skill`, `business_submit_proposal` e `business_show_map`. Ferramentas de interface: `business_get_ui_state`, `business_apply_proposal`, `business_reject_proposal` e `business_undo`.

`business_read_skill` devolve apenas `SKILL.md` por padrão. Um `path` explícito deve coincidir exatamente com o manifesto e ser um arquivo UTF-8; recursos binários são recusados com uma mensagem legível. O manifesto completo permanece na resposta para descobrir os recursos disponíveis. As instruções MCP orientam o agente externo a usar primeiro o contexto existente, fazer no máximo quatro perguntas iniciais e produzir imediatamente um rascunho útil mesmo incompleto.

## Revogação e reconexão

Cada associação de negócio tem uma `oauthGeneration` em D1. O consentimento guarda a geração fornecida pelo principal e recusa troca de conta/geração entre GET e POST. Access tokens e refresh tokens preservam a geração original do consentimento. Cada pedido MCP consulta novamente a associação atual e exige igualdade exata da geração. Desconectar gira a geração em D1 antes de revogar os grants no OAuth KV, impedindo uso de tokens antigos mesmo durante a propagação eventual do KV. Uma nova conexão usa a nova geração.

Os access tokens duram 15 minutos; refresh tokens, 7 dias. PKCE S256 é obrigatório; issuer, audiência/recurso e expiração são conferidos. O consentimento usa o cookie de vínculo e o handle de uso único da biblioteca, mais vínculo com usuário e geração, e exige a origem correta no POST. Negar retorna `access_denied`, `state` e `iss` ao destino validado.

## Limite de confiança do piloto

A allowlist é política do operador. Ela não atesta criptograficamente o host nem prova, sozinha, um clique humano. O piloto confia no host ChatGPT aprovado para ocultar `_meta` do modelo e filtrar ferramentas `visibility: ["app"]`. Um cliente bruto que já possua um token desse cliente aprovado pode ver `_meta`; este piloto não oferece isolamento contra esse cliente hostil. Não use headers de host, nome do cliente ou metadados enviados pelo modelo como prova de origem.

Além dessa fronteira, o servidor verifica os escopos em cada handler, o canal autenticado e os valores de confirmação vinculados a usuário, negócio, cliente, grant, ação, alvo, hash, revisão e validade. O Durable Object consome um nonce uma única vez e registra recibos idempotentes. Ferramentas privadas continuam verificadas mesmo em chamadas `tools/call` feitas diretamente. A prévia exibida usa somente dados obtidos do servidor; textos de mapas/fontes/skills nunca autorizam operações.

O SaaS não chama API de modelos. A conversa e o uso de IA pertencem à conta externa usada pela pessoa.

## Verificação local

Da pasta `cloud`, execute `node node_modules/vitest/vitest.mjs run --config vitest.mcp.config.ts`. Os testes cobrem transporte real do SDK MCP, schemas, propostas sem mutação, metadados privados, identidade/escopos, chamadas privadas forjadas, DCR, consentimento, PKCE, refresh, revogação, recurso/audiência e expiração.

As interfaces foram conferidas nos pacotes instalados `@cloudflare/workers-oauth-provider@1.2.4`, `agents@0.33.0` e SDK MCP v2 `2.4.0`. Referências oficiais: [Cloudflare OAuth](https://developers.cloudflare.com/agents/model-context-protocol/protocol/authorization/), [autenticação no ChatGPT](https://developers.openai.com/plugins/build/auth) e [MCP Apps](https://apps.extensions.modelcontextprotocol.io/api/documents/patterns.html).
