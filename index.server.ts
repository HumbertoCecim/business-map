import { createHash } from "node:crypto";
import {
  defineAgentTool,
  type PluginServerContext,
} from "@getpaseo/plugin/server";
import { z } from "zod";
import { applyCommandRpc, bindRpc, exportRpc, getBoardRpc } from "./shared/rpc";
import { makeId, mapDraftSchema, structureItemSchema, suggestionSchema } from "./shared/model";
import { candidateFields } from "./shared/evolution";
import { pairRemoteService, RemoteBoardStore, RemoteSkillRepository } from "./server/remote";
import { pairServiceRpc } from "./shared/service-rpc";
import {
  skillConfirmRpc,
  skillDeriveConfirmRpc,
  skillDerivePreviewRpc,
  skillExportRpc,
  skillPreviewRpc,
  skillReadRpc,
} from "./shared/evolution-rpc";
import { assertAgentProject, resolveProject } from "./server/project";
import { ConversationEntry } from "./server/chat-entry";
import { AgentBindings } from "./server/bindings";
import {
  conversationStartRpc,
  conversationDeliverRpc,
} from "./shared/chat-entry";

export default function contribute(server: PluginServerContext) {
  const store = new RemoteBoardStore();
  const skills = new RemoteSkillRepository();
  const bindings = new AgentBindings();
  const conversations = new ConversationEntry(store, skills, bindings);
  server.handle(pairServiceRpc, async ({ workspaceId, code }, { paseo }) =>
    pairRemoteService(await resolveProject(paseo, workspaceId), code),
  );
  server.handle(conversationStartRpc, (input, { paseo }) =>
    conversations.start(input, paseo),
  );
  server.handle(conversationDeliverRpc, (input, { paseo }) =>
    conversations.deliver(input, paseo),
  );
  server.handle(getBoardRpc, async ({ workspaceId }, { paseo }) =>
    store.get(await resolveProject(paseo, workspaceId)),
  );
  server.handle(applyCommandRpc, async (input, { paseo }) => {
    const location = await resolveProject(paseo, input.workspaceId);
    if (
      input.command.type === "suggestion.submit" ||
      input.command.type === "skill.register" ||
      input.command.type === "conversation.start" ||
      input.command.type === "conversation.delivery"
    )
      throw new Error(
        "Use a ferramenta do agente para enviar sugestões com autoria verificável.",
      );
    if (input.command.type === "agent" && input.command.id)
      await assertAgentProject(paseo, location, input.command.id);
    if (input.command.type === "session.start") {
      await assertAgentProject(paseo, location, input.command.session.agentId);
      const current = await store.get(location);
      for (const id of input.command.session.skillVersionIds) {
        const version = current.board.skills.find((s) => s.id === id);
        if (!version) throw new Error("Skill da sessão não encontrada.");
        await skills.read(location, version);
      }
    }
    return store.apply(
      location,
      input.expectedRevision,
      input.expectedFingerprint,
      input.command,
    );
  });
  server.handle(skillPreviewRpc, async (input, { paseo }) => {
    const location = await resolveProject(paseo, input.workspaceId);
    return skills.forProject(location).preview(input.sourcePath, input.sourceUrl);
  });
  server.handle(skillConfirmRpc, async (input, { paseo }) => {
    const location = await resolveProject(paseo, input.workspaceId);
    const version = await skills.import(
      location,
      input.sourcePath,
      input.treeHash,
      input.sourceUrl,
    );
    return store.apply(
      location,
      input.expectedRevision,
      input.expectedFingerprint,
      {
        type: "skill.register",
        version,
        sourceSuggestionId: input.sourceSuggestionId,
      },
    );
  });
  server.handle(skillDerivePreviewRpc, async (input, { paseo }) => {
    const location = await resolveProject(paseo, input.workspaceId);
    const snapshot = await store.get(location);
    const parent = snapshot.board.skills.find(
      (s) => s.id === input.parentVersionId,
    );
    if (!parent) throw new Error("Versão original não encontrada.");
    const preview = await skills.previewDerived(
      location,
      parent,
      input.skillText,
      input.rationale,
    );
    if (snapshot.board.skills.some((s) => s.id === preview.version.id))
      throw new Error(
        "Essa versão já existe. Selecione a versão existente; nenhum ajuste candidato foi incorporado.",
      );
    return preview;
  });
  server.handle(skillDeriveConfirmRpc, async (input, { paseo }) => {
    const location = await resolveProject(paseo, input.workspaceId);
    const snapshot = await store.get(location);
    const parent = snapshot.board.skills.find(
      (s) => s.id === input.parentVersionId,
    );
    if (!parent) throw new Error("Versão original não encontrada.");
    if (
      snapshot.board.skills.some(
        (s) => s.treeHash === input.treeHash && s.skillId === parent.skillId,
      )
    )
      throw new Error(
        "Essa versão já existe. Selecione a versão existente; nenhum ajuste candidato foi incorporado.",
      );
    const version = await skills.derive(
      location,
      parent,
      input.skillText,
      input.rationale,
      input.treeHash,
    );
    return store.apply(
      location,
      input.expectedRevision,
      input.expectedFingerprint,
      {
        type: "skill.register",
        version,
        sourceSuggestionId: input.sourceSuggestionId,
      },
    );
  });
  server.handle(skillReadRpc, async (input, { paseo }) => {
    const location = await resolveProject(paseo, input.workspaceId);
    const version = (await store.get(location)).board.skills.find(
      (s) => s.id === input.versionId,
    );
    if (!version) throw new Error("Versão da skill não importada.");
    return skills.read(location, version, input.resource);
  });
  server.handle(skillExportRpc, async (input, { paseo }) => {
    const location = await resolveProject(paseo, input.workspaceId);
    const version = (await store.get(location)).board.skills.find(
      (s) => s.id === input.versionId,
    );
    if (!version) throw new Error("Versão da skill não importada.");
    return skills.export(location, version);
  });
  server.handle(exportRpc, async ({ workspaceId, save }, { paseo }) =>
    store.export(await resolveProject(paseo, workspaceId), save),
  );
  server.handle(bindRpc, async ({ workspaceId, agentId }, { paseo }) => {
    const location = await resolveProject(paseo, workspaceId);
    const snapshot = await store.get(location);
    if (snapshot.board.agent.id !== agentId)
      throw new Error("Salve a seleção explícita do agente antes de vincular.");
    const agent = await assertAgentProject(paseo, location, agentId);
    if (agent.activeTurn || agent.status !== "idle")
      return {
        message:
          "Agente ocupado. Vincule novamente quando estiver ocioso; nenhum turno foi interrompido.",
      };
    await agent.reload();
    return {
      message: "Ferramentas vinculadas ao agente selecionado.",
    };
  });
  const context = defineAgentTool({
    name: "business_get_context",
    description:
      "Read the canonical project board and active logical session at the start of EVERY Business Harness turn. Never read worktree copies. Human content/focus are authoritative. Read full selected skill versions via business_read_skill; catalog names without imported content are NOT READ. If session.grilling is running, ask ONE grounded question at a time and wait for the human response; paused/off means no continued interrogation. Session closure only occurs after an explicit human action; closing app does not request a summary. Submit all content/skill/card/session_summary candidates separately for human confirmation. Never rewrite human text or choose priorities. Optional end notes: at most two useful suggestions within this same conversation/model call.",
    input: z.object({}),
    async execute(_, { agent, paseo }) {
      if (!agent.workspaceId) throw new Error("Agente sem workspace.");
      const location = await resolveProject(paseo, agent.workspaceId);
      const snapshot = await store.get(location);
      if (snapshot.board.agent.id !== agent.id)
        throw new Error("Agente não autorizado para este board.");
      return {
        text: JSON.stringify(snapshot.board),
        structuredContent: snapshot.board,
      };
    },
  });
  const suggestion = defineAgentTool({
    name: "business_submit_suggestion",
    description:
      "Submit human-review candidates only; NEVER change human text, focus or confirmed memories. Read business_get_context first. Stable requestId for retries; baseRevision from context; targetKind board/section/card with its real targetId (boardId for board). Kinds: insight uses title/text/rationale; structure uses structure[{title,questions}]; memory uses text/rationale and target; skill_import requires sourcePath=absolute local FULL skill folder containing SKILL.md and all resources (sourceUrl optional); skill_adjustment requires skillVersionId=the ACTIVE imported version of the logical session (preserve previous adaptations), skillText=COMPLETE revised SKILL.md and rationale (other files preserved); card_draft requires cardDraft{title,text,firstStep}, normally target the destination section; session_summary requires sessionId of an open session, text=summary, whereStopped=resume line and optional decisions[{text,rationale,targetKind,targetId}]; map_draft requires mapDraft{sections,relations,sources} with stable IDs and explicit sources, reviewed and confirmed in the Business Map viewer. All candidates remain pending until human confirmation; never apply a map or choose priorities. Stale base revisions visibly marked. At most two useful natural-end suggestions if opted in; no extra model call.",
    input: z.object({
      requestId: z.string().min(1).max(160),
      baseRevision: z.number().int().nonnegative(),
      kind: suggestionSchema.shape.kind,
      title: z.string().max(500),
      text: z.string().max(30000),
      rationale: z.string().max(30000),
      targetKind: z.enum(["board", "section", "card"]),
      targetId: z.string().min(1).max(160),
      structure: z.array(structureItemSchema).max(30).optional(),
      mapDraft: mapDraftSchema.optional(),
      ...candidateFields,
    }),
    async execute(input, { agent, paseo }) {
      if (!agent.workspaceId) throw new Error("Agente sem workspace.");
      const location = await resolveProject(paseo, agent.workspaceId);
      const snapshot = await store.get(location);
      if (snapshot.board.agent.id !== agent.id)
        throw new Error("Agente não autorizado para este board.");
      if (input.baseRevision > snapshot.board.revision)
        throw new Error(
          "Revisão base futura. Leia business_get_context novamente.",
        );
      if (input.kind === "skill_import" && !input.sourcePath?.trim())
        throw new Error(
          "Importação candidata precisa do caminho local completo da pasta da skill.",
        );
      if (
        input.kind === "skill_adjustment" &&
        (!input.skillText?.trim() ||
          !input.rationale.trim() ||
          !snapshot.board.skills.some((s) => s.id === input.skillVersionId))
      )
        throw new Error(
          "Ajuste candidato precisa de versão original importada, texto completo e motivo.",
        );
      if (input.kind === "card_draft" && !input.cardDraft)
        throw new Error(
          "Card candidato precisa de título, texto e primeiro passo em cardDraft.",
        );
      if (input.kind === "map_draft" && !input.mapDraft)
        throw new Error("Mapa candidato precisa de sections, relations e sources em mapDraft para revisão humana no Business Map.");
      if (
        input.kind === "session_summary" &&
        !snapshot.board.sessions.some(
          (s) =>
            s.id === (input.sessionId || snapshot.board.currentSessionId) &&
            s.agentId === agent.id &&
            s.status !== "closed",
        )
      )
        throw new Error(
          "Resumo candidato precisa de uma sessão aberta do agente.",
        );
      const receipt = {
        id: `${agent.id}:${input.requestId}`,
        value: createHash("sha256").update(JSON.stringify(input)).digest("hex"),
      };
      const result = await store.apply(
        location,
        snapshot.board.revision,
        snapshot.fingerprint,
        {
          type: "suggestion.submit",
          suggestion: {
            id: makeId("suggestion"),
            requestId: input.requestId,
            kind: input.kind,
            title: input.title,
            text: input.text,
            rationale: input.rationale,
            target: { kind: input.targetKind, id: input.targetId },
            structure: input.structure || [],
            sourceAgentId: agent.id,
            baseRevision: input.baseRevision,
            createdAt: new Date().toISOString(),
            status: "pending",
            stale: input.baseRevision !== snapshot.board.revision,
            sessionId:
              input.sessionId || snapshot.board.currentSessionId || undefined,
            sourcePath: input.sourcePath,
            sourceUrl: input.sourceUrl,
            skillVersionId: input.skillVersionId,
            skillText: input.skillText,
            cardDraft: input.cardDraft,
            mapDraft: input.mapDraft,
            whereStopped: input.whereStopped,
            decisions: input.decisions,
          },
        },
        receipt,
      );
      return {
        text: `Sugestão recebida para revisão humana. Revisão ${result.board.revision}.`,
        structuredContent: {
          revision: result.board.revision,
          requestId: input.requestId,
        },
      };
    },
  });
  const readSkill = defineAgentTool({
    name: "business_read_skill",
    description:
      "Read the complete confirmed canonical SKILL.md (default resource) or a manifested resource, scripts/assets included, for an imported project version. Resolve relative scripts/assets/references against returned canonicalSkillRoot, NEVER sourcePath or a worktree copy; canonicalResourcePath is verified. Use normal agent tools for script use only when needed/authorized by the task; write outputs in workspace, never immutable skill folder. Names/catalog entries without content are NOT READ. Hash mismatch returns externally_modified; do not trust it. This tool reads and never executes scripts. Use active session skillVersionIds (updated by explicit selection) for continuation.",
    input: z.object({ versionId: z.string(), resource: z.string().optional() }),
    async execute(input, { agent, paseo }) {
      if (!agent.workspaceId) throw new Error("Agente sem workspace.");
      const location = await resolveProject(paseo, agent.workspaceId);
      const snapshot = await store.get(location);
      if (snapshot.board.agent.id !== agent.id)
        throw new Error("Agente não autorizado para este board.");
      const version = snapshot.board.skills.find(
        (s) => s.id === input.versionId,
      );
      if (!version)
        throw new Error(
          "Skill não importada. Nome/referência sem conteúdo deve ser tratado como não lido.",
        );
      const result = await skills.read(
        location,
        version,
        input.resource || "SKILL.md",
      );
      return { text: result.content, structuredContent: result };
    },
  });
  server.addHook("agent.open.before", async ({ request }, { paseo }) => {
    if (!request.workspaceId || request.purpose === "history") return;
    try {
      const location = await resolveProject(paseo, request.workspaceId);
      const snapshot = await store.get(location);
      if (snapshot.board.agent.id !== request.agentId) return;
      bindings.markAttached({
        agentId: request.agentId,
        projectId: location.projectId,
        boardId: snapshot.board.boardId,
      });
      return {
        ...request,
        tools: [...request.tools, context, suggestion, readSkill],
      };
    } catch (error) {
      console.warn(
        "Business Harness: ferramentas não vinculadas:",
        error instanceof Error ? error.message : String(error),
      );
    }
  });
  return () => {};
}
