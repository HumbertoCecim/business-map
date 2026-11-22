// Offline child-process fixture. Never contacts a model.
const fs = require('node:fs');
let input = '';
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  const context = JSON.parse(input.slice(input.indexOf('\n') + 1));
  const question = context.question;
  if (question.includes('SLOW_TEST')) { setTimeout(() => {}, 60_000); return; }
  if (question.includes('ERROR_TEST')) { process.stderr.write('Falha simulada do processo'); process.exitCode = 2; return; }
  const section = context.board.sections[0];
  const update = question.includes('UPDATE_TEST') || question.includes('STEP_TEST') || question.includes('MISSING_TEST');
  const current = section?.cards[0];
  const answer = question.includes('BAD_TEST') ? { answer: 'inválido', suggestions: [{}] } : {
    answer: `Resposta de TESTE FALSO, sem IA. Contexto: ${section?.title || 'modelo inteiro'}. Os demais blocos vieram apenas como resumo. Faça entrevistas antes de concluir que existe demanda.`,
    suggestions: [{ kind: 'card_draft', title: 'Investigar uma situação recente', text: 'Perguntar sobre a última tentativa de reservar tempo para criar.', rationale: 'Uma conversa sobre comportamento é mais útil do que uma promessa de interesse.',
      targetKind: 'section', targetId: section?.id || 'segments', structure: [], cardDraft: { title: 'Entrevistar três participantes', text: 'Hipótese: as pessoas procuram espaço para criar sem julgamento.', firstStep: 'Ouvir uma situação recente, sem apresentar a solução.' }, mapDraft: null, skillVersionId: null, skillText: null }]
  };
  if (!question.includes('BAD_TEST') && update) {
    const suggestion = answer.suggestions[0];
    suggestion.targetKind = 'card'; suggestion.targetId = question.includes('MISSING_TEST') ? 'missing-card' : current.id;
    suggestion.title = 'Revisar ideia e próximo passo';
    suggestion.cardDraft = { title: question.includes('STEP_TEST') ? current.title : 'Ideia atualizada pela conversa', text: current.text,
      firstStep: question.includes('STEP_TEST') ? 'Reservar duas conversas para amanhã.' : 'Convidar três pessoas para uma conversa de quinze minutos.' };
  }
  if (!question.includes('BAD_TEST') && question.includes('GLOBAL_TEST')) {
    if (context.board.scope !== 'whole_map' || context.board.sections.length !== 9) throw Error('Full Canvas context missing');
    answer.answer = 'TESTE FALSO: recebi os nove blocos completos.';
    answer.suggestions[0].targetId = 'costs';
    answer.suggestions[0].title = 'Investigar custo do piloto';
  }
  const outputIndex = process.argv.indexOf('--output-last-message');
  if (outputIndex >= 0) fs.writeFileSync(process.argv[outputIndex + 1], JSON.stringify(answer));
  else process.stdout.write(JSON.stringify({ structured_output: answer }));
});
