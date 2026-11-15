import { useEffect, useRef, useState } from "react";
import {
  usePaseo,
  useRpc,
  useWorkspace,
  useTabState,
  type PluginWorkspacePanelProps,
} from "@getpaseo/plugin/client";
import type { RpcOutput } from "@getpaseo/plugin";
import { friendlyError } from "../shared/errors";
import { pairServiceRpc } from "../shared/service-rpc";
import { useProjectState } from "./project-state";
import { projectScope } from "../shared/project-state";
import { AgentSetup } from "./agent-setup";
import { Sessions } from "./sessions";
import { SkillLibrary } from "./skills";
import { CanvasSheet } from "./canvas";
import { boardObservations } from "./board-observations";
import {
  AgentSource,
  suggestionKind,
  suggestionStatus,
  targetName,
} from "./labels";
import { ScrollView, Text, TextInput, View } from "react-native";
import {
  applyCommandRpc,
  bindRpc,
  exportRpc,
  getBoardRpc,
} from "../shared/rpc";
import {
  makeId,
  type Board,
  type Card,
  type Command,
  type Section,
  type Suggestion,
  type Target,
} from "../shared/model";
import { Btn, Disclosure, Field, Label, Pane, Row, ThemeContext } from "./ui";
import { FocusStrip } from "./focus";
import { RelatedInsights } from "./insights";
import { BoardAreas } from "./areas";
import {
  AtelierRail,
  CompassOverview,
  presentationSchema,
  type Presentation,
} from "./presentations";
type Snapshot = RpcOutput<typeof getBoardRpc>;
type Editor =
  | {
      kind: "section";
      section: Section;
      base: Snapshot;
      suggestion?: Suggestion;
    }
  | {
      kind: "card";
      card: Card;
      sectionId: string;
      base: Snapshot;
      suggestion?: Suggestion;
    }
  | {
      kind: "text";
      field: "title" | "whereStopped";
      value: string;
      base: Snapshot;
      suggestion?: Suggestion;
    }
  | {
      kind: "memory";
      id: string;
      text: string;
      rationale: string;
      memoryKind: "context" | "decision";
      target: Target;
      base: Snapshot;
      suggestion?: Suggestion;
      sourceSuggestionId?: string | null;
      createdAt?: string;
    };
type Preview = {
  items: { id: string; title: string; questions: string; checked: boolean }[];
  base: Snapshot;
  suggestionId?: string;
};
function savedEditorContent(editor: Editor, board: Board): string {
  if (editor.kind === "text")
    return (
      (editor.field === "title" ? board.title : board.whereStopped) ||
      "Ainda não há texto salvo."
    );
  if (editor.kind === "card") {
    const card = board.sections
      .flatMap((s) => s.cards)
      .find((c) => c.id === editor.card.id);
    if (!card) return "Card novo ou removido.";
    return `Título: ${card.title || "Sem título"}\n\n${card.text || "Sem texto"}\n\nPrimeiro passo: ${card.firstStep || "Não definido"}\n${card.done ? "Concluído" : card.lane === "now" ? "Agora" : "Depois"}${card.important ? " · Importante" : ""}${card.urgent ? " · Urgente" : ""}`;
  }
  if (editor.kind === "section") {
    const section = board.sections.find((s) => s.id === editor.section.id);
    return section
      ? `Título: ${section.title || "Sem título"}\n\nPerguntas: ${section.questions || "Não definidas"}`
      : "Área nova ou removida.";
  }
  const memory = board.memories.find((m) => m.id === editor.id);
  return memory
    ? `${memory.kind === "decision" ? "Decisão" : "Contexto durável"}: ${memory.text}\n\nJustificativa: ${memory.rationale || "Não informada"}\nDestino: ${targetName(board, memory.target)}`
    : "Memória nova ou removida.";
}
type BoardProps = PluginWorkspacePanelProps & {
  embedded?: boolean;
  contextAgentId?: string;
  surface?: "workspace" | "explorer";
  onOpenSurface?: (
    location: "workspace" | "explorer",
    workspaceId?: string,
  ) => void;
};
export function BoardPanel(props: BoardProps) {
  return (
    <ThemeContext.Provider value={props.theme}>
      <ProjectBoard {...props} />
    </ThemeContext.Provider>
  );
}
function ProjectBoard(props: BoardProps) {
  const paseo = usePaseo();
  const cachedId = useWorkspace(props.workspaceId, (w) => w.projectId);
  const identity = projectScope(props.host.id, props.workspaceId);
  const [resolved, setResolved] = useState<{
    identity: string;
    projectId: string;
  } | null>(null);
  const [failure, setFailure] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setFailure("");
    paseo.workspaces
      .ref(props.workspaceId)
      .refresh()
      .then((w) => {
        if (!w?.projectId)
          throw new Error(
            "Workspace sem projeto registrado. Abra o projeto no Paseo.",
          );
        if (live) setResolved({ identity, projectId: w.projectId });
      })
      .catch((e) => {
        if (live) setFailure(friendlyError(e));
      });
    return () => {
      live = false;
    };
  }, [identity, attempt]);
  const projectId =
    cachedId || (resolved?.identity === identity ? resolved.projectId : null);
  if (!projectId)
    return (
      <View
        style={{
          padding: 16,
          gap: 12,
          backgroundColor: props.theme.colors.surface0,
        }}
      >
        <Label>{failure || "Localizando o projeto do quadro…"}</Label>
        {!!failure && (
          <Btn onPress={() => setAttempt(attempt + 1)}>
            Tentar localizar novamente
          </Btn>
        )}
      </View>
    );
  return (
    <BoardContent
      key={projectScope(props.host.id, projectId)}
      {...props}
      resolvedProjectId={projectId}
    />
  );
}
function BoardContent({
  theme,
  layout,
  workspaceId,
  tab: panelTab,
  host,
  navigation,
  onOpenSurface,
  surface = "workspace",
  embedded = false,
  contextAgentId,
  resolvedProjectId,
}: BoardProps & { resolvedProjectId: string }) {
  const c = theme.colors;
  const [visual, setVisual] = useTabState<{ presentation: Presentation }>(
    panelTab,
    presentationSchema,
    { presentation: "panorama" },
  );
  const sidebar = surface === "explorer";
  const presentation = sidebar ? "panorama" : visual.presentation;
  const canvas = presentation === "canvas";
  const paseo = usePaseo();
  const get = useRpc(getBoardRpc);
  const apply = useRpc(applyCommandRpc);
  const exportBoard = useRpc(exportRpc);
  const bind = useRpc(bindRpc);
  const pairService = useRpc(pairServiceRpc);
  const [pairCode, setPairCode] = useState("");
  const [pairing, setPairing] = useState(false);
  const projectId = resolvedProjectId;
  const projectName = useWorkspace(workspaceId, (w) => w.projectDisplayName);
  const scope = projectScope(host.id, projectId);
  const [snapshot, setSnapshotState] = useProjectState<Snapshot | null>(
    scope,
    "snapshot",
    null,
  );
  function setSnapshot(value: Snapshot) {
    boardObservations.publish(scope, value);
    setSnapshotState(value);
  }
  const [busy, setBusy] = useProjectState(scope, "busy", false);
  const [error, setError] = useProjectState(scope, "error", "");
  const [pollError, setPollError] = useProjectState(scope, "pollError", "");
  const [notice, setNotice] = useProjectState(scope, "notice", "");
  const [editor, setEditor] = useProjectState<Editor | null>(
    scope,
    "editor",
    null,
  );
  const [preview, setPreview] = useProjectState<Preview | null>(
    scope,
    "preview",
    null,
  );
  const [expanded, setExpanded] = useState<string | null>(null);
  const [deleteCmd, setDeleteCmd] = useState<Command | null>(null);
  const [tab, setTab] = useState<
    "board" | "suggestions" | "memories" | "agent" | "session" | "skills"
  >("board");
  const [evolutionCandidate, setEvolutionCandidate] =
    useProjectState<Suggestion | null>(scope, "evolution.candidate", null);
  const [skillDraft] = useProjectState<unknown>(scope, "skill.draft", null);
  const [skillSelectionDraft] = useProjectState<unknown>(
    scope,
    "skill.selection",
    null,
  );
  const [sessionClosingDraft] = useProjectState<unknown>(
    scope,
    "session.closing",
    null,
  );
  const [miniFocus, setMiniFocus] = useState(false);
  const [suggestionFilter, setSuggestionFilter] = useState<
    "pending" | "kept" | "all"
  >("pending");
  const [markdown, setMarkdown] = useState("");
  const [agents, setAgents] = useState<
    { id: string; title: string; status: string }[]
  >([]);
  const [agentId, setAgentId] = useProjectState<string | null>(
    scope,
    "agentId",
    null,
  );
  const [skillText, setSkillText] = useProjectState(scope, "skillText", "");
  const [endNotes, setEndNotes] = useProjectState(scope, "endNotes", false);
  const [agentBase, setAgentBase] = useProjectState<Snapshot | null>(
    scope,
    "agentBase",
    null,
  );
  const [skillSearch, setSkillSearch] = useState("");
  const [showCommands, setShowCommands] = useState(false);
  const [commandAgentId, setCommandAgentId] = useState<string | null>(null);
  const [commands, setCommands] = useState<
    { name: string; description: string; kind?: string }[]
  >([]);
  const [question, setQuestion] = useState(
    "Revise o board e proponha até duas sugestões úteis, com justificativa e primeiro passo.",
  );
  const [width, setWidth] = useState(900);
  const scroll = useRef<ScrollView>(null);
  const currentSnapshot = useRef<Snapshot | null>(null);
  currentSnapshot.current = snapshot;
  const editorY = useRef(0);
  const previewY = useRef(0);
  const deleteY = useRef(0);
  const areaY = useRef(0);
  const editorKey = editor
    ? editor.kind === "section"
      ? editor.section.id
      : editor.kind === "card"
        ? editor.card.id
        : editor.kind === "memory"
          ? editor.id
          : editor.field
    : "";
  useEffect(() => {
    if (!editorKey) return;
    const timer = setTimeout(
      () => scroll.current?.scrollTo({ y: editorY.current, animated: false }),
      80,
    );
    return () => clearTimeout(timer);
  }, [editorKey]);
  useEffect(() => {
    if (!preview) return;
    const timer = setTimeout(
      () => scroll.current?.scrollTo({ y: previewY.current, animated: false }),
      80,
    );
    return () => clearTimeout(timer);
  }, [!!preview]);
  useEffect(() => {
    if (!deleteCmd) return;
    const timer = setTimeout(
      () => scroll.current?.scrollTo({ y: deleteY.current, animated: false }),
      80,
    );
    return () => clearTimeout(timer);
  }, [!!deleteCmd]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 8000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    panelTab.setModified(
      !!editor ||
        !!preview ||
        !!agentBase ||
        !!skillDraft ||
        !!skillSelectionDraft ||
        !!sessionClosingDraft,
    );
  }, [
    panelTab,
    !!editor,
    !!preview,
    !!agentBase,
    !!skillDraft,
    !!skillSelectionDraft,
    !!sessionClosingDraft,
  ]);
  const compact = layout.compact || width < 760;
  const board = snapshot?.board;
  const agentActionsAllowed =
    !contextAgentId || contextAgentId === board?.agent.id;
  const onboarding = !!board && !board.agent.id && board.sections.length === 0;
  useEffect(() => {
    return boardObservations.watch(
      scope,
      () => get({ workspaceId }),
      (s) => {
        const previous = currentSnapshot.current;
        if (
          previous &&
          previous.fingerprint !== "missing" &&
          s.fingerprint === "missing"
        ) {
          setPollError(
            "O arquivo canônico desapareceu. Exibindo o último estado válido. Restaure o arquivo antes de continuar.",
          );
          return;
        }
        setPollError("");
        setSnapshotState(s);
        if (!previous) {
          setAgentId(s.board.agent.id);
          setSkillText(s.board.agent.skills.join("\n"));
          setEndNotes(s.board.agent.endOfConversation);
        }
      },
      (e) =>
        setPollError(
          `Falha ao atualizar o arquivo canônico. Último estado válido mantido. ${message(e)}`,
        ),
    );
  }, [workspaceId, scope, get]);
  async function reload() {
    setBusy(true);
    try {
      const next = await get({ workspaceId });
      if (
        snapshot &&
        snapshot.fingerprint !== "missing" &&
        next.fingerprint === "missing"
      )
        throw new Error(
          "O arquivo canônico desapareceu. Último estado válido mantido; restaure o arquivo antes de continuar.",
        );
      setSnapshot(next);
      setPollError("");
      setError("");
      setNotice(
        editor || preview
          ? "Board atualizado. Rascunho preservado; copie/revise e reabra a edição para usar a revisão atual."
          : "Board atualizado.",
      );
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  function message(e: unknown) {
    return friendlyError(e);
  }
  async function connectService() {
    if (!pairCode.trim() || pairing) return;
    setPairing(true);
    setError("");
    try {
      const result = await pairService({ workspaceId, code: pairCode.trim() });
      setNotice(result.message);
    } catch (e) {
      setError(message(e));
    } finally {
      setPairCode("");
      setPairing(false);
    }
  }
  async function openConversation() {
    if (!board?.agent.id) {
      setTab("agent");
      setNotice(
        "Escolha ou crie um agente para conversar com o quadro ao lado.",
      );
      return;
    }
    setBusy(true);
    try {
      const agent = await paseo.agents.ref(board.agent.id).refresh();
      if (!agent?.agent.workspaceId || agent.agent.archivedAt) {
        throw new Error(
          "O agente foi arquivado ou não está disponível. O vínculo e o histórico foram preservados. Encerre a sessão manualmente antes de escolher outra conversa.",
        );
      }
      const workspace = await paseo.workspaces
        .ref(agent.agent.workspaceId)
        .refresh();
      if (workspace?.projectId !== projectId)
        throw new Error(
          "Este agente não pertence ao projeto. Escolha outro agente.",
        );
      if (!navigation?.openAgent)
        throw new Error(
          "Atualize o cliente Paseo para abrir a conversa nativa a partir do painel.",
        );
      navigation.openAgent({ agentId: agent.agent.id });
      if (!layout.compact) onOpenSurface?.("explorer", agent.agent.workspaceId);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function save(command: Command, base = snapshot): Promise<boolean> {
    if (!base || busy) return false;
    if (base.migrationRequired) {
      setError("Revise e confirme a migração no visualizador Business Map antes de salvar. Seu rascunho foi preservado.");
      return false;
    }
    setBusy(true);
    setError("");
    try {
      const next = await apply({
        workspaceId,
        expectedRevision: base.board.revision,
        expectedFingerprint: base.fingerprint,
        command,
      });
      setSnapshot(next);
      setNotice("Salvo no projeto.");
      return true;
    } catch (e) {
      setError(message(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function saveEditor() {
    if (!editor) return;
    const sourceSuggestionId = editor.suggestion?.id;
    let cmd: Command;
    if (editor.kind === "section")
      cmd = {
        type: "section.save",
        section: editor.section,
        sourceSuggestionId,
      };
    else if (editor.kind === "card")
      cmd = {
        type: "card.save",
        sectionId: editor.sectionId,
        card: editor.card,
        sourceSuggestionId,
      };
    else if (editor.kind === "memory")
      cmd = {
        type: "memory.save",
        memory: {
          id: editor.id,
          text: editor.text,
          rationale: editor.rationale,
          kind: editor.memoryKind,
          target: editor.target,
          sourceSuggestionId:
            sourceSuggestionId || editor.sourceSuggestionId || null,
          createdAt: editor.createdAt || new Date().toISOString(),
        },
      };
    else
      cmd =
        editor.field === "title"
          ? { type: "title", title: editor.value, sourceSuggestionId }
          : { type: "whereStopped", text: editor.value, sourceSuggestionId };
    if (await save(cmd, editor.base))
      setEditor((current) => (current === editor ? null : current));
  }
  function editSection(s: Section) {
    if (snapshot)
      setEditor({ kind: "section", section: { ...s }, base: snapshot });
  }
  function editCard(s: Section, card: Card, suggestion?: Suggestion) {
    if (snapshot)
      setEditor({
        kind: "card",
        sectionId: s.id,
        card: { ...card },
        base: snapshot,
        suggestion,
      });
  }
  function addSection() {
    if (snapshot)
      setEditor({
        kind: "section",
        section: { id: makeId("section"), title: "", questions: "", cards: [] },
        base: snapshot,
      });
  }
  function incorporate(s: Suggestion) {
    if (!snapshot) return;
    if (s.kind === "map_draft") {
      setNotice("Revise e confirme este mapa candidato no visualizador Business Map, aberto com business open. A proposta permanece pendente.");
      return;
    }
    if (
      ["skill_import", "skill_adjustment", "session_summary"].includes(s.kind)
    ) {
      setEvolutionCandidate(s);
      setTab(s.kind === "session_summary" ? "session" : "skills");
      scroll.current?.scrollTo({ y: 0, animated: false });
      return;
    }
    if (s.kind === "card_draft") {
      const section =
        board!.sections.find(
          (a) =>
            a.id === s.target.id || a.cards.some((c) => c.id === s.target.id),
        ) || board!.sections[0];
      if (!section) {
        setError(
          "Crie uma área antes de incorporar o card candidato. A sugestão permanece pendente.",
        );
        return;
      }
      setEditor({
        kind: "card",
        sectionId: section.id,
        card: {
          id: makeId("card"),
          title: s.cardDraft?.title || s.title,
          text: s.cardDraft?.text || s.text,
          firstStep: s.cardDraft?.firstStep || "",
          lane: "later",
          done: false,
          important: false,
          urgent: false,
        },
        base: snapshot,
        suggestion: s,
      });
      return;
    }
    if (s.kind === "structure") {
      setPreview({
        base: snapshot,
        suggestionId: s.id,
        items: s.structure.map((i) => ({
          ...i,
          id: makeId("section"),
          checked: true,
        })),
      });
      return;
    }
    if (s.kind === "memory") {
      setEditor({
        kind: "memory",
        id: makeId("memory"),
        text: s.text,
        rationale: s.rationale,
        memoryKind: "context",
        target: s.target,
        base: snapshot,
        suggestion: s,
      });
      return;
    }
    const area = board!.sections.find(
      (a) =>
        a.id === s.target.id || a.cards.some((card) => card.id === s.target.id),
    );
    const card = area?.cards.find((card) => card.id === s.target.id);
    if (area && card) editCard(area, card, s);
    else if (area)
      setEditor({
        kind: "section",
        section: { ...area },
        base: snapshot,
        suggestion: s,
      });
    else
      setEditor({
        kind: "text",
        field: "whereStopped",
        value: board!.whereStopped,
        base: snapshot,
        suggestion: s,
      });
  }
  async function loadAgents() {
    setBusy(true);
    setError("");
    try {
      let cursor: string | undefined;
      const found: typeof agents = [];
      do {
        const result = await paseo.agents.list({
          scope: "active",
          page: { limit: 200, ...(cursor ? { cursor } : {}) },
        });
        for (const item of result.entries) {
          const ws = item.agent.workspaceId
            ? await paseo.workspaces.ref(item.agent.workspaceId).refresh()
            : null;
          if (ws?.projectId === projectId && !item.agent.archivedAt)
            found.push({
              id: item.agent.id,
              title: item.agent.title || item.agent.id,
              status: item.agent.status,
            });
        }
        cursor = result.pageInfo.hasMore
          ? result.pageInfo.nextCursor || undefined
          : undefined;
      } while (cursor);
      setAgents(found);
      if (!found.length)
        setNotice(
          "Nenhum agente ativo neste projeto. Abra um agente pelo Paseo e atualize a lista.",
        );
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function loadSkills() {
    if (!agentId) return;
    setBusy(true);
    try {
      const result = await paseo.agents.ref(agentId).commands();
      setCommands(result.commands);
      setCommandAgentId(agentId);
      setShowCommands(true);
      setNotice(
        result.error ||
          (result.commands.length
            ? "Selecione as skills ou comandos que devem orientar a análise."
            : "O provider não informou skills/comandos. Adicione uma referência manual abaixo."),
      );
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function bindAgent() {
    if (!agentActionsAllowed) {
      setError(
        "Abra a conversa vinculada para pedir ações ao agente. O vínculo não foi alterado.",
      );
      return;
    }
    if (!board?.agent.id) return;
    setBusy(true);
    try {
      const r = await bind({ workspaceId, agentId: board.agent.id });
      setNotice(r.message);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function analyze(structure = false) {
    if (!agentActionsAllowed) {
      setError(
        "Abra a conversa vinculada para pedir novas sugestões. Nenhum pedido foi enviado.",
      );
      return;
    }
    if (!board?.agent.id) {
      setTab("agent");
      setNotice("Escolha e salve um agente existente deste projeto.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const agent = paseo.agents.ref(board.agent.id);
      await agent.refresh();
      if (agent.status !== "idle" || agent.activeTurn)
        throw new Error(
          "O agente precisa estar ocioso. Tente novamente ao terminar a conversa.",
        );
      await bind({ workspaceId, agentId: board.agent.id });
      await agent.send(
        `Business Harness: use business_get_context para ler o board canônico deste projeto. Não leia cópias board.json nos worktrees. Preserve todo texto e foco humanos. Skills/referências escolhidas pela pessoa: ${board.agent.skills.join(", ") || "nenhuma"}. ${structure ? "Proponha uma estrutura inicial flexível orientada a este contexto e às referências escolhidas. Envie uma única business_submit_suggestion kind=structure com áreas em structure[{title,questions}]. Não aplique framework empresarial fixo. A pessoa revisará, editará e desmarcará itens antes de confirmar." : question} Envie candidatas via business_submit_suggestion com requestId estável, revisão base do contexto, autoria e justificativa. Prioridades são decididas pela pessoa. ${board.agent.endOfConversation ? "Ao final natural desta conversa, pode deixar até duas sugestões úteis, inclusive onde retomar. Não faça chamada extra de modelo." : ""}`,
      );
      setNotice(
        "Pedido enviado ao agente escolhido. As sugestões aparecerão aqui para revisão.",
      );
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function doExport() {
    setBusy(true);
    try {
      const r = await exportBoard({ workspaceId, save: true });
      setMarkdown(r.markdown);
      setNotice(
        "Snapshot Markdown salvo. O texto está disponível abaixo para copiar.",
      );
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  const pending =
    board?.suggestions.filter((s) => s.status === "pending").length || 0;
  const selectedSkills = skillText
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  function hasInsights(kind: Target["kind"], id: string) {
    return (
      board?.suggestions.some(
        (s) =>
          s.target.kind === kind &&
          s.target.id === id &&
          (s.status === "pending" || s.status === "kept"),
      ) || false
    );
  }
  function insights(kind: Target["kind"], id: string) {
    return (
      <RelatedInsights
        compact={sidebar}
        suggestions={
          board?.suggestions.filter(
            (s) => s.target.kind === kind && s.target.id === id,
          ) || []
        }
        busy={busy}
        onIncorporate={incorporate}
        onReview={() => {
          setTab("suggestions");
          setSuggestionFilter("all");
          scroll.current?.scrollTo({ y: 0, animated: false });
        }}
      />
    );
  }
  function editResume() {
    if (snapshot)
      setEditor({
        kind: "text",
        field: "whereStopped",
        value: snapshot.board.whereStopped,
        base: snapshot,
      });
  }
  function goArea(id: string | null) {
    setTab("board");
    setExpanded(id);
    setTimeout(
      () => scroll.current?.scrollTo({ y: areaY.current, animated: false }),
      80,
    );
  }
  function atelierRail() {
    return board ? (
      <AtelierRail
        board={board}
        compact={compact}
        busy={busy}
        onSave={save}
        onEdit={editCard}
        onResume={editResume}
        onArea={goArea}
      >
        <RelatedInsights
          suggestions={board.suggestions.filter(
            (s) =>
              !expanded ||
              s.target.kind === "board" ||
              s.target.id === expanded ||
              board.sections
                .find((area) => area.id === expanded)
                ?.cards.some((card) => card.id === s.target.id),
          )}
          busy={busy}
          onIncorporate={incorporate}
          onReview={() => setTab("suggestions")}
        />
      </AtelierRail>
    ) : null;
  }
  function touchAgent() {
    setAgentBase((current) => current || snapshot);
  }
  const filteredCommands = commands.filter((cmd) =>
    `${cmd.name} ${cmd.description}`
      .toLocaleLowerCase()
      .includes(skillSearch.toLocaleLowerCase()),
  );
  const unverifiedSkills = selectedSkills.filter(
    (name) =>
      commandAgentId !== agentId || !commands.some((cmd) => cmd.name === name),
  );
  return (
    <ScrollView
      ref={scroll}
      style={{ flex: 1, backgroundColor: c.surface0 }}
      contentContainerStyle={{
        padding: compact ? 12 : 20,
        gap: canvas ? 7 : 14,
        paddingBottom: 60,
      }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      keyboardShouldPersistTaps="handled"
    >
      {!embedded && (
        <View style={{ gap: 8 }}>
          <Row>
            <Text
              numberOfLines={sidebar ? 2 : canvas ? 1 : undefined}
              style={{
                color: c.foreground,
                fontSize: sidebar ? 18 : canvas ? 22 : compact ? 23 : 27,
                lineHeight: sidebar ? 24 : canvas ? 28 : 34,
                fontWeight: "600",
                flexGrow: 1,
              }}
            >
              {board?.title || "Seu projeto, com clareza."}
            </Text>
            {!sidebar && (
              <Btn dense={canvas && !compact} onPress={reload} disabled={busy}>
                Atualizar
              </Btn>
            )}
            <Btn
              dense={canvas && !compact}
              primary
              onPress={openConversation}
              disabled={busy}
            >
              Abrir conversa
            </Btn>
            {sidebar && onOpenSurface && (
              <Btn onPress={() => onOpenSurface("workspace")}>Expandir</Btn>
            )}
            {!sidebar && (
              <Btn
                dense={canvas && !compact}
                onPress={doExport}
                disabled={!board || busy}
              >
                Exportar Markdown
              </Btn>
            )}
          </Row>
          {!sidebar && (
            <Row>
              <Label muted>{projectName || "Projeto"}</Label>
              {(
                [
                  ["panorama", "Panorama"],
                  ["atelier", "Ateliê"],
                  ["compass", "Bússola"],
                  ["canvas", "Canvas"],
                ] as const
              ).map(([id, label]) => (
                <Btn
                  key={id}
                  dense={canvas && !compact}
                  selected={presentation === id}
                  onPress={() => setVisual({ presentation: id })}
                >
                  {label}
                </Btn>
              ))}
              {!canvas && (
                <Label muted>
                  {presentation === "panorama"
                    ? "O projeto inteiro à vista"
                    : presentation === "atelier"
                      ? "Espaço para desenvolver o raciocínio"
                      : "Retome e escolha o próximo passo"}
                </Label>
              )}
            </Row>
          )}
        </View>
      )}
      {!!error && (
        <Pane>
          <Text
            accessibilityRole="alert"
            style={{ color: c.statusDanger, lineHeight: 22 }}
          >
            {error}
          </Text>
          <Label muted>
            Seu rascunho permanece aberto. Recarregue o board para comparar e
            reabra a edição quando estiver pronto.
          </Label>
        </Pane>
      )}
      {!!notice && (
        <Text
          numberOfLines={sidebar ? 1 : undefined}
          onPress={() => setNotice("")}
          accessibilityLabel="Aviso. Toque para dispensar."
          accessibilityLiveRegion="polite"
          style={{ color: c.foregroundMuted, lineHeight: 21 }}
        >
          {notice}
        </Text>
      )}
      {!!pollError && (
        <Pane>
          <Text
            accessibilityRole="alert"
            style={{ color: c.statusWarning, lineHeight: 22 }}
          >
            {pollError}
          </Text>
        </Pane>
      )}
      {snapshot?.migrationRequired && (
        <Pane>
          <Label>Este board antigo está disponível para leitura.</Label>
          <Label muted>Com o escritor anterior encerrado, revise e confirme a migração no visualizador Business Map. Depois atualize este painel para salvar.</Label>
          <Btn disabled={busy} onPress={reload}>Atualizar após migração</Btn>
        </Pane>
      )}
      {!!board && (
        <Pane>
          <Label>Conectar ao Business Map</Label>
          <Label muted>Para salvar pelo Paseo, gere um código temporário de conexão no visualizador Business Map. O código vale por dois minutos e só pode ser usado uma vez. Reconecte após reiniciar o serviço ou o daemon.</Label>
          <Label muted>Código do Business Map</Label>
          <TextInput
            accessibilityLabel="Código do Business Map"
            value={pairCode}
            onChangeText={setPairCode}
            autoCapitalize="none"
            autoCorrect={false}
            style={{ color: c.foreground, backgroundColor: c.surface0, borderColor: c.border, borderWidth: 1, borderRadius: 8, padding: 10 }}
          />
          <Btn disabled={pairing || busy || !pairCode.trim()} onPress={connectService}>Conectar</Btn>
        </Pane>
      )}
      {!board || !snapshot ? (
        <Pane>
          <Label>
            {error || pollError
              ? "Não foi possível carregar o board deste projeto."
              : "Carregando o board do projeto…"}
          </Label>
          {/Business Map indisponível/.test(error || pollError) && (
            <>
              <Label muted>
                Inicie o serviço com o comando indicado acima e tente conectar novamente.
              </Label>
              <Btn disabled={busy} onPress={reload}>Conectar novamente</Btn>
            </>
          )}
        </Pane>
      ) : (
        <>
          {!onboarding && !sidebar && presentation === "panorama" && (
            <View
              style={{
                flexDirection: compact ? "column" : "row",
                gap: 12,
                alignItems: "stretch",
              }}
            >
              <View style={{ flex: compact ? undefined : 1 }}>
                <Pane>
                  <Row>
                    <Label large>Onde parei</Label>
                    <Btn
                      onPress={() =>
                        setEditor({
                          kind: "text",
                          field: "whereStopped",
                          value: board.whereStopped,
                          base: snapshot,
                        })
                      }
                      disabled={busy}
                    >
                      Editar onde parei
                    </Btn>
                  </Row>
                  <Label>
                    {board.whereStopped ||
                      "Registre uma frase para retomar sem reconstruir o contexto."}
                  </Label>
                  {insights("board", board.boardId)}
                </Pane>
              </View>
              <View style={{ flex: compact ? undefined : 2 }}>
                <FocusStrip
                  board={board}
                  compact={compact}
                  busy={busy}
                  onSave={save}
                  onEdit={editCard}
                />
              </View>
            </View>
          )}
          {!onboarding && !sidebar && presentation === "compass" && (
            <CompassOverview
              board={board}
              compact={compact}
              busy={busy}
              onSave={save}
              onEdit={editCard}
              onResume={editResume}
              onArea={goArea}
            />
          )}
          {onboarding && tab === "board" && (
            <Pane accent>
              <Label large>Uma conversa para clarear o projeto</Label>
              <Label>
                Seu agente conversa no Paseo. Este quadro acompanha suas ideias,
                sem impor um modelo de negócio.
              </Label>
              <Label large>1. Escolha sua conversa</Label>
              <Label muted>
                Crie um agente nativo ou retome um que você já usa neste
                projeto.
              </Label>
              <Btn primary onPress={() => setTab("agent")}>
                Criar ou usar conversa
              </Btn>
              <Label>2. Escolha o que orienta o trabalho</Label>
              <Label muted>
                Importe skills completas para revisar com o agente, ou comece
                sem nenhuma.
              </Label>
              <Btn onPress={() => setTab("skills")}>
                Escolher ou importar skills
              </Btn>
              <Label>3. Dê um objetivo à sessão</Label>
              <Label muted>
                Converse livremente ou explore uma pergunta por vez.
              </Label>
              <Btn onPress={() => setTab("session")}>
                Definir objetivo e começar
              </Btn>
              <Label muted>
                Você também pode organizar o quadro sem IA. Estrutura e
                prioridades continuam suas.
              </Label>
              <Btn onPress={addSection}>Montar quadro sem agente</Btn>
            </Pane>
          )}
          {!onboarding && sidebar && !embedded && tab === "board" && (
            <View style={{ gap: 6 }}>
              <Label muted lines={1}>
                {board.whereStopped || "Deixe uma linha para retomar."}
              </Label>
              <Row>
                <Btn onPress={editResume}>Onde parei</Btn>
                <Btn
                  selected={miniFocus}
                  onPress={() => setMiniFocus(!miniFocus)}
                >
                  Foco
                </Btn>
                <Btn onPress={() => setTab("session")}>Sessão</Btn>
              </Row>
              {board.focus.visible && board.focus.cardIds.length > 0 && (
                <Label lines={1}>{`Foco: ${board.focus.cardIds
                  .map(
                    (id) =>
                      board.sections
                        .flatMap((s) => s.cards)
                        .find((c) => c.id === id)?.title,
                  )
                  .filter(Boolean)
                  .join(" · ")}`}</Label>
              )}
              {miniFocus && (
                <FocusStrip
                  board={board}
                  compact
                  busy={busy}
                  onSave={save}
                  onEdit={editCard}
                />
              )}
            </View>
          )}
          <Row>
            {(
              [
                ["board", "Áreas"],
                ["suggestions", `Sugestões (${pending})`],
                ["memories", `Decisões (${board.memories.length})`],
                ["session", "Sessão"],
                ["skills", "Skills"],
                ["agent", "Agente"],
              ] as const
            )
              .filter(
                ([id]) =>
                  !embedded ||
                  ["board", "suggestions", "memories"].includes(id),
              )
              .map(([id, label]) => (
                <Btn
                  dense={canvas && !compact}
                  key={id}
                  selected={tab === id}
                  onPress={() => setTab(id)}
                >
                  {label}
                </Btn>
              ))}
          </Row>
          {tab === "session" && (
            <Sessions
              scope={scope}
              workspaceId={workspaceId}
              snapshot={snapshot}
              busy={busy}
              save={save}
              onOpen={openConversation}
              allowAgentActions={agentActionsAllowed}
              candidate={evolutionCandidate}
              onReviewed={() => setEvolutionCandidate(null)}
            />
          )}
          {tab === "skills" && (
            <SkillLibrary
              scope={scope}
              workspaceId={workspaceId}
              snapshot={snapshot}
              busy={busy}
              save={save}
              onSnapshot={setSnapshot}
              candidate={evolutionCandidate}
              onReviewed={() => setEvolutionCandidate(null)}
            />
          )}
          {editor && (
            <View
              onLayout={(e) => {
                editorY.current = e.nativeEvent.layout.y;
              }}
            >
              <Pane accent>
                <Label large>
                  {editor.kind === "section"
                    ? "Editar área"
                    : editor.kind === "card"
                      ? "Editar card"
                      : editor.kind === "memory"
                        ? "Confirmar contexto ou decisão"
                        : editor.field === "title"
                          ? "Título do board"
                          : "Onde parei"}
                </Label>
                <Label muted>
                  Rascunho local. Alterações só entram ao salvar.
                </Label>
                {editor.base.fingerprint !== snapshot.fingerprint && (
                  <Pane>
                    <Text style={{ color: c.statusWarning }}>
                      O board mudou desde o início deste rascunho.
                    </Text>
                    <Label muted>Conteúdo salvo atualmente:</Label>
                    <Label>{savedEditorContent(editor, board)}</Label>
                    <Btn
                      disabled={busy}
                      onPress={() => setEditor({ ...editor, base: snapshot })}
                    >
                      Revisei: usar revisão atual como base
                    </Btn>
                  </Pane>
                )}
                {"suggestion" in editor && editor.suggestion && (
                  <Pane>
                    <Label muted>
                      Sugestão do agente · referência para sua edição
                    </Label>
                    <Label>{editor.suggestion.text}</Label>
                    <Label muted>{editor.suggestion.rationale}</Label>
                  </Pane>
                )}
                {editor.kind === "section" && (
                  <>
                    <Field
                      label="Título da área"
                      value={editor.section.title}
                      onChange={(v) =>
                        setEditor({
                          ...editor,
                          section: { ...editor.section, title: v },
                        })
                      }
                    />
                    <Field
                      label="Perguntas orientadoras"
                      value={editor.section.questions}
                      multiline
                      onChange={(v) =>
                        setEditor({
                          ...editor,
                          section: { ...editor.section, questions: v },
                        })
                      }
                    />
                  </>
                )}
                {editor.kind === "card" && (
                  <>
                    <Row>
                      {board.sections.map((s) => (
                        <Btn
                          key={s.id}
                          selected={editor.sectionId === s.id}
                          disabled={board.sections.some(
                            (area) =>
                              area.id !== s.id &&
                              area.cards.some((c) => c.id === editor.card.id),
                          )}
                          onPress={() =>
                            setEditor({ ...editor, sectionId: s.id })
                          }
                        >{`Área: ${s.title || "Sem título"}`}</Btn>
                      ))}
                    </Row>
                    <Field
                      label="Título do card"
                      value={editor.card.title}
                      onChange={(v) =>
                        setEditor({
                          ...editor,
                          card: { ...editor.card, title: v },
                        })
                      }
                    />
                    <Field
                      label="Texto do card"
                      multiline
                      value={editor.card.text}
                      onChange={(v) =>
                        setEditor({
                          ...editor,
                          card: { ...editor.card, text: v },
                        })
                      }
                    />
                    <Field
                      label="Primeiro passo (opcional)"
                      value={editor.card.firstStep}
                      onChange={(v) =>
                        setEditor({
                          ...editor,
                          card: { ...editor.card, firstStep: v },
                        })
                      }
                    />
                    <Row>
                      <Btn
                        selected={editor.card.lane === "now"}
                        onPress={() =>
                          setEditor({
                            ...editor,
                            card: { ...editor.card, lane: "now" },
                          })
                        }
                      >
                        Agora
                      </Btn>
                      <Btn
                        selected={editor.card.lane === "later"}
                        onPress={() =>
                          setEditor({
                            ...editor,
                            card: { ...editor.card, lane: "later" },
                          })
                        }
                      >
                        Depois
                      </Btn>
                      <Btn
                        selected={editor.card.done}
                        onPress={() =>
                          setEditor({
                            ...editor,
                            card: { ...editor.card, done: !editor.card.done },
                          })
                        }
                      >
                        Concluído
                      </Btn>
                      <Btn
                        selected={editor.card.important}
                        onPress={() =>
                          setEditor({
                            ...editor,
                            card: {
                              ...editor.card,
                              important: !editor.card.important,
                            },
                          })
                        }
                      >
                        Importante
                      </Btn>
                      <Btn
                        selected={editor.card.urgent}
                        onPress={() =>
                          setEditor({
                            ...editor,
                            card: {
                              ...editor.card,
                              urgent: !editor.card.urgent,
                            },
                          })
                        }
                      >
                        Urgente
                      </Btn>
                    </Row>
                  </>
                )}
                {editor.kind === "text" && (
                  <Field
                    label={
                      editor.field === "title"
                        ? "Título do board"
                        : "Linha onde parei"
                    }
                    multiline={editor.field === "whereStopped"}
                    value={editor.value}
                    onChange={(v) => setEditor({ ...editor, value: v })}
                  />
                )}
                {editor.kind === "memory" && (
                  <>
                    <Row>
                      <Btn
                        selected={editor.memoryKind === "context"}
                        onPress={() =>
                          setEditor({ ...editor, memoryKind: "context" })
                        }
                      >
                        Contexto durável
                      </Btn>
                      <Btn
                        selected={editor.memoryKind === "decision"}
                        onPress={() =>
                          setEditor({ ...editor, memoryKind: "decision" })
                        }
                      >
                        Decisão
                      </Btn>
                    </Row>
                    <Label
                      muted
                    >{`Destino: ${targetName(board, editor.target)}`}</Label>
                    <Row>
                      <Btn
                        selected={editor.target.kind === "board"}
                        onPress={() =>
                          setEditor({
                            ...editor,
                            target: { kind: "board", id: board.boardId },
                          })
                        }
                      >
                        Board inteiro
                      </Btn>
                      {board.sections.map((s) => (
                        <Btn
                          key={s.id}
                          selected={editor.target.id === s.id}
                          onPress={() =>
                            setEditor({
                              ...editor,
                              target: { kind: "section", id: s.id },
                            })
                          }
                        >{`Área: ${s.title || "Sem título"}`}</Btn>
                      ))}
                    </Row>
                    {expanded && (
                      <Row>
                        {board.sections
                          .flatMap((s) => s.cards)
                          .map((card) => (
                            <Btn
                              key={card.id}
                              selected={editor.target.id === card.id}
                              onPress={() =>
                                setEditor({
                                  ...editor,
                                  target: { kind: "card", id: card.id },
                                })
                              }
                            >{`Card: ${card.title || "Sem título"}`}</Btn>
                          ))}
                      </Row>
                    )}
                    <Field
                      label="Memória confirmada por você"
                      value={editor.text}
                      multiline
                      onChange={(v) => setEditor({ ...editor, text: v })}
                    />
                    <Field
                      label="Justificativa da decisão ou contexto"
                      value={editor.rationale}
                      multiline
                      onChange={(v) => setEditor({ ...editor, rationale: v })}
                    />
                  </>
                )}
                <Row>
                  <Btn
                    primary
                    onPress={() =>
                      void saveEditor().catch((e) => setError(message(e)))
                    }
                    disabled={busy}
                  >
                    {editor.kind === "memory"
                      ? "Confirmar memória"
                      : "Salvar edição"}
                  </Btn>
                  <Btn onPress={() => setEditor(null)} disabled={busy}>
                    Fechar rascunho
                  </Btn>
                </Row>
              </Pane>
            </View>
          )}
          {preview && (
            <View
              onLayout={(e) => {
                previewY.current = e.nativeEvent.layout.y;
              }}
            >
              <Pane accent>
                <Label large>Prévia de estrutura</Label>
                <Label muted>
                  Edite os títulos e as perguntas. Desmarque tudo que não quiser
                  criar.
                </Label>
                {preview.base.fingerprint !== snapshot.fingerprint && (
                  <Pane>
                    <Label>
                      O board mudou. Revise as áreas atuais antes de confirmar
                      esta prévia.
                    </Label>
                    <Btn
                      onPress={() => setPreview({ ...preview, base: snapshot })}
                    >
                      Revisei: usar revisão atual na prévia
                    </Btn>
                  </Pane>
                )}
                {preview.items.map((item, index) => (
                  <Pane key={item.id}>
                    <Btn
                      selected={item.checked}
                      onPress={() =>
                        setPreview({
                          ...preview,
                          items: preview.items.map((x, i) =>
                            i === index ? { ...x, checked: !x.checked } : x,
                          ),
                        })
                      }
                    >
                      {item.checked ? "✓ Incluir área" : "Incluir área"}
                    </Btn>
                    <Field
                      label={`Título da área ${index + 1}`}
                      value={item.title}
                      onChange={(v) =>
                        setPreview({
                          ...preview,
                          items: preview.items.map((x, i) =>
                            i === index ? { ...x, title: v } : x,
                          ),
                        })
                      }
                    />
                    <Field
                      label={`Perguntas da área ${index + 1}`}
                      value={item.questions}
                      multiline
                      onChange={(v) =>
                        setPreview({
                          ...preview,
                          items: preview.items.map((x, i) =>
                            i === index ? { ...x, questions: v } : x,
                          ),
                        })
                      }
                    />
                  </Pane>
                ))}
                <Row>
                  <Btn
                    onPress={() =>
                      setPreview({
                        ...preview,
                        items: [
                          ...preview.items,
                          {
                            id: makeId("section"),
                            title: "",
                            questions: "",
                            checked: true,
                          },
                        ],
                      })
                    }
                  >
                    Adicionar item à prévia
                  </Btn>
                  <Btn
                    primary
                    disabled={busy || !preview.items.some((x) => x.checked)}
                    onPress={async () => {
                      if (
                        await save(
                          {
                            type: "structure.apply",
                            items: preview.items
                              .filter((x) => x.checked)
                              .map(({ checked, ...x }) => x),
                            suggestionId: preview.suggestionId,
                          },
                          preview.base,
                        )
                      )
                        setPreview((current) =>
                          current === preview ? null : current,
                        );
                    }}
                  >
                    Confirmar estrutura
                  </Btn>
                  <Btn onPress={() => setPreview(null)} disabled={busy}>
                    Fechar prévia
                  </Btn>
                </Row>
              </Pane>
            </View>
          )}
          {deleteCmd && (
            <View
              onLayout={(e) => {
                deleteY.current = e.nativeEvent.layout.y;
              }}
            >
              <Pane>
                <Label>Excluir este item e seu conteúdo?</Label>
                <Row>
                  <Btn
                    danger
                    disabled={busy}
                    onPress={async () => {
                      if (await save(deleteCmd)) setDeleteCmd(null);
                    }}
                  >
                    Confirmar exclusão
                  </Btn>
                  <Btn onPress={() => setDeleteCmd(null)}>
                    Cancelar exclusão
                  </Btn>
                </Row>
              </Pane>
            </View>
          )}
          {tab === "board" && (
            <>
              <Row>
                {canvas && (
                  <Label
                    muted
                  >{`${board.sections.length} áreas · ${board.sections.reduce((n, s) => n + s.cards.length, 0)} cards`}</Label>
                )}
                <Btn
                  dense={canvas && !compact}
                  primary
                  onPress={addSection}
                  disabled={busy}
                >
                  Nova área
                </Btn>
                {canvas && (
                  <>
                    <Btn dense={!compact} onPress={editResume}>
                      Onde parei
                    </Btn>
                    <Btn
                      dense={!compact}
                      selected={miniFocus}
                      onPress={() => setMiniFocus(!miniFocus)}
                    >{`Foco (${board.focus.cardIds.length})`}</Btn>
                  </>
                )}
                <Disclosure
                  dense={canvas && !compact}
                  block
                  label={canvas ? "Opções do quadro" : "Preparar quadro"}
                >
                  <Btn
                    onPress={() =>
                      setEditor({
                        kind: "text",
                        field: "title",
                        value: board.title,
                        base: snapshot,
                      })
                    }
                  >
                    Editar título do board
                  </Btn>
                  <Btn
                    onPress={() =>
                      setPreview({
                        base: snapshot,
                        items: [
                          {
                            id: makeId("section"),
                            title: "",
                            questions: "",
                            checked: true,
                          },
                        ],
                      })
                    }
                  >
                    Montar prévia manual
                  </Btn>
                  {agentActionsAllowed && (
                    <Btn onPress={() => analyze(true)} disabled={busy}>
                      Pedir prévia ao agente
                    </Btn>
                  )}
                </Disclosure>
              </Row>
              {canvas && miniFocus && (
                <FocusStrip
                  board={board}
                  compact={compact}
                  busy={busy}
                  onSave={save}
                  onEdit={editCard}
                />
              )}
              {board.sections.length === 0 && !onboarding && (
                <Pane>
                  <Label large>Comece com o que faz sentido para você.</Label>
                  <Label>
                    {embedded
                      ? agentActionsAllowed
                        ? "Crie áreas manualmente ou continue no chat. As propostas recebidas aparecem em Sugestões e só entram no quadro após sua revisão."
                        : "Você pode editar as áreas e revisar sugestões já recebidas. Para pedir novas sugestões, abra a conversa vinculada."
                      : "Crie suas áreas livremente ou escolha skills para orientar uma prévia do agente. Toda estrutura pode ser editada antes de entrar no board."}
                  </Label>
                  {!embedded && (
                    <Btn onPress={() => setTab("agent")}>
                      Escolher agente e skills
                    </Btn>
                  )}
                </Pane>
              )}
              <View
                onLayout={(e) => {
                  areaY.current = e.nativeEvent.layout.y;
                }}
                style={{
                  flexDirection:
                    compact || presentation !== "atelier" ? "column" : "row",
                  gap: 26,
                  alignItems: "flex-start",
                }}
              >
                <View style={{ flex: 1, alignSelf: "stretch" }}>
                  {presentation === "compass" && (
                    <Row>
                      <Label large>
                        {expanded ? "Área em detalhe" : "Quadro completo"}
                      </Label>
                      {expanded && (
                        <Btn onPress={() => setExpanded(null)}>
                          Todas as áreas
                        </Btn>
                      )}
                    </Row>
                  )}
                  {canvas && !expanded ? (
                    <CanvasSheet
                      board={board}
                      width={width - (compact ? 24 : 40)}
                      compact={compact}
                      busy={busy}
                      onEditSection={editSection}
                      onEditCard={editCard}
                      onArea={goArea}
                      onReview={(suggestion) => {
                        if (suggestion) incorporate(suggestion);
                        else {
                          setTab("suggestions");
                          setSuggestionFilter("pending");
                          scroll.current?.scrollTo({ y: 0, animated: false });
                        }
                      }}
                    />
                  ) : (
                    <>
                      {canvas && expanded && (
                        <Row>
                          <Btn onPress={() => setExpanded(null)}>
                            Voltar à folha Canvas
                          </Btn>
                          <Label muted>
                            Área em detalhe · mesmos dados e edição
                          </Label>
                        </Row>
                      )}
                      <BoardAreas
                        sidebar={sidebar}
                        board={board}
                        presentation={presentation}
                        compact={compact}
                        expanded={expanded}
                        width={
                          presentation === "atelier" && !compact
                            ? width - 340
                            : width
                        }
                        busy={busy}
                        onSave={save}
                        onEditSection={editSection}
                        onEditCard={editCard}
                        onExpand={setExpanded}
                        onDelete={setDeleteCmd}
                        onDecision={(card) =>
                          setEditor({
                            kind: "memory",
                            id: makeId("memory"),
                            text: "",
                            rationale: "",
                            memoryKind: "decision",
                            target: { kind: "card", id: card.id },
                            base: snapshot,
                          })
                        }
                        hasInsights={hasInsights}
                        renderInsights={insights}
                      />
                    </>
                  )}
                </View>
                {presentation === "atelier" && (
                  <View
                    style={{
                      width: compact ? "100%" : 300,
                      backgroundColor: c.surface1,
                      padding: 16,
                      borderRadius: 8,
                    }}
                  >
                    {compact ? (
                      <Disclosure
                        block
                        label="Abrir apoio: foco, insights e decisões"
                      >
                        {atelierRail()}
                      </Disclosure>
                    ) : (
                      atelierRail()
                    )}
                  </View>
                )}
              </View>
            </>
          )}
          {tab === "suggestions" && (
            <>
              <Row>
                {(
                  [
                    ["pending", "Pendentes"],
                    ["kept", "Mantidas"],
                    ["all", "Todas"],
                  ] as const
                ).map(([id, label]) => (
                  <Btn
                    key={id}
                    selected={suggestionFilter === id}
                    onPress={() => setSuggestionFilter(id)}
                  >
                    {label}
                  </Btn>
                ))}
              </Row>
              <Label muted>
                Sugestões são candidatas do agente. Incorporar abre sua edição;
                textos humanos só mudam quando você salva.
              </Label>
              {board.suggestions
                .filter(
                  (s) =>
                    suggestionFilter === "all" || s.status === suggestionFilter,
                )
                .map((s) => (
                  <Pane key={s.id} accent={s.status === "pending"}>
                    <Label large>{s.title || "Sugestão"}</Label>
                    <Label
                      muted
                    >{`${suggestionKind[s.kind]} · ${suggestionStatus[s.status]}${s.stale ? " · revisar contexto anterior" : ""}`}</Label>
                    <AgentSource agentId={s.sourceAgentId} />
                    <Label>{s.text}</Label>
                    <Label muted>{s.rationale}</Label>
                    {s.kind === "map_draft" && (
                      <Label muted>Revise relações e evidências no visualizador Business Map, aberto com business open.</Label>
                    )}
                    <Label
                      muted
                    >{`Destino: ${targetName(board, s.target)}`}</Label>
                    <Disclosure block label="Detalhes da sugestão">
                      <Label
                        muted
                      >{`ID: ${s.id}\nAgente: ${s.sourceAgentId}\nRevisão base: ${s.baseRevision}\nAlvo: ${s.target.kind} · ${s.target.id}\nRecebida: ${s.createdAt}`}</Label>
                    </Disclosure>
                    {s.structure.length > 0 && (
                      <Label>
                        {s.structure
                          .map((x) => `• ${x.title}: ${x.questions}`)
                          .join("\n")}
                      </Label>
                    )}
                    <Row>
                      <Btn
                        onPress={() =>
                          save({
                            type: "suggestion.status",
                            id: s.id,
                            status: "kept",
                          })
                        }
                        disabled={busy || s.status === "kept"}
                      >
                        Manter
                      </Btn>
                      <Btn
                        onPress={() => incorporate(s)}
                        disabled={busy || s.status === "incorporated"}
                      >
                        {s.kind === "map_draft"
                          ? "Revisar no Business Map"
                          : s.kind === "structure"
                          ? "Revisar prévia"
                          : s.kind === "memory"
                            ? "Revisar memória"
                            : "Incorporar manualmente"}
                      </Btn>
                      <Btn
                        danger
                        onPress={() =>
                          save({
                            type: "suggestion.status",
                            id: s.id,
                            status: "discarded",
                          })
                        }
                        disabled={busy || s.status === "discarded"}
                      >
                        Descartar
                      </Btn>
                    </Row>
                  </Pane>
                ))}
              {board.suggestions.filter(
                (s) =>
                  suggestionFilter === "all" || s.status === suggestionFilter,
              ).length === 0 && (
                <Pane>
                  <Label>Nenhuma sugestão nesta lista.</Label>
                </Pane>
              )}
            </>
          )}
          {tab === "memories" && (
            <>
              <Row>
                <Btn
                  primary
                  onPress={() =>
                    setEditor({
                      kind: "memory",
                      id: makeId("memory"),
                      text: "",
                      rationale: "",
                      memoryKind: "context",
                      target: { kind: "board", id: board.boardId },
                      base: snapshot,
                    })
                  }
                >
                  Novo contexto ou decisão
                </Btn>
              </Row>
              <Label muted>
                Memórias confirmadas permanecem disponíveis ao agente como
                contexto durável.
              </Label>
              {board.memories.map((m) => (
                <Pane key={m.id}>
                  <Label large>
                    {m.kind === "decision" ? "Decisão" : "Contexto durável"}
                  </Label>
                  <Label>{m.text}</Label>
                  <Label muted>{`Justificativa: ${m.rationale || "—"}`}</Label>
                  <Label
                    muted
                  >{`Destino: ${targetName(board, m.target)}${m.sourceSuggestionId ? " · sugestão confirmada pela pessoa" : " · autoria humana"}`}</Label>
                  <Disclosure block label="Detalhes da memória">
                    <Label
                      muted
                    >{`ID: ${m.id}\nAlvo: ${m.target.kind} · ${m.target.id}\nCriada: ${m.createdAt}${m.sourceSuggestionId ? `\nSugestão de origem: ${m.sourceSuggestionId}` : ""}`}</Label>
                  </Disclosure>
                  <Row>
                    <Btn
                      onPress={() =>
                        setEditor({
                          kind: "memory",
                          id: m.id,
                          text: m.text,
                          rationale: m.rationale,
                          memoryKind: m.kind,
                          target: m.target,
                          base: snapshot,
                          sourceSuggestionId: m.sourceSuggestionId,
                          createdAt: m.createdAt,
                        })
                      }
                    >
                      Editar memória
                    </Btn>
                    <Btn
                      danger
                      onPress={() =>
                        setDeleteCmd({ type: "memory.delete", id: m.id })
                      }
                    >
                      Excluir memória
                    </Btn>
                  </Row>
                </Pane>
              ))}
            </>
          )}
          {tab === "agent" && (
            <Pane>
              <Label large>Converse com seu agente</Label>
              <AgentSetup
                scope={scope}
                workspaceId={workspaceId}
                disabled={busy || !!board.currentSessionId}
                onCreated={async (id) => {
                  if (
                    !(await save({
                      type: "agent",
                      id,
                      skills: board.agent.skills,
                      endOfConversation: board.agent.endOfConversation,
                    }))
                  )
                    throw new Error(
                      "O agente foi criado, mas o vínculo conflitou. Atualize o board e tente vincular o agente criado.",
                    );
                  setAgentId(id);
                  setAgentBase(null);
                  const result = await bind({ workspaceId, agentId: id });
                  setNotice(result.message);
                }}
              />
              {!!board.currentSessionId && (
                <Label muted>
                  Encerre a sessão atual antes de criar ou vincular outro
                  agente. O histórico guarda seu agente original.
                </Label>
              )}
              <Label muted>
                Ou escolha um agente existente deste projeto. A conversa recebe
                três ferramentas e só envia candidatas para sua revisão.
              </Label>
              <Btn onPress={loadAgents} disabled={busy}>
                Listar agentes do projeto
              </Btn>
              {agents.map((a) => (
                <Btn
                  key={a.id}
                  selected={agentId === a.id}
                  onPress={() => {
                    touchAgent();
                    setAgentId(a.id);
                    setShowCommands(false);
                  }}
                >{`${a.title} · ${a.status}`}</Btn>
              ))}
              <Row>
                <Btn
                  selected={agentId === null}
                  onPress={() => {
                    touchAgent();
                    setAgentId(null);
                    setShowCommands(false);
                  }}
                >
                  Sem agente
                </Btn>
                <Label muted>Seleção salva:</Label>
                {board.agent.id ? (
                  <AgentSource agentId={board.agent.id} />
                ) : (
                  <Label muted>Nenhum agente</Label>
                )}
              </Row>
              <Btn onPress={loadSkills} disabled={busy || !agentId}>
                Consultar skills e comandos do agente
              </Btn>
              {commands.length > 0 && (
                <Btn onPress={() => setShowCommands(!showCommands)}>
                  {showCommands
                    ? `Ocultar catálogo (${commands.length})`
                    : `Mostrar catálogo (${commands.length})`}
                </Btn>
              )}
              {showCommands && (
                <>
                  <Field
                    label="Pesquisar skills e comandos"
                    value={skillSearch}
                    onChange={setSkillSearch}
                    placeholder="Buscar por nome ou descrição"
                  />
                  <Label
                    muted
                  >{`${Math.min(filteredCommands.length, 12)} de ${filteredCommands.length} resultados. Refine a pesquisa para encontrar outros.`}</Label>
                </>
              )}
              {showCommands &&
                filteredCommands.slice(0, 12).map((cmd) => (
                  <Btn
                    key={cmd.name}
                    selected={selectedSkills.includes(cmd.name)}
                    onPress={() => {
                      touchAgent();
                      setSkillText(
                        (selectedSkills.includes(cmd.name)
                          ? selectedSkills.filter((s) => s !== cmd.name)
                          : [...selectedSkills, cmd.name]
                        ).join("\n"),
                      );
                    }}
                  >{`${cmd.kind === "skill" ? "Skill" : "Comando/referência"}: ${cmd.name}`}</Btn>
                ))}
              <Field
                label="Referências por nome · não lido (uma por linha)"
                multiline
                value={skillText}
                onChange={(v) => {
                  touchAgent();
                  setSkillText(v);
                }}
                placeholder="Nome da skill ou referência manual"
              />
              {selectedSkills.length > 0 && (
                <Label muted>
                  Referências por nome não fornecem o texto completo ao agente:
                  não lido. Importe a pasta na aba Skills para leitura canônica.
                </Label>
              )}
              {unverifiedSkills.length > 0 && (
                <Label
                  muted
                >{`Referências manuais ou ainda não verificadas neste agente: ${unverifiedSkills.join(", ")}. A seleção foi preservada; o catálogo pode estar incompleto ou indisponível.`}</Label>
              )}
              {agentBase && agentBase.fingerprint !== snapshot.fingerprint && (
                <Pane>
                  <Label>
                    As preferências estão em rascunho e o board mudou. Revise a
                    seleção salva exibida acima.
                  </Label>
                  <Btn onPress={() => setAgentBase(snapshot)}>
                    Revisei: atualizar base das preferências
                  </Btn>
                </Pane>
              )}
              <Btn
                selected={endNotes}
                onPress={() => {
                  touchAgent();
                  setEndNotes(!endNotes);
                }}
              >
                {endNotes
                  ? "✓ Sugerir até 2 notas úteis ao final da conversa"
                  : "Sugerir até 2 notas úteis ao final da conversa"}
              </Btn>
              <Label muted>
                Essa preferência orienta o próprio agente durante a conversa.
                Não dispara uma segunda chamada de modelo.
              </Label>
              <Row>
                <Btn
                  primary
                  disabled={busy}
                  onPress={async () => {
                    if (
                      await save(
                        {
                          type: "agent",
                          id: agentId,
                          skills: selectedSkills,
                          endOfConversation: endNotes,
                        },
                        agentBase || snapshot,
                      )
                    )
                      setAgentBase(null);
                  }}
                >
                  Salvar agente e preferências
                </Btn>
                <Btn disabled={busy || !board.agent.id} onPress={bindAgent}>
                  Vincular ferramentas (ocioso)
                </Btn>
              </Row>
              <Field
                label="Pedido de análise"
                multiline
                value={question}
                onChange={setQuestion}
              />
              <Row>
                <Btn
                  primary
                  onPress={() => analyze()}
                  disabled={busy || !board.agent.id || !agentActionsAllowed}
                >
                  Pedir análise
                </Btn>
                <Btn
                  onPress={() => analyze(true)}
                  disabled={busy || !board.agent.id || !agentActionsAllowed}
                >
                  Pedir estrutura inicial
                </Btn>
              </Row>
            </Pane>
          )}
          {!!markdown && (
            <Pane>
              <Label large>Snapshot Markdown</Label>
              <TextInputExport value={markdown} />
              <Btn onPress={() => setMarkdown("")}>Fechar exportação</Btn>
            </Pane>
          )}
          {sidebar && (
            <Disclosure block label="Atualizar e exportar">
              <Row>
                <Btn onPress={reload} disabled={busy}>
                  Atualizar quadro
                </Btn>
                <Btn onPress={doExport} disabled={busy}>
                  Exportar Markdown
                </Btn>
              </Row>
            </Disclosure>
          )}
          <Disclosure block label="Detalhes do armazenamento">
            {!!snapshot.warning && <Label>{snapshot.warning}</Label>}
            <Label
              muted
            >{`Board canônico · ${snapshot.root}/.business-board/board.json\nRevisão: ${board.revision}\nBoard ID: ${board.boardId}\nAgente selecionado: ${board.agent.id || "nenhum"}`}</Label>
          </Disclosure>
        </>
      )}
    </ScrollView>
  );
}
function TextInputExport({ value }: { value: string }) {
  return (
    <Field
      label="Markdown para selecionar e copiar"
      value={value}
      onChange={() => {}}
      multiline
    />
  );
}
