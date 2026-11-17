# GrowYourPlan

Mapa vivo do negócio: edição manual no site, inteligência no seu ChatGPT. Piloto por convite, **um negócio por conta**. O site não chama modelos nem cobra por IA.

## Primeiro uso

1. Crie sua conta com o e-mail convidado e confirme o e-mail.
2. Informe o nome do negócio. Crie áreas e notas livremente; skills são opcionais.
3. Em **Conectar ChatGPT**, copie o endereço `/mcp`, selecione **OAuth** e escolha **CIMD** como registro do cliente. A identificação é automática, sem copiar Client ID ou Client Secret. Entre com seu login GrowYourPlan e autorize a conexão. O servidor recusa o modo sem autenticação.
4. No ChatGPT, peça: “Abra meu mapa e proponha uma estrutura com o contexto que já temos”.
5. Abra **Propostas**, compare o antes/depois calculado pelo servidor e confirme o lote inteiro. Propostas não alteram o conteúdo antes disso.

A orientação pede no máximo quatro perguntas iniciais, uma por vez, e permite gerar um rascunho incompleto imediatamente. Também é possível trabalhar sem IA.

**Desfazer** cria uma nova revisão e só desfaz a última transação, preservando mudanças posteriores. No ChatGPT, só desfaz transações do canal ChatGPT; o site também pode desfazer sua edição ou importação mais recente.

## Navegar por níveis

No nível 1, o negócio fica no centro. Use a seta **Explorar** de uma área ou nota para colocá-la no centro; o mapa lateral mostra automaticamente seu nível anterior. O caminho acima permite voltar diretamente à empresa ou a qualquer ancestral. Selecionar um item abre seus detalhes sem mudar o nível.

São até **cinco níveis, contando a empresa e cada área ou nota**. Por exemplo: empresa → clientes → hipótese de público → pesquisa → roteiro. Áreas podem pertencer a outras áreas ou notas; não há estrutura ou metodologia obrigatória. A busca percorre também os ramos fechados.

No site, use **Subárea** ou **Criar aprofundamento** para abrir um ramo. O campo **Dentro de** permite escolher ou mudar sua localização. No nível 5, desenvolva o conteúdo existente ou volte um nível para adicionar itens. Excluir um item também remove todos os seus aprofundamentos; a confirmação informa esse alcance.

No ChatGPT, peça um aprofundamento e revise a proposta antes de confirmar. A ferramenta `business_show_map` aceita `focusId` para abrir um item existente. Propostas criam ancestrais antes dos descendentes, usando `section.parentId`; notas pertencem à sua área. Relações semânticas continuam independentes dessa hierarquia.

Após atualizar o conector no ChatGPT, peça **“Abra meu mapa novamente”**. A versão 0.2.0 usa o recurso `map-v4.html`; conversas antigas continuam resolvendo os recursos anteriores. A altura inline continua limitada, sem observador de redimensionamento do documento.

## Desenvolvimento

Base pública FlareStarter no commit `446571d2d7312e7f86bf25fced154a9d5e79abb7`. Licença e atribuição em [UPSTREAM.md](UPSTREAM.md). Sem Pro. Rotas comerciais e demonstrações do starter não integram o piloto.

Requisitos: Node >=22.12 e pnpm 10.33.1.

Use um checkout de desenvolvimento separado da instalação do negócio.

```sh
npm ci --omit=dev --ignore-scripts # raiz do repositório: dependências puras de shared/
cd cloud
pnpm install --frozen-lockfile
cp wrangler.example.jsonc wrangler.jsonc
cp .dev.vars.example .dev.vars
pnpm db:migrate:local
pnpm build:widget
pnpm dev
```

Preencha os segredos locais e um e-mail convidado em `.dev.vars`. Configure também o Worker OAuth privado e seu Service Binding. Consulte [OAuth e conexão CIMD](oauth/README.md).

```sh
pnpm test:business
pnpm test:pilot
pnpm test:mcp
pnpm test:widget
pnpm test:ui
pnpm build
pnpm typecheck:cloud
```

O build gera o widget e as rotas antes do typecheck. Testes Workers usam SQLite, D1, KV, R2 e WebSocket no workerd. Testes de interface usam dados sintéticos e a ponte MCP Apps oficial; não substituem a validação no ChatGPT real.

## Implantação

1. Crie D1, KV de cache, KV OAuth e R2 privado **separados por ambiente**. Preencha todos os bindings em `env.staging` e `env.production`; Wrangler não os herda.
2. Use a mesma origem pública para `PUBLIC_APP_URL`, `BETTER_AUTH_URL`, `OAUTH_ISSUER` e a base de `MCP_SERVER_URL`; este termina em `/mcp`.
3. Configure `BETTER_AUTH_SECRET` e `APPROVAL_SECRET` aleatórios e independentes, com >=32 caracteres, por `wrangler secret put`. Nunca grave valores no Git.
4. Configure `RESEND_API_KEY` e `EMAIL_FROM` verificado **antes de convidar pessoas**. Sem entrega de e-mail, o cadastro na interface fica indisponível e a API mantém verificação obrigatória.
5. Aplique `wrangler d1 migrations apply DB --env staging --remote`.
6. Publique o OAuth: `wrangler deploy --config oauth/wrangler.jsonc --env staging`.
7. Execute `pnpm deploy:staging`. O script seleciona explicitamente o ambiente, constrói e publica o arquivo gerado correto.
8. O Worker OAuth exige `clientIdMetadataDocumentEnabled` e a flag `global_fetch_strictly_public`, já configuradas. A descoberta deve anunciar CIMD e `private_key_jwt` antes de conectar o ChatGPT.
9. Escolha CIMD no conector ChatGPT. O ID oficial é reconhecido após validação pela biblioteca. `APPROVED_CHATGPT_CLIENT_IDS` mantém a compatibilidade com clientes fixos existentes nos **dois** Workers; o bootstrap legado continua documentado em `oauth/README.md`. DCR permanece disponível para leitura/propostas, com confirmação no site.
10. Valide o fluxo real no ChatGPT antes de abrir convites. Produção exige recursos e cliente próprios; o script recusa placeholders.

Convites D1: tabela `pilot_invite`, e-mail em minúsculas, `status='active'`, `created_at` em milissegundos e `expires_at` opcional. Revogar/expirar corta o acesso de sessões existentes. Revogação explícita prevalece sobre `PILOT_INVITE_EMAILS` e `ADMIN_EMAILS`, destinados ao bootstrap privado.

## Arquitetura

- `src/business/`: domínio compartilhado, único escritor SQLite Durable Object por negócio, revisões, recibos, auditoria e undo.
- `src/features/pilot/`: convites, associação usuário/negócio e API com sessão. O servidor resolve identidade e negócio; argumentos do modelo não os escolhem.
- `src/mcp/`: Streamable HTTP. Ferramentas públicas `business_get_context`, `business_query`, `business_read_skill`, `business_submit_proposal`, `business_show_map`. Confirmação exige ferramentas exclusivas do componente.
- `oauth/`: OAuth, PKCE S256, consentimento e audience. Desconectar rotaciona uma geração no D1, invalidando tokens antigos sem depender da propagação do KV.
- `src/features/business/`: React Flow com foco hierárquico, edição manual, conflitos e rascunhos por negócio.
- `widget/`: MCP App autocontido. Capabilities chegam em `_meta` e ficam somente na memória do transporte.

O site recebe invalidações WebSocket e busca o estado autenticado. O widget atualiza após operações e a cada 15s enquanto visível. Coordenadas são derivadas.

## Dados e limites

Importar um board local cria uma cópia independente em um negócio vazio. Mantém conteúdo, IDs e sugestões locais pendentes; remove credenciais, caminhos e vínculos ativos. Não há sincronização com o aplicativo local.

Skills são pacotes imutáveis com manifesto/hashes no R2 privado. Nada é executado ou instalado no ChatGPT. O MCP lê `SKILL.md` e recursos UTF-8 selecionados; binários ficam no pacote para exportação.

JSON/Markdown exportam o quadro portátil. Propostas cloud ainda não confirmadas são registros separados: resolva-as antes de transferir o quadro. Histórico técnico e credenciais OAuth não são exportados. Limites: quadro 4MB, 100 propostas pendentes, 100 comandos/lote; skills 400 arquivos/20MB e 2MB por arquivo.

Sem equipes, cobrança, execução de agentes locais, instalação automática de skills ou publicação no diretório ChatGPT. A versão local 0.5 continua independente.

Veja [SECURITY.md](SECURITY.md) e [VALIDATION.md](VALIDATION.md).
