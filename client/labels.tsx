import { useAgent } from "@getpaseo/plugin/client";
import type { Board, Suggestion, Target } from "../shared/model";
import { Label } from "./ui";

export const suggestionKind: Record<Suggestion["kind"], string> = {
  map_draft: "Mapa candidato",
  insight: "Insight",
  structure: "Estrutura",
  memory: "Memória candidata",
  skill_import: "Importação de skill", skill_adjustment: "Ajuste de skill", card_draft: "Card candidato", session_summary: "Resumo da sessão",
};
export const suggestionStatus: Record<Suggestion["status"], string> = {
  pending: "Pendente",
  kept: "Mantida",
  discarded: "Descartada",
  incorporated: "Incorporada",
};
export function targetName(board: Board, target: Target): string {
  if (target.kind === "board") return board.title || "Board inteiro";
  if (target.kind === "section")
    return (
      board.sections.find((s) => s.id === target.id)?.title ||
      "Área sem título ou removida"
    );
  return (
    board.sections.flatMap((s) => s.cards).find((card) => card.id === target.id)
      ?.title || "Card sem título ou removido"
  );
}
export function AgentSource({ agentId }: { agentId: string }) {
  const title = useAgent(agentId, (agent) => agent.title);
  return <Label muted>{`Agente: ${title || agentId.slice(0, 8)}`}</Label>;
}
