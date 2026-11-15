import { createHash } from "node:crypto";
import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import type { RpcInput } from "@getpaseo/plugin";
import {
  conversationDeliverRpc,
  conversationPrompt,
  conversationStartRpc,
} from "../shared/chat-entry";
import { assertAgentProject, resolveProject } from "./project";
import type { BoardStore } from "./store";
import type { SkillRepository } from "./skills";
import { AgentBindings } from "./bindings";

type PaseoApi = PluginHandlerContext["paseo"];
export class ConversationEntry {
  private queues = new Map<string, Promise<unknown>>();
  constructor(
    private store: BoardStore,
    private skills: SkillRepository,
    private bindings = new AgentBindings(),
  ) {}
  private async serial<T>(key: string, run: () => Promise<T>): Promise<T> {
    const prior = this.queues.get(key) || Promise.resolve();
    const next = prior.catch(() => {}).then(run);
    this.queues.set(key, next);
    try {
      return await next;
    } finally {
      if (this.queues.get(key) === next) this.queues.delete(key);
    }
  }
  async start(raw: RpcInput<typeof conversationStartRpc>, paseo: PaseoApi) {
    const input = conversationStartRpc.input.parse(raw);
    const location = await resolveProject(paseo, input.workspaceId);
    const agent = await assertAgentProject(paseo, location, input.agentId);
    const { requestId, agentId, title, objective, skillVersionIds } = input;
    const receipt = {
      id: `conversation.start:${requestId}`,
      value: createHash("sha256")
        .update(JSON.stringify({ agentId, title, objective, skillVersionIds }))
        .digest("hex"),
    };
    const snapshot = await this.store.get(location);
    // A retry of a committed request does not reload or send, even when the agent is now busy.
    if (!snapshot.board.receipts[receipt.id]) {
      if (agent.activeTurn || agent.status !== "idle")
        throw new Error(
          "Agente ocupado. Seu rascunho foi preservado; aguarde o fim do turno para iniciar a sessão.",
        );
      for (const id of skillVersionIds) {
        const version = snapshot.board.skills.find((v) => v.id === id);
        if (!version) throw new Error("Skill da sessão não encontrada.");
        await this.skills.read(location, version);
      }
    }
    return this.store.apply(
      location,
      input.expectedRevision,
      input.expectedFingerprint,
      {
        type: "conversation.start",
        title,
        session: {
          id: `session-${requestId}`,
          objective,
          agentId,
          skillVersionIds,
          startedAt: new Date().toISOString(),
          closedAt: null,
          status: "active",
          grilling: "running",
          summary: "",
          summarySuggestionId: null,
        },
      },
      receipt,
    );
  }
  async deliver(raw: RpcInput<typeof conversationDeliverRpc>, paseo: PaseoApi) {
    const input = conversationDeliverRpc.input.parse(raw);
    const location = await this.store.canonical(
      await resolveProject(paseo, input.workspaceId),
    );
    const key =
      process.platform === "win32"
        ? location.root.toLowerCase()
        : location.root;
    return this.serial(key, async () => {
      let snapshot = await this.store.get(location);
      const sessionBoardId = snapshot.board.boardId;
      const session = snapshot.board.sessions.find(
        (s) => s.id === input.sessionId,
      );
      if (
        !session ||
        session.agentId !== input.agentId ||
        snapshot.board.agent.id !== input.agentId ||
        snapshot.board.currentSessionId !== session.id ||
        session.status !== "active"
      )
        throw new Error(
          "Esta sessão não está ativa nesta conversa. Abra a conversa vinculada ou revise o encerramento.",
        );
      let agent = await assertAgentProject(paseo, location, input.agentId);
      const state =
        snapshot.board.receipts[`conversation.delivery:${session.id}`];
      if (state === "sent")
        return {
          snapshot,
          status: "already_sent" as const,
          message: "A pergunta inicial já foi enviada. Continue no chat.",
        };
      if (state === "attempted" && !input.retryConfirmed)
        return {
          snapshot,
          status: "uncertain" as const,
          message:
            "Talvez a pergunta já tenha sido enviada. Confira o chat antes de confirmar uma nova tentativa.",
        };
      if (agent.activeTurn || agent.status !== "idle")
        return {
          snapshot,
          status: "waiting" as const,
          message:
            "Sessão salva. Aguarde o agente terminar o turno; nenhum turno foi interrompido.",
        };
      // The tools become available only after the committed opt-in is visible to the open hook.
      const warning = await this.bindings.reload(agent, {
        agentId: input.agentId,
        projectId: location.projectId,
        boardId: snapshot.board.boardId,
      });
      // Fetch the live snapshot through the public SDK. A failed provider resume,
      // archived/moved agent or foreign workspace never qualifies for fallback.
      agent = await assertAgentProject(paseo, location, input.agentId);
      if (agent.activeTurn || agent.status !== "idle")
        return {
          snapshot,
          status: "waiting" as const,
          warning,
          message:
            "Sessão salva. O agente está ocupado; tente enviar quando estiver ocioso.",
        };
      snapshot = await this.store.get(location);
      const activeSession = snapshot.board.sessions.find(
        (s) => s.id === session.id,
      );
      if (
        snapshot.board.currentSessionId !== session.id ||
        snapshot.board.boardId !== sessionBoardId ||
        snapshot.board.agent.id !== input.agentId ||
        activeSession?.status !== "active" ||
        activeSession.agentId !== input.agentId
      )
        throw new Error(
          "A sessão mudou durante a vinculação. Nenhuma mensagem enviada.",
        );
      snapshot = await this.store.apply(
        location,
        snapshot.board.revision,
        snapshot.fingerprint,
        {
          type: "conversation.delivery",
          sessionId: session.id,
          state: "attempted",
        },
      );
      try {
        await agent.send(conversationPrompt(activeSession), {
          messageId: `business-kickoff-${session.id}`,
          activeTurnBehavior: "steer",
        });
        snapshot = await this.store.get(location);
        snapshot = await this.store.apply(
          location,
          snapshot.board.revision,
          snapshot.fingerprint,
          {
            type: "conversation.delivery",
            sessionId: session.id,
            state: "sent",
          },
        );
        return {
          snapshot,
          status: "sent" as const,
          warning,
          message:
            "Sessão iniciada. Responda à primeira pergunta nesta conversa.",
        };
      } catch {
        return {
          snapshot: await this.store.get(location),
          status: "uncertain" as const,
          warning,
          message:
            "O envio não pôde ser confirmado. Sua sessão está salva. Confira o chat antes de confirmar uma nova tentativa.",
        };
      }
    });
  }
}
