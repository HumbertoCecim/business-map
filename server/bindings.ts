import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import { friendlyError } from "../shared/errors";

type AgentHandle = ReturnType<PluginHandlerContext["paseo"]["agents"]["ref"]>;
type Scope = { agentId: string; projectId: string; boardId: string };
const historyWarning =
  "Não foi possível atualizar o histórico exibido da conversa. A conversa foi reaberta com as ferramentas do quadro; seu conteúdo salvo foi preservado.";

/** Runtime-only evidence from this plugin instance, never a persisted authorization. */
export class AgentBindings {
  private sequence = 0;
  private opens = new Map<string, Scope & { sequence: number }>();
  markAttached(scope: Scope) {
    this.opens.set(scope.agentId, { ...scope, sequence: ++this.sequence });
  }
  async reload(agent: AgentHandle, scope: Scope): Promise<string | undefined> {
    const baseline = this.sequence;
    try {
      await agent.reload();
      return undefined;
    } catch (error) {
      const ticket = this.opens.get(scope.agentId);
      const code = (error as { code?: unknown } | null)?.code;
      if (
        friendlyError(error) !== "thread/items/list is not supported yet" ||
        (typeof code === "number" && code !== -32601) ||
        !ticket ||
        ticket.sequence <= baseline ||
        ticket.projectId !== scope.projectId ||
        ticket.boardId !== scope.boardId
      )
        throw error;
      // Paseo 0.15.4's installed handleRefreshAgentRequest registers the new
      // provider session/tools before its separate history hydration can throw
      // this exact unsupported-method error. The caller MUST still refresh and
      // verify the agent's live idle state and the same active logical session.
      console.warn(
        "Business Harness: known provider history hydration limitation after current tools hook",
        { ...scope, ticket: ticket.sequence },
      );
      return historyWarning;
    }
  }
}
