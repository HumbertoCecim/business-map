import { useCallback, useSyncExternalStore } from 'react';

// Presentation copy only. Map titles, notes and proposal content never pass through this dictionary.
const english: Record<string, string> = {
  'Enquadrar mapa': 'Fit map',
  'Mapa do negócio': 'Business map', 'Meu foco': 'My focus', 'Propostas': 'Proposals', 'Memória': 'Memory', 'Fontes': 'Sources',
  'Abrindo seu negócio…': 'Opening your business…', 'Abrindo seu espaço de trabalho…': 'Opening your workspace…',
  'O mapa mudou. Seu rascunho foi preservado. Compare o conteúdo salvo e atualize a base antes de salvar novamente.': 'The map changed. Your draft is safe. Compare the saved content and update the base before saving again.',
  'Este mapa tem até cinco níveis. Crie o aprofundamento no nível anterior.': 'This map supports five levels. Add a deeper section from the previous level.',
  'Você chegou ao nível 5. Continue desenvolvendo o conteúdo aqui ou volte um nível para adicionar uma nota.': 'You have reached level 5. Keep developing this content, or go back one level to add a note.',
  'Lote confirmado. O mapa foi atualizado.': 'Batch confirmed. Your map is updated.', 'Proposta rejeitada.': 'Proposal rejected.',
  'Tentar novamente': 'Try again', 'Entrar na sua conta': 'Sign in', 'Seu negócio · privado': 'Your business · private',
  'Navegação principal': 'Main navigation', 'SUAS ÁREAS': 'YOUR AREAS', 'Criar área': 'Create area',
  'As áreas que você criar': 'The areas you create', 'aparecem aqui.': 'appear here.', 'Conectar ChatGPT': 'Connect ChatGPT',
  'Importar / exportar': 'Import / export', 'Minha conta': 'My account', 'Sair da conta': 'Sign out', 'Não foi possível sair.': 'Could not sign out.',
  'Atualizações conectadas': 'Live updates connected', 'Sincronização periódica': 'Periodic updates', 'Alternar tema': 'Toggle theme',
  'Navegar no negócio': 'Navigate your business', 'Atualizar mapa': 'Refresh map', 'Desfazer última alteração': 'Undo last change',
  'Última alteração desfeita.': 'Last change undone.', 'Fechar aviso': 'Dismiss notice', 'SEU NEGÓCIO, EM PERSPECTIVA': 'YOUR BUSINESS, IN PERSPECTIVE',
  'O mapa do seu negócio.': 'Your business map.', 'O que merece sua atenção.': 'What deserves your attention.',
  'Possibilidades em revisão.': 'Possibilities to review.', 'Boas referências, do seu jeito.': 'Useful references, your way.',
  'De onde vêm as ideias.': 'Where ideas come from.', 'Contexto que permanece.': 'Context that stays.',
  'Organize ideias, encontre conexões e escolha o próximo passo.': 'Arrange ideas, find connections and choose your next step.',
  'Compare cada alteração. Você decide o que entra no mapa.': 'Compare each change. You decide what enters your map.',
  'Uma memória viva, organizada por você.': 'A living memory, organized by you.', 'Nova área': 'New area', 'Visão geral': 'Overview',
  'Área em detalhe': 'Area in detail', 'Escolher área': 'Choose an area', 'Todas as áreas': 'All areas', 'Buscar no mapa': 'Search the map',
  'Encontrar no mapa': 'Find on the map', 'UM COMEÇO EM BRANCO': 'A FRESH START', 'Todo negócio começa': 'Every business starts',
  'com uma boa ideia.': 'with a good idea.', 'Crie uma área com o nome que fizer sentido.': 'Create an area with a name that makes sense to you.',
  'O mapa toma forma com você.': 'Let your map take shape.', 'Criar primeira área': 'Create your first area', 'ONDE PAREI': 'WHERE I LEFT OFF',
  'Deixe uma pista para a próxima vez…': 'Leave a hint for next time…', 'no foco': 'in focus', 'Explorar áreas e notas com teclado': 'Explore areas and notes with your keyboard',
  'propostas aguardando revisão': 'proposals awaiting review', 'Conteúdo candidato': 'Proposed content', 'LOTE ·': 'BATCH ·', 'ALTERAÇÕES': 'CHANGES',
  'Espaço para novas possibilidades.': 'Room for new possibilities.', 'Propostas do ChatGPT aparecem aqui e na conversa para sua confirmação.': 'ChatGPT proposals appear here and in the conversation for your confirmation.',
  'Até': 'Up to', 'Limite do foco': 'Focus limit', '1 nota': '1 note', '3 notas': '3 notes', '5 notas': '5 notes', 'escolhidas por você': 'chosen by you',
  'MEU FOCO': 'MY FOCUS', 'Escolha um primeiro passo.': 'Choose a first step.', 'Outras notas para considerar': 'Other notes to consider', 'Foco': 'Focus',
  'Detalhe selecionado': 'Selected details', 'Detalhe': 'Details', 'Fechar detalhe': 'Close details', 'Seus dados': 'Your data', 'Detalhes': 'Details',
  'UM ESPAÇO SEU': 'A SPACE OF YOUR OWN', 'Qual negócio vamos organizar?': 'Which business shall we organize?',
  'Comece pelo nome. Você pode mudar tudo enquanto o mapa toma forma.': 'Start with a name. You can change everything as your map takes shape.',
  'Nome do negócio': 'Business name', 'O nome da sua ideia': 'The name of your idea', 'Criar meu negócio': 'Create my business',
  'INTEGRAÇÃO OPCIONAL': 'OPTIONAL CONNECTION', 'Seu mapa, na conversa.': 'Your map, in the conversation.',
  'O site organiza o negócio manualmente. No ChatGPT, o app mostra o mesmo mapa e prepara propostas que você revisa antes de confirmar.': 'Edit your business on the website. In ChatGPT, the app shows the same map and prepares proposals for you to review and confirm.',
  'No ChatGPT, escolha adicionar um servidor MCP personalizado, quando disponível na sua conta.': 'In ChatGPT, add a custom MCP server, when available on your account.',
  'Informe o endereço abaixo e selecione': 'Enter the address below and select', 'em Autenticação. Este servidor exige login.': 'under Authentication. This server requires sign-in.',
  'Em registro do cliente, escolha': 'For client registration, choose', '. A identificação do ChatGPT é automática: você não precisa copiar Client ID nem Client Secret.': '. ChatGPT identifies itself automatically: you do not need to copy a Client ID or Client Secret.',
  'Entre com o mesmo login do GrowYourPlan e clique em': 'Sign in with your GrowYourPlan account and click', 'Autorizar conexão': 'Authorize connection',
  '. Conclua a criação e instale o plugin no ChatGPT.': '. Finish setup and install the app in ChatGPT.',
  'Na conversa, selecione o plugin com @ e peça: “Abra meu mapa”.': 'In a conversation, select the app with @ and ask: “Open my map”.',
  'Endereço do servidor MCP': 'MCP server address', 'Não foi possível copiar. Selecione e copie o endereço acima.': 'Could not copy. Select and copy the address above.',
  'Endereço copiado': 'Address copied', 'Copiar endereço': 'Copy address',
  'Copiar o endereço não instala nem conecta o app automaticamente. A disponibilidade de apps personalizados depende da sua conta ChatGPT.': 'Copying the address does not install or connect the app automatically. Custom app availability depends on your ChatGPT account.',
  'Conexões revogadas. Para conectar novamente, autorize o app no ChatGPT.': 'Connections revoked. To reconnect, authorize the app in ChatGPT.',
  'Desconectar todas as autorizações do ChatGPT deste negócio?': 'Disconnect every ChatGPT authorization for this business?',
  'Confirmar desconexão': 'Confirm disconnection', 'Cancelar': 'Cancel', 'Desconectar autorizações do ChatGPT': 'Disconnect ChatGPT authorizations', 'Fechar janela': 'Close window',
  'NÍVEL': 'LEVEL', 'DE': 'OF', 'Aprofundar neste ponto': 'Explore this point', 'Criar aprofundamento': 'Add a deeper area',
  'Você chegou ao nível 5. Continue desenvolvendo o conteúdo aqui ou volte um nível.': 'You have reached level 5. Keep developing this content, or go back one level.',
  'Salvar alterações': 'Save changes', 'A base mudou desde que você abriu este rascunho.': 'The map changed after you opened this draft.',
  'Comparar com o conteúdo salvo': 'Compare with saved content', 'Usar versão atual como base': 'Use the current version as a base', 'Seu texto em edição será preservado.': 'Your draft text will be preserved.',
  'NOVA ÁREA': 'NEW AREA', 'ÁREA DO NEGÓCIO': 'BUSINESS AREA', 'Um novo espaço.': 'A new space.', 'Uma parte do negócio, com suas próprias perguntas.': 'A part of your business, with its own questions.',
  'Nome da área': 'Area name', 'Ex.: Pessoas que queremos atender': 'E.g. People we want to serve', 'Dentro de': 'Inside',
  'Escolha a empresa, uma área ou uma nota para aprofundar. Até cinco níveis, contando a empresa.': 'Choose the business, an area or a note to explore. Up to five levels, including the business.',
  '· visão da empresa': '· business overview', 'O que queremos entender aqui?': 'What do we want to understand here?',
  'Perguntas, contexto ou uma intenção para esta área…': 'Questions, context or an intention for this area…', 'Alterações salvas': 'Changes saved', 'Salvar área': 'Save area',
  'Notas desta área': 'Notes in this area', 'Nova nota': 'New note', 'Limite de cinco níveis': 'Five-level limit',
  'Você chegou ao nível 5. Continue desenvolvendo o conteúdo aqui ou crie um item no nível anterior.': 'You have reached level 5. Keep developing this content, or create an item at the previous level.',
  'Mais ações': 'More actions', 'Subir': 'Move up', 'Descer': 'Move down', 'Excluir esta área e todos os seus aprofundamentos? Serão removidos': 'Delete this area and everything inside it? This will remove',
  'itens (áreas e notas), incluindo esta área.': 'items (areas and notes), including this area.', 'Excluir área': 'Delete area',
  'NOVA NOTA': 'NEW NOTE', 'NOTA DO NEGÓCIO': 'BUSINESS NOTE', 'Dê forma à ideia.': 'Shape your idea.', 'Título': 'Title',
  'Uma ideia, hipótese ou tarefa…': 'An idea, hypothesis or task…', 'Conteúdo': 'Content', 'Desenvolva a ideia com suas palavras.': 'Develop the idea in your own words.',
  'Primeiro passo': 'First step', 'Uma pequena ação para avançar': 'A small action to move forward', 'Quando': 'When', 'Agora': 'Now', 'Depois': 'Later',
  'Rótulo opcional': 'Optional label', 'Ex.: Hipótese': 'E.g. Hypothesis', 'Concluída': 'Done', 'Importante': 'Important', 'Urgente': 'Urgent',
  'Fontes vinculadas (': 'Linked sources (', 'Adicionar ao mapa': 'Add to map', 'Salvar nota': 'Save note', 'Retirar do meu foco': 'Remove from my focus',
  'Adicionar ao foco': 'Add to focus', 'Conexões': 'Connections', 'Conexão': 'Connection', 'Excluir conexão': 'Delete connection', 'Criar conexão': 'Create connection',
  'Conectar com': 'Connect to', 'Escolha uma área ou nota': 'Choose an area or note', 'O que conecta estas ideias?': 'What connects these ideas?',
  'Ex.: depende de': 'E.g. depends on', 'Mover para outra área': 'Move to another area', 'Mover nota': 'Move note',
  'Excluir esta nota e todos os seus aprofundamentos? Serão removidos': 'Delete this note and everything inside it? This will remove', 'itens, incluindo esta nota.': 'items, including this note.', 'Excluir nota': 'Delete note',
  'RETOMADA': 'PICK UP LATER', 'VISÃO GERAL': 'OVERVIEW', 'Uma pista para depois.': 'A hint for next time.', 'Um espaço para pensar.': 'A space to think.',
  'Registre o ponto em que parou e o que quer fazer ao voltar.': 'Record where you stopped and what you want to do when you return.',
  'Selecione uma área ou nota no mapa para desenvolver seu conteúdo.': 'Select an area or note on the map to develop its content.',
  'áreas': 'areas', 'notas': 'notes', 'conexões': 'connections', 'Salvar nome': 'Save name', 'Onde parei': 'Where I left off',
  'O que ficou em aberto? Qual é o próximo passo?': 'What is still open? What is the next step?', 'Salvar ponto de retomada': 'Save a hint for next time', 'Seu foco agora': 'Your focus now',
  'Seu mapa é privado na sua conta. As propostas entram somente depois da sua revisão.': 'Your map is private to your account. Proposals are applied only after your review.',
  'registros confirmados': 'confirmed records', 'Registrar memória': 'Add a memory', 'Editar registro': 'Edit record', 'Um registro para o futuro': 'A record for the future',
  'Fechar editor': 'Close editor', 'Tipo': 'Type', 'Decisão': 'Decision', 'Contexto': 'Context', 'O que precisamos lembrar?': 'What do we need to remember?',
  'Por quê?': 'Why?', 'Confirmar registro': 'Confirm record', 'DECISÃO': 'DECISION', 'CONTEXTO': 'CONTEXT', 'Confirmar exclusão': 'Confirm deletion',
  'Excluir memória': 'Delete memory', 'As boas decisões deixam pistas.': 'Good decisions leave a trail.',
  'Guarde o que foi decidido e o motivo. Você encontra esse contexto na próxima conversa.': 'Keep what was decided and why. Find that context in your next conversation.',
  'Anotação': 'Note', 'Relato do fundador': 'Founder statement', 'Issue do GitHub': 'GitHub issue', 'Trecho de log': 'Log excerpt', 'fontes registradas': 'saved sources',
  'Adicionar fonte': 'Add source', 'Registrar uma fonte': 'Add a source', 'Nome': 'Name', 'Um nome para encontrar depois': 'A name to find it later',
  'URL (opcional)': 'URL (optional)', 'Conteúdo ou trecho': 'Content or excerpt', 'Cole o trecho relevante ou escreva seu registro.': 'Paste a relevant excerpt or write your record.',
  'Salvar fonte': 'Save source', 'Editar fonte': 'Edit source', 'Excluir fonte': 'Delete source', 'Ideias com contexto.': 'Ideas with context.',
  'Adicione links, relatos e trechos de logs. Depois, vincule cada fonte às notas do mapa.': 'Add links, accounts and log excerpts. Then link each source to notes on the map.',
  'Revisão da proposta': 'Proposal review', 'Atualize o mapa para tentar novamente.': 'Refresh the map to try again.', 'Preparando comparação…': 'Preparing comparison…',
  'LOTE COMPLETO ·': 'COMPLETE BATCH ·', 'TEXTO DO ASSISTENTE': 'ASSISTANT TEXT', 'JUSTIFICATIVA DO ASSISTENTE': 'ASSISTANT RATIONALE', 'Versão do mapa:': 'Map revision:',
  'O mapa mudou desde esta proposta. Peça uma nova proposta baseada na versão atual.': 'The map changed after this proposal. Ask for a new proposal based on the current version.',
  'Esta conexão permite consultar o mapa. A confirmação exige uma conexão autorizada do ChatGPT.': 'This connection can read the map. Confirmation requires an authorized ChatGPT connection.',
  'Comparação calculada pelo servidor': 'Changes calculated by the server', 'Revise o antes e depois abaixo: estas são as alterações que a confirmação aplica.': 'Review the before and after below: these are the changes that confirmation will apply.',
  'REMOÇÃO': 'REMOVAL', 'ANTES': 'BEFORE', 'DEPOIS': 'AFTER', 'Detalhes técnicos': 'Technical details',
  'A confirmação aplica todas as alterações deste lote em uma única transação.': 'Confirmation applies every change in this batch in a single transaction.',
  'Confirmar lote inteiro': 'Confirm entire batch', 'Rejeitar': 'Reject', 'Área': 'Area', 'Nota': 'Note', 'Fonte': 'Source',
  'Remoções propostas': 'Proposed removals', '1 item será excluído deste mapa.': '1 item will be deleted from this map.', 'itens serão excluídos deste mapa.': 'items will be deleted from this map.',
  'A confirmação do lote também aplica estas exclusões.': 'Confirming the batch also applies these deletions.', 'Conferir itens removidos': 'Review removed items',
  'Não foi possível atualizar o mapa.': 'Could not refresh the map.', 'Não foi possível conectar ao ChatGPT. Abra o mapa novamente na conversa.': 'Could not connect to ChatGPT. Open the map again in the conversation.',
  'Não foi possível concluir a ação.': 'Could not complete the action.', 'Conectando seu mapa…': 'Connecting your map…', 'revisão': 'revision',
  'Voltar ao mapa na conversa': 'Return to the map in the conversation', 'Abrir mapa em tela cheia': 'Open map fullscreen', 'Atualizar': 'Refresh',
  'Mapa visual do negócio': 'Visual business map', 'Seu mapa está em branco.': 'Your map is a blank canvas.',
  'Conte ao ChatGPT sobre seu negócio e peça uma proposta de mapa. Você pode revisar e confirmar o lote aqui.': 'Tell ChatGPT about your business and ask for a map proposal. You can review and confirm the batch here.',
  'PARA SUA REVISÃO': 'FOR YOUR REVIEW', 'Possibilidades em aberto.': 'Open possibilities.', 'alterações': 'changes', 'Nenhuma proposta aguardando confirmação.': 'No proposals awaiting confirmation.',
  'NOTA CONFIRMADA': 'CONFIRMED NOTE', 'Selecione uma área ou nota para explorar.': 'Select an area or note to explore.', 'Primeiro passo:': 'First step:',
  'Fontes vinculadas': 'Linked sources', 'Abrir fonte': 'Open source', 'Para editar manualmente, use o site GrowYourPlan. Para propor alterações, continue a conversa no ChatGPT.': 'Edit manually on the GrowYourPlan website. To propose changes, continue the conversation in ChatGPT.',
  'Mapa confirmado ·': 'Confirmed map ·', 'Versão da interface para suporte': 'Interface version for support', 'Propostas só entram após sua confirmação': 'Proposals are applied only after your confirmation',
  'Restaurar disposição': 'Reset layout', 'Organize os blocos arrastando': 'Drag cards to arrange them', 'Ver detalhes': 'View details',
  'SEU NEGÓCIO': 'YOUR BUSINESS', 'NOTA': 'NOTE', 'PROPOSTA PARA REVISAR': 'PROPOSAL TO REVIEW', 'item': 'item', 'itens': 'items',
  'na busca': 'in search', 'Revisar': 'Review', 'Explorar': 'Explore', 'Revisar proposta': 'Review proposal', 'Explorar este nível': 'Explore this level',
  'Nível anterior': 'Previous level', 'DE ONDE VOCÊ VEIO': 'WHERE YOU CAME FROM', 'Voltar para': 'Back to', 'Voltar um nível': 'Go back one level',
  'Neste nível': 'At this level', 'Elementos do nível anterior': 'Previous level elements', 'Você está aqui': 'You are here', 'Navegar no nível anterior': 'Explore the previous level',
  'Reorganizar mapa': 'Reorganize map', 'Criar no mapa': 'Add to the map', 'Clique no fundo para criar': 'Click the background to create',
  'A ideia só entra no mapa quando você salvar.': 'Your idea joins the map only when you save.', 'Área da nova nota': 'Area for the new note', 'Escolha uma área': 'Choose an area',
  'Uma conexão aparece nas duas pontas. Abra a outra ideia para continuar.': 'Connections appear at both ends. Open the linked idea to continue.',
  'Aponta para': 'Links to', 'Recebe conexão de': 'Linked from', 'Editar conexão': 'Edit connection', 'Salvar conexão': 'Save connection', 'Cancelar edição': 'Cancel editing',
  'Confirmar exclusão da conexão': 'Confirm connection deletion', 'Fechar': 'Close',
  'Você está em': 'You are at', 'Caminho no mapa': 'Map path', 'Resultados da busca': 'Search results', 'resultado no mapa': 'result on the map',
  'resultados no mapa': 'results on the map', 'Nenhum resultado no mapa': 'No results on the map', 'Seu negócio': 'Your business',
  'Refine a busca para encontrar os outros': 'Refine your search to find the other', 'itens.': 'items.',
  'Tente outra palavra. A busca percorre todos os níveis.': 'Try another word. Search covers every level.', 'Você chegou ao último nível.': 'You have reached the last level.',
  'Uma ideia pode abrir novos caminhos.': 'An idea can open new paths.', 'Criar uma área aqui': 'Create an area here',
  'Restaurar disposição do nível atual': 'Reset the current level layout', 'Clique para ver detalhes': 'Click to view details',
  'Abra a seta para explorar': 'Use the arrow to explore', 'Arraste a alça para organizar': 'Drag the handle to arrange', 'Subárea': 'Subarea',
  'Sem título': 'Untitled', 'Arrastar para organizar': 'Drag to arrange',
  'Áreas do negócio': 'Business areas', 'Notas': 'Notes', 'Perguntas e contexto': 'Questions and context', 'Memórias e decisões': 'Memories and decisions',
  'Foco atual': 'Current focus', 'Notas em foco': 'Notes in focus', 'Mostrar foco no mapa': 'Show focus on the map', 'Limite de notas': 'Note limit',
  'Motivo': 'Rationale', 'Tipo de nota': 'Note type', 'Endereço da fonte': 'Source address', 'De': 'From', 'Para': 'To', 'Relacionado a': 'Related to',
  'Registrado em': 'Recorded on', 'Skills selecionadas': 'Selected skills', 'Descrição': 'Description', 'Conteúdo da skill': 'Skill content',
  'Conversas registradas': 'Recorded conversations', 'Objetivo': 'Objective', 'Resumo': 'Summary', 'Início': 'Started', 'Encerramento': 'Closed',
  'Situação': 'Status', 'Assistente': 'Assistant', 'Conversa encerrada': 'Conversation closed', 'Estrutura': 'Structure', 'Origem': 'Origin',
  'Versões selecionadas': 'Selected versions', 'Registro de problema': 'Issue record', 'Trecho de registro': 'Log excerpt', 'Negócio': 'Business',
  'Em revisão': 'In review', 'Confirmada': 'Confirmed', 'Rejeitada': 'Rejected', 'Em andamento': 'Active', 'Encerrada': 'Closed', 'Em encerramento': 'Closing',
  'Não preenchido': 'Not filled in', 'Sim': 'Yes', 'Não': 'No', 'Nenhum item': 'No items', 'Sem nome': 'Unnamed',
  'Informações de identificação disponíveis nos detalhes técnicos.': 'Identification information is available in technical details.',
};

type UiLanguage = 'en' | 'pt-BR';
const languageKey = 'business-cloud.language';
let currentLanguage: UiLanguage | undefined;
const listeners = new Set<() => void>();

function readLanguage(): UiLanguage {
  if (currentLanguage) return currentLanguage;
  if (typeof document === 'undefined') return 'en';
  let saved: string | null = null;
  try { saved = localStorage.getItem(languageKey); } catch { /* Preference stays in memory. */ }
  currentLanguage = saved === 'pt-BR' ? 'pt-BR' : saved === 'en' ? 'en' : /^pt(?:-BR)?$/i.test(document.documentElement.lang) ? 'pt-BR' : 'en';
  return currentLanguage;
}

function subscribeLanguage(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function setLanguage(language: UiLanguage) {
  currentLanguage = language;
  try { localStorage.setItem(languageKey, language); } catch { /* Preference stays in memory. */ }
  for (const listener of listeners) listener();
}

export function useUiLanguage() {
  return useSyncExternalStore(subscribeLanguage, readLanguage, () => 'en' as const);
}

export function useUiText() {
  const language = useUiLanguage();
  return useCallback((text: string) => language === 'pt-BR' ? text : english[text] ?? text, [language]);
}

export function UiLanguageButton() {
  const language = useUiLanguage();
  return <button type="button" className="text-button ui-language" aria-label={language === 'en' ? 'Switch interface to Portuguese' : 'Mudar interface para inglês'} title={language === 'en' ? 'Português (Brasil)' : 'English'} onClick={() => setLanguage(language === 'en' ? 'pt-BR' : 'en')}>{language === 'en' ? 'EN' : 'PT'}</button>;
}
