import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import {
  usePaseo,
  useRpc,
  type PluginAgentPanelProps,
  type PluginWorkspacePanelProps,
} from "@getpaseo/plugin/client";
import type { RpcOutput } from "@getpaseo/plugin";
import {
  conversationStartRpc,
  conversationDeliverRpc,
} from "../shared/chat-entry";
import { applyCommandRpc, getBoardRpc } from "../shared/rpc";
import { makeId, type Command } from "../shared/model";
import { projectScope } from "../shared/project-state";
import { friendlyError } from "../shared/errors";
import { useProjectState } from "./project-state";
import { boardObservations } from "./board-observations";
import { BoardPanel } from "./board";
import { SkillLibrary } from "./skills";
import { Btn, Disclosure, Field, Label, Pane, Row, ThemeContext } from "./ui";

type Snapshot = RpcOutput<typeof getBoardRpc>;
type Draft = {
  requestId: string;
  title: string | null;
  objective: string;
  base: Snapshot | null;
  committedSessionId: string | null;
};
type Props = PluginAgentPanelProps & {
  onOpenBoard: (
    location: "workspace" | "explorer",
    workspaceId?: string,
  ) => void;
};

export function ConversationPanel(props: Props) {
  const paseo = usePaseo();
  const [project, setProject] = useState<{
    identity: string;
    id: string;
    name: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const identity = JSON.stringify([
    props.host.id,
    props.workspaceId,
    props.params.agentId,
  ]);
  useEffect(() => {
    let live = true;
    setError("");
    paseo.workspaces
      .ref(props.workspaceId)
      .refresh()
      .then((w) => {
        if (!w?.projectId)
          throw new Error(
            "Esta conversa precisa de um projeto registrado no Paseo.",
          );
        if (live)
          setProject({
            identity,
            id: w.projectId,
            name: w.projectDisplayName || w.name || w.projectId,
          });
      })
      .catch((e) => {
        if (live) setError(friendlyError(e));
      });
    return () => {
      live = false;
    };
  }, [identity, attempt, paseo]);
  return (
    <ThemeContext.Provider value={props.theme}>
      {project?.identity === identity ? (
        <ConversationContent key={identity} {...props} project={project} />
      ) : (
        <View
          style={{
            padding: 16,
            gap: 12,
            backgroundColor: props.theme.colors.surface0,
          }}
        >
          <Label>{error || "Localizando o projeto desta conversa…"}</Label>
          {!!error && (
            <Btn onPress={() => setAttempt(attempt + 1)}>Tentar novamente</Btn>
          )}
        </View>
      )}
    </ThemeContext.Provider>
  );
}

function ConversationContent(
  props: Props & { project: { id: string; name: string } },
) {
  const {
    workspaceId,
    params: { agentId },
    project,
  } = props;
  const paseo = usePaseo(),
    get = useRpc(getBoardRpc),
    apply = useRpc(applyCommandRpc);
  const start = useRpc(conversationStartRpc),
    deliver = useRpc(conversationDeliverRpc);
  const scope = projectScope(props.host.id, project.id);
  const [snapshot, setSnapshot] = useProjectState<Snapshot | null>(
    scope,
    "snapshot",
    null,
  );
  const [draft, setDraft] = useProjectState<Draft>(
    scope,
    `entry:${agentId}`,
    () => ({
      requestId: makeId("entry"),
      title: null,
      objective: "",
      base: null,
      committedSessionId: null,
    }),
  );
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [bindingWarning, setBindingWarning] = useState("");
  const [pollError, setPollError] = useState("");
  const [busy, setBusy] = useState(false);
  const [agent, setAgent] = useState<{
    title: string;
    idle: boolean;
    archived: boolean;
  } | null>(null);
  const [showSkills, setShowSkills] = useState(false);
  const [showBoard, setShowBoard] = useState(true);
  const [newSession, setNewSession] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [retryConfirmed, setRetryConfirmed] = useState(false);
  useEffect(
    () =>
      boardObservations.watch(
        scope,
        () => get({ workspaceId }),
        (next) => {
          setSnapshot(next);
          setPollError("");
        },
        (e) =>
          setPollError(
            `Não foi possível ler o board. O último estado e seu rascunho foram preservados. ${friendlyError(e)}`,
          ),
      ),
    [scope, get, workspaceId],
  );
  useEffect(() => {
    let live = true;
    const handle = paseo.agents.ref(agentId);
    function update() {
      const current = handle.current();
      if (live && current)
        setAgent({
          title: current.title || "Esta conversa",
          idle: current.status === "idle" && !current.activeTurn,
          archived: !!current.archivedAt,
        });
    }
    const stop = handle.subscribe(update);
    void handle
      .refresh()
      .then(update)
      .catch((e) => {
        if (live) setError(friendlyError(e));
      });
    return () => {
      live = false;
      stop();
    };
  }, [agentId, paseo]);
  const board = snapshot?.board;
  const session = board?.sessions.find((s) => s.id === board.currentSessionId);
  const foreign = !!session && session.agentId !== agentId;
  const sessionHere = session?.agentId === agentId ? session : null;
  const form =
    !!snapshot &&
    !session &&
    (newSession ||
      snapshot.fingerprint === "missing" ||
      !board?.agent.id ||
      (!board.sections.length && !board.sessions.length));
  const title =
    draft.title ??
    (snapshot?.fingerprint === "missing" ? "" : board?.title || "");
  const base = draft.base || snapshot;
  useEffect(() => {
    props.tab.setModified(!!draft.objective || draft.title !== null);
  }, [props.tab, draft.objective, draft.title]);
  function publish(next: Snapshot, ownSkillWrite = false) {
    setSnapshot(next);
    boardObservations.publish(scope, next);
    if (ownSkillWrite) setDraft((d) => ({ ...d, base: next }));
  }
  function change(patch: Partial<Draft>) {
    setDraft((d) => ({ ...d, base: d.base || snapshot, ...patch }));
  }
  async function save(command: Command, expected = snapshot) {
    if (!expected || busy) return false;
    setBusy(true);
    setError("");
    try {
      const next = await apply({
        workspaceId,
        expectedRevision: expected.board.revision,
        expectedFingerprint: expected.fingerprint,
        command,
      });
      publish(next, true);
      return true;
    } catch (e) {
      setError(friendlyError(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function send(sessionId: string) {
    const result = await deliver({
      workspaceId,
      agentId,
      sessionId,
      retryConfirmed,
    });
    publish(result.snapshot);
    setNotice(result.message);
    setBindingWarning(result.warning || "");
    setUncertain(result.status === "uncertain");
    setRetryConfirmed(false);
    if (result.status === "sent" || result.status === "already_sent") {
      setDraft((d) => ({
        ...d,
        objective: "",
        title: null,
        base: null,
        committedSessionId: null,
      }));
      props.tab.setModified(false);
    }
  }
  async function confirm() {
    if (!snapshot || !base || busy) return;
    setBusy(true);
    setError("");
    try {
      const committed = await start({
        workspaceId,
        expectedRevision: base.board.revision,
        expectedFingerprint: base.fingerprint,
        requestId: draft.requestId,
        agentId,
        title,
        objective: draft.objective,
        skillVersionIds: snapshot.board.selectedSkillVersionIds,
      });
      publish(committed);
      const id = `session-${draft.requestId}`;
      setDraft((d) => ({ ...d, committedSessionId: id }));
      setNewSession(false);
      setShowBoard(true);
      await send(id);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  async function retry() {
    const id = draft.committedSessionId || sessionHere?.id;
    if (!id || busy) return;
    setBusy(true);
    setError("");
    try {
      await send(id);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  const deliveryState = sessionHere
    ? board?.receipts[`conversation.delivery:${sessionHere.id}`]
    : undefined;
  const workspaceProps: PluginWorkspacePanelProps = {
    ...props,
    context: "workspace",
    params: {},
  };
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: props.theme.colors.surface0 }}
      contentContainerStyle={{
        padding: props.layout.compact ? 12 : 16,
        gap: 12,
      }}
    >
      <View style={{ gap: 6 }}>
        <Label large>
          {form
            ? "Vamos trabalhar nesta conversa"
            : board?.title || "Business Canvas"}
        </Label>
        <Label
          muted
        >{`Destino: projeto ${project.name} · ${agent?.title || "Esta conversa"}`}</Label>
        {form && (
          <Label>
            Defina o negócio e o que quer compreender. A primeira pergunta virá
            neste chat; o quadro cresce com suas confirmações.
          </Label>
        )}
      </View>
      {!!error && (
        <Pane accent>
          <Label>{error}</Label>
          <Btn onPress={() => void boardObservations.refresh(scope)}>
            Atualizar sem perder rascunho
          </Btn>
        </Pane>
      )}
      {!!pollError && (
        <Pane accent>
          <Label>{pollError}</Label>
          <Btn onPress={() => void boardObservations.refresh(scope)}>
            Verificar arquivo novamente
          </Btn>
        </Pane>
      )}
      {!!notice && <Label muted>{notice}</Label>}
      {!!bindingWarning && (
        <Pane accent>
          <Label>{bindingWarning}</Label>
          <Btn onPress={() => setBindingWarning("")}>Entendi</Btn>
        </Pane>
      )}
      {!snapshot && !error && <Label>Verificando o board do projeto…</Label>}
      {snapshot && agent?.archived && (
        <Pane>
          <Label>
            Esta conversa foi arquivada. O board permanece preservado; use uma
            conversa ativa do projeto.
          </Label>
        </Pane>
      )}
      {snapshot && foreign && (
        <Pane accent>
          <Label>Há uma sessão aberta em outra conversa deste projeto.</Label>
          <Label>{session!.objective}</Label>
          <Label muted>
            Revise e encerre explicitamente essa sessão antes de vincular outra
            conversa. Abrir este painel não altera o vínculo.
          </Label>
          {!!props.navigation && (
            <Btn
              primary
              onPress={() =>
                props.navigation?.openAgent({ agentId: session!.agentId })
              }
            >
              Ir para a conversa da sessão
            </Btn>
          )}
          <Btn onPress={() => props.onOpenBoard("workspace", workspaceId)}>
            Revisar sessão no quadro expandido
          </Btn>
        </Pane>
      )}
      {form && snapshot && (
        <Pane accent>
          <Field
            label="Nome do negócio"
            value={title}
            onChange={(title) => change({ title })}
            placeholder="Como você chama este negócio?"
          />
          <Field
            label="Objetivo desta conversa"
            value={draft.objective}
            onChange={(objective) => change({ objective })}
            multiline
            placeholder="O que você precisa compreender ou decidir agora?"
          />
          <Label muted>
            Uma pergunta por vez. Você pode pausar quando quiser.
          </Label>
          <Row>
            <Btn
              selected={showSkills}
              disabled={busy}
              onPress={() => setShowSkills(!showSkills)}
            >
              Selecionar ou importar skills (opcional)
            </Btn>
            <Btn
              disabled={busy}
              onPress={async () => {
                if (
                  !snapshot.board.selectedSkillVersionIds.length ||
                  (await save({ type: "skill.select", versionIds: [] }))
                ) {
                  setShowSkills(false);
                  setNotice(
                    "Sem skills: a conversa usará o contexto que você trouxer.",
                  );
                }
              }}
            >
              Continuar sem skills
            </Btn>
          </Row>
          <Label
            muted
          >{`Skills escolhidas: ${board!.selectedSkillVersionIds.map((id) => board!.skills.find((s) => s.id === id)?.name || id).join(", ") || "nenhuma"}`}</Label>
          {base && base.fingerprint !== snapshot.fingerprint && (
            <>
              <Label>
                O board mudou desde seu rascunho. Nome salvo: {board!.title}.
                Seu texto foi preservado.
              </Label>
              <Btn onPress={() => change({ base: snapshot })}>
                Revisei: usar o estado atual
              </Btn>
            </>
          )}
          {agent && !agent.idle && !agent.archived && (
            <Label>
              Aguarde esta conversa terminar o turno. O rascunho fica aqui;
              nenhum turno será interrompido.
            </Label>
          )}
          <Btn
            primary
            disabled={
              busy ||
              !agent?.idle ||
              agent.archived ||
              !title.trim() ||
              !draft.objective.trim() ||
              !!pollError ||
              base?.fingerprint !== snapshot.fingerprint
            }
            onPress={confirm}
          >
            Iniciar sessão
          </Btn>
          <Label muted>
            Ao confirmar, o nome, o vínculo desta conversa e a sessão são salvos
            juntos no projeto.
          </Label>
        </Pane>
      )}
      {showSkills && form && snapshot && (
        <SkillLibrary
          scope={scope}
          workspaceId={workspaceId}
          snapshot={snapshot}
          busy={busy}
          save={save}
          onSnapshot={(next) => publish(next, true)}
          candidate={null}
          onReviewed={() => {}}
        />
      )}
      {sessionHere && snapshot && (
        <Pane>
          <Label large>
            {sessionHere.status === "closing"
              ? "Encerramento em revisão"
              : "Sua sessão nesta conversa"}
          </Label>
          <Label lines={3}>{sessionHere.objective}</Label>
          {deliveryState !== "sent" && sessionHere.status === "active" && (
            <>
              {busy ? (
                <Label muted>Preparando a primeira pergunta…</Label>
              ) : (
                <>
                  <Label muted>
                    Sessão salva. A primeira pergunta ainda precisa de
                    confirmação de envio.
                  </Label>
                  {(uncertain || deliveryState === "attempted") && (
                    <>
                      <Label>
                        Talvez já tenha sido enviada. Confira o chat para evitar
                        repetir a pergunta.
                      </Label>
                      <Btn
                        selected={retryConfirmed}
                        onPress={() => setRetryConfirmed(!retryConfirmed)}
                      >
                        Conferi o chat: tentar enviar novamente
                      </Btn>
                    </>
                  )}
                  <Btn
                    primary
                    disabled={
                      busy ||
                      !agent?.idle ||
                      ((uncertain || deliveryState === "attempted") &&
                        !retryConfirmed)
                    }
                    onPress={retry}
                  >
                    Enviar primeira pergunta
                  </Btn>
                </>
              )}
            </>
          )}
          {!!props.navigation && (
            <Btn
              primary
              disabled={busy}
              onPress={() => props.navigation?.openAgent({ agentId })}
            >
              Retomar conversa
            </Btn>
          )}
          <Disclosure block label="Ver objetivo e controles da sessão">
            <Label>{sessionHere.objective}</Label>
            <Row>
              {sessionHere.status === "active" && (
                <Btn
                  disabled={busy}
                  onPress={() =>
                    void save({
                      type: "session.grilling",
                      sessionId: sessionHere.id,
                      state:
                        sessionHere.grilling === "running"
                          ? "paused"
                          : "running",
                    })
                  }
                >
                  {sessionHere.grilling === "running"
                    ? "Pausar perguntas"
                    : "Retomar perguntas no próximo turno"}
                </Btn>
              )}
              <Btn onPress={() => props.onOpenBoard("workspace", workspaceId)}>
                Revisar ou encerrar sessão
              </Btn>
            </Row>
            <Label muted>
              Fechar o painel não encerra a sessão nem envia mensagens.
            </Label>
          </Disclosure>
        </Pane>
      )}
      {snapshot && !form && !session && (
        <Pane>
          <Label>O board deste projeto está preservado.</Label>
          <Label muted>
            {board!.whereStopped ||
              "Escolha um objetivo para a próxima conversa quando quiser continuar."}
          </Label>
          <Btn
            primary
            disabled={busy || agent?.archived}
            onPress={() => {
              setDraft({
                requestId: makeId("entry"),
                title: board!.title,
                objective: "",
                base: snapshot,
                committedSessionId: null,
              });
              setNewSession(true);
            }}
          >
            Iniciar nova sessão nesta conversa
          </Btn>
        </Pane>
      )}
      {snapshot && !form && (
        <Row>
          <Btn onPress={() => props.onOpenBoard("workspace", workspaceId)}>
            Expandir quadro
          </Btn>
          <Btn selected={showBoard} onPress={() => setShowBoard(!showBoard)}>
            {showBoard
              ? "Recolher quadro"
              : `Ver áreas (${board!.sections.length})`}
          </Btn>
        </Row>
      )}
      {showBoard && snapshot && !form && (
        <View style={{ minHeight: 300 }}>
          <BoardPanel
            {...workspaceProps}
            embedded
            contextAgentId={agentId}
            surface="explorer"
            onOpenSurface={props.onOpenBoard}
          />
        </View>
      )}
    </ScrollView>
  );
}
