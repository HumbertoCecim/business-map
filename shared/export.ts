import type { Board } from "./model";
import { getPath } from "./hierarchy";
function line(s: string) {
  return s.replace(/\r\n/g, "\n");
}
export function exportMarkdown(b: Board): string {
  const out = [
    `# ${b.title}`,
    "",
    `Board: ${b.boardId} · revisão ${b.revision}`,
    "",
    "## Onde parei",
    "",
    b.whereStopped || "—",
    "",
    "## Foco",
    "",
  ];
  for (const id of b.focus.cardIds) {
    const c = b.sections.flatMap((s) => s.cards).find((c) => c.id === id);
    if (c) out.push(`- ${c.title}${c.firstStep ? ` — ${c.firstStep}` : ""}`);
  }
  for (const s of b.sections) {
    out.push(
      "",
      `## ${s.title}`,
      "",
      ...(s.parentId && s.parentId !== b.boardId
        ? [`Caminho: ${getPath(b, s.id).map((node) => node.title).join(" > ")}`, ""]
        : []),
      s.questions,
      ...(s.sourceSuggestionId
        ? [
            "",
            `Origem: sugestão ${s.sourceSuggestionId}, confirmada pela pessoa.`,
          ]
        : []),
    );
    for (const c of s.cards)
      out.push(
        "",
        `### ${c.title}`,
        "",
        `- ${c.done ? "Concluído" : c.lane === "now" ? "Agora" : "Depois"}${c.important ? " · Importante" : ""}${c.urgent ? " · Urgente" : ""}`,
        "",
        c.text,
        ...(c.sourceSuggestionId
          ? [
              "",
              `Origem: sugestão ${c.sourceSuggestionId}, confirmada pela pessoa.`,
            ]
          : []),
        ...(c.firstStep ? ["", `Primeiro passo: ${c.firstStep}`] : []),
      );
  }
  out.push("", "## Insights mantidos", "");
  for (const s of b.suggestions.filter((s) => s.status === "kept"))
    out.push(
      `### ${s.title}`,
      "",
      s.text,
      "",
      `Fonte: agente ${s.sourceAgentId} · revisão base ${s.baseRevision}`,
      "",
    );
  out.push("", "## Contexto e decisões confirmados", "");
  for (const m of b.memories)
    out.push(
      `### ${m.kind === "decision" ? "Decisão" : "Contexto"} (${m.target.kind}: ${m.target.id})`,
      "",
      m.text,
      "",
      `Justificativa: ${m.rationale || "—"}`,
      "",
    );
  out.push(
    "",
    "## Orientação do agente",
    "",
    `Agente: ${b.agent.id || "Nenhum"}`,
    `Skills/referências: ${b.agent.skills.join(", ") || "Nenhuma"}`,
  );
  out.push("", "## Skills completas", "");
  for (const skill of b.skills)
    out.push(
      `### ${skill.name}`,
      "",
      skill.description,
      "",
      `Versão: ${skill.id}${b.selectedSkillVersionIds.includes(skill.id) ? " · ativa" : ""}`,
      `Original: ${skill.originalVersionId}`,
      `Anterior: ${skill.parentVersionId || "—"}`,
      `Origem: ${skill.sourceUrl || skill.sourcePath}`,
      `Motivo: ${skill.rationale}`,
      ...skill.files.map(
        (f) => `- ${f.path} · ${f.size} bytes · SHA256 ${f.sha256}`,
      ),
      "",
      ...(skill.diff ? ["```diff", skill.diff, "```", ""] : []),
    );
  out.push("", "## Sessões", "");
  for (const session of b.sessions)
    out.push(
      `### ${session.objective}`,
      "",
      `Agente: ${session.agentId}`,
      `Estado: ${session.status === "closed" ? "Encerrada" : session.status === "closing" ? "Encerramento em revisão" : "Em andamento"}`,
      `Início: ${session.startedAt}`,
      `Fim: ${session.closedAt || "—"}`,
      `Skills iniciais: ${(session.initialSkillVersionIds || session.skillVersionIds).join(", ") || "nenhuma"}`,
      `Skills ativas: ${session.skillVersionIds.join(", ") || "nenhuma"}`,
      "",
      session.summary || "Sem resumo confirmado.",
      "",
    );
  return line(out.join("\n")).trimEnd() + "\n";
}
