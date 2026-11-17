# GrowYourPlan 0.2.0 — validação

Data: 16/11/2026. Ambiente: Windows, Chrome desktop, Cloudflare staging.

## Entrega

- Foco recursivo: empresa no nível 1, até cinco níveis contando áreas e notas.
- Centro atual, miniatura do pai e breadcrumb com retorno direto a ancestrais.
- Inspeção separada de exploração; busca global revela ramos fechados.
- Criação e mudança de localização pelo site, propostas tipadas pelo MCP, confirmação humana existente.
- Posições fixas e câmera preservada em polling, alterações de texto e novos irmãos.
- Exclusão recursiva informada; foco removido externamente volta a um ancestral existente.
- Schema v3 mantido, `section.parentId` opcional; JSON e Markdown preservam hierarquia.
- Nome GrowYourPlan no site, login, consentimento e recursos MCP. Identificadores de infraestrutura e URLs existentes preservados.

## Verificações automatizadas

- 125 testes da instalação local, store, tools e adaptador: passaram.
- 37 testes do domínio cloud/SQLite, incluindo hierarquia e undo: passaram.
- 13 testes de acesso/piloto: passaram.
- 34 testes MCP/OAuth/CIMD: passaram.
- 3 testes do transporte do widget: passaram.
- 15 testes de navegador: navegação por cinco níveis, criação aninhada, busca, retorno, rascunhos/conflito, confirmação pela ponte oficial, temas, largura estreita, altura limitada e câmera estável.
- Typecheck cloud e local/web; build staging e dry-run Wrangler.

## Staging

- Aplicação: `7ab5e821-fad6-4050-9fc1-54df19a74ecd`.
- OAuth: `0779f833-65b6-4759-8f30-aac34f0a3798`.
- `/login`: 200, título GrowYourPlan.
- Descoberta OAuth: 200, CIMD anunciado.
- Metadados de recurso protegido: 200, origem pública correta.
- `/mcp` sem token: 401 com challenge OAuth e URL de metadados correta.

Capturas sintéticas: [visão geral](../cloud/artifacts/growyourplan/growyourplan-root-light.png), [nível 4](../cloud/artifacts/growyourplan/growyourplan-level-four-light.png), [escuro](../cloud/artifacts/growyourplan/growyourplan-level-four-dark.png), [estreito](../cloud/artifacts/growyourplan/growyourplan-narrow-dark.png).

## Limites

Não houve nova validação na conta real do usuário no ChatGPT nesta rodada. O teste incorporado usa AppBridge/PostMessageTransport oficiais em Chrome; a persistência usa o SQLite real no workerd. Para carregar os metadados novos, atualizar o conector e abrir um mapa novo. Nenhum domínio foi comprado e nenhum dado real foi reestruturado automaticamente.
