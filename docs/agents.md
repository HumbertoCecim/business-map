# Conectar agentes locais

Abra o serviço para a pasta correta antes de conectar o agente. A CLI e o MCP encaminham as operações ao mesmo escritor. Nenhum comando de agente confirma propostas ou altera prioridades.

## Codex

Uma configuração de projeto pode usar o adaptador stdio:

```toml
[mcp_servers.business_map]
command = "business"
args = ["mcp", "--root", "/pasta/absoluta/do/negocio"]
default_tools_approval_mode = "writes"
```

As ferramentas de leitura são anotadas como somente leitura. Submeter proposta modifica a fila de candidatos e pode exigir aprovação do cliente. Num `codex exec` sem interação, uma política de aprovação `never` pode recusar a chamada, mesmo que o servidor esteja conectado. Para uma automação já autorizada, a configuração por ferramenta permite autorizar somente a submissão:

```toml
[mcp_servers.business_map.tools.business_submit_suggestion]
approval_mode = "approve"
```

Essa autorização permite criar candidatos; confirmar conteúdo continua sendo uma ação no mapa. Escolha a política conforme seu ambiente, sem desabilitar o sandbox ou aprovar ferramentas de outros servidores. Estes exemplos não modificam sua configuração automaticamente. [Configuração oficial](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)

## Claude Code

Use a configuração MCP de projeto com o comando `business` e argumentos `mcp --root <pasta>`. Para testes isolados, `--strict-mcp-config` permite carregar apenas o arquivo explicitamente selecionado. Autorize as ferramentas do Business Map segundo as permissões do cliente; a credencial disponível ao MCP só lê e propõe.

## Antigravity e outros clientes

Podem usar a CLI ou o MCP quando seu transporte e permissões forem compatíveis. A disponibilidade do comando AGY no computador não comprova integração completa. O Ask desta versão oferece Codex e Claude; não oferece um botão Antigravity sem validação própria.

## Conteúdo e capacidades

O formato de uma primeira proposta está em [tools.md](../skills/business-map/references/tools.md). Consulte o contexto antes de criar IDs e revisão-base. Identidade externa é autodeclarada. Importar uma skill não executa seus scripts nem concede acesso a outros serviços.
