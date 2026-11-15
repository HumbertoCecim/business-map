# Integração opcional com Paseo

O Business Map funciona sem Paseo. A integração mantém os painéis, a pill da conversa e as ferramentas nativas, mas encaminha leituras e gravações ao serviço local. O plugin não inicia outro escritor.

1. Instale e abra o serviço para a raiz registrada do projeto: `business open --root <pasta>`.
2. Instale a versão atual do adaptador no daemon compatível com SDK 0.15.4.
3. No navegador, use **Conectar Paseo** e copie o código temporário. Cole-o no painel do plugin e confirme a conexão. O código é de uso único; reiniciar o serviço ou daemon exige uma nova conexão.
4. Abra **Business Canvas** na conversa. Se o serviço não estiver disponível, o erro informa como abri-lo; nenhuma escrita local substitui a conexão.

## Quadro anterior (0.4)

Antes da primeira gravação v3, descarregue o plugin 0.4 e confirme que seu subprocesso encerrou as operações. Preserve uma cópia integral da pasta `.business-board`. Confirme a atualização no navegador. Enquanto isso não acontecer, as gravações ficam bloqueadas, inclusive propostas de agentes. A migração cria um backup v2 imutável; o plugin antigo não lê v3. Não mantenha um escritor antigo aberto durante a transição.

O daemon inteiro não precisa ser reiniciado para atualizar um plugin. Se não for possível comprovar que o escritor antigo parou, mantenha o quadro antigo intacto até resolver o impedimento.

Workspaces do mesmo projeto continuam resolvendo a raiz pelo projeto registrado no Paseo. A identidade local do projeto no serviço pode ser diferente do `projectId` Paseo; a raiz canônica determina os dados utilizados.
