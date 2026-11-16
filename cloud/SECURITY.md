# Segurança do piloto

Identidade, negócio e canal são derivados da sessão BetterAuth ou OAuth validado, consultando autorização atual no D1. O Durable Object confere seu dono novamente. IDs/autoria enviados pelo modelo nunca concedem acesso.

O modelo lê e propõe. Aplicar no ChatGPT exige capability HMAC com segredo próprio, vinculada a usuário, negócio, cliente, grant, ação, proposta, hash, revisão, expiração e nonce. Nonce, recibo e alteração compartilham uma transação SQLite. Retry idêntico devolve o recibo; payload/identidade/revisão diferentes são recusados. Nonces expirados são removidos na emissão. Recibos permanecem para idempotência; só o último snapshot é mantido para undo.

Capabilities aparecem apenas em `_meta` e na memória do componente: nunca em transcript, conteúdo estruturado, URLs, logs, armazenamento do navegador ou contexto do modelo. O componente mostra diferenças calculadas do estado canônico e identifica títulos/justificativas como texto do assistente.

**Fronteira de confiança:** o piloto confia no isolamento do host ChatGPT entre modelo e componente. OAuth não prova presença humana. Um cliente MCP bruto com a mesma credencial pode ler `_meta`; extensões e hosts maliciosos estão fora dessa garantia. A allowlist é política de registro do conector, não identidade criptográfica. Outros clientes leem/propõem e confirmam no site. Não se afirma proteção por mTLS.

O Worker OAuth é privado e recebe identidade somente pelo Service Binding. Headers externos são descartados. PKCE S256 e state são obrigatórios; consentimento se vincula à sessão e geração atual da conta. Desconectar rotaciona a geração no D1 antes de revogar grants no KV: tokens/refreshes antigos são recusados mesmo durante propagação.

CIMD usa a biblioteca OAuth instalada para validar os documentos e assinaturas `private_key_jwt`. Somente o identificador oficial exato do ChatGPT recebe a política automática de confirmação; DCR continua limitado a consulta/propostas. A página de consentimento preserva o Origin do formulário nativo e seu CSP só permite o callback previamente validado, mantendo a recusa de origens estrangeiras, cookies ausentes e handles adulterados.

O site valida sessão e Origin nas mutações. Verificação de e-mail é obrigatória nos ambientes publicados. Convites revogados/expirados e contas banidas são recusados sem depender do cookie cache. Billing está desligado.

R2 é privado. Skills têm caminhos, manifesto, tamanho e hashes validados; seu conteúdo é não confiável. Scripts nunca são executados e URLs não são baixadas automaticamente. MCP lê apenas recursos textuais selecionados.

Segredos ficam em bindings Cloudflare. `.dev.vars*`, `oauth/.credentials/`, configurações reais e fixtures privadas ficam fora do Git. Logs do aplicativo não contêm corpos de negócios, propostas, skills, senhas, códigos OAuth ou capabilities. Observabilidade Cloudflare está desligada por padrão.

Antes de incluir dados sensíveis, valide operação, retenção e recuperação. Relate vulnerabilidades sem dados privados em uma issue e solicite um canal reservado.
