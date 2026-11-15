import { usePaseo } from "@getpaseo/plugin/client";
import type { RpcOutput } from "@getpaseo/plugin";
import { useEffect, useState } from "react";
import { getBoardRpc, bindRpc } from "../shared/rpc";
import { useRpc } from "@getpaseo/plugin/client";
import { makeId, type Command, type Suggestion } from "../shared/model";
import { useProjectState } from "./project-state";
import { Btn, Disclosure, Field, Label, Pane, Row } from "./ui";
import { friendlyError } from "../shared/errors";
type Snapshot = RpcOutput<typeof getBoardRpc>;
type Closing = {
  sessionId: string;
  summary: string;
  whereStopped: string;
  decisions: {
    checked: boolean;
    text: string;
    rationale: string;
    targetKind: "board" | "section" | "card";
    targetId: string;
  }[];
  suggestionId?: string;
  base: Snapshot;
};
export function Sessions({
  scope,
  workspaceId,
  snapshot,
  busy,
  save,
  onOpen,
  candidate,
  onReviewed,
  allowAgentActions = true,
}: {
  scope: string;
  workspaceId: string;
  snapshot: Snapshot;
  busy: boolean;
  save: (cmd: Command, base?: Snapshot) => Promise<boolean>;
  onOpen: () => void;
  candidate: Suggestion | null;
  onReviewed: () => void;
  allowAgentActions?: boolean;
}) {
  const paseo = usePaseo();
  const bind = useRpc(bindRpc);
  const board = snapshot.board;
  const session = board.sessions.find((s) => s.id === board.currentSessionId);
  const [objective, setObjective] = useProjectState(
    scope,
    "session.objective",
    "",
  );
  const [grilling, setGrilling] = useProjectState(
    scope,
    "session.grilling",
    false,
  );
  const [closing, setClosing] = useProjectState<Closing | null>(
    scope,
    "session.closing",
    null,
  );
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  useEffect(() => {
    if (candidate?.kind !== "session_summary") return;
    const id = candidate.sessionId || board.currentSessionId;
    if (!id) return;
    setClosing({
      sessionId: id,
      summary: candidate.text,
      whereStopped: candidate.whereStopped ?? board.whereStopped,
      decisions: (candidate.decisions || []).map((d) => ({
        ...d,
        checked: true,
      })),
      suggestionId: candidate.id,
      base: snapshot,
    });
    onReviewed();
  }, [candidate?.id]);
  async function send(prompt: string) {
    if (!allowAgentActions) {
      setError(
        "Abra a conversa vinculada para pedir ações ao agente. A revisão manual continua disponível aqui.",
      );
      return;
    }
    if (!board.agent.id) return;
    setSending(true);
    setError("");
    try {
      const agent = paseo.agents.ref(board.agent.id);
      await agent.refresh();
      if (agent.status !== "idle" || agent.activeTurn)
        throw new Error(
          "Aguarde o agente ficar ocioso. Para interromper o turno em curso, use Parar na conversa nativa.",
        );
      await bind({ workspaceId, agentId: board.agent.id });
      await agent.send(
        `Business Harness: leia business_get_context e as versões completas das skills ativas com business_read_skill antes de responder. Não leia cópias do board em worktrees. ${prompt} Preserve texto humano, decisões e foco; envie candidatas via business_submit_suggestion para revisão. Nenhuma alteração é automática.`,
      );
      onOpen();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setSending(false);
    }
  }
  const disabled = busy || sending;
  return (
    <>
      <Pane>
        <Label large>
          {session ? "Esta conversa tem um fio" : "Começar uma sessão"}
        </Label>
        {session ? (
          <>
            <Label>{session.objective}</Label>
            <Label
              muted
            >{`${session.status === "closing" ? "Encerramento em revisão" : "Em andamento"} · ${session.grilling === "running" ? "Uma pergunta por vez" : session.grilling === "paused" ? "Perguntas pausadas" : "Conversa livre"}`}</Label>
            <Label
              muted
            >{`Skills ativas: ${session.skillVersionIds.map((id) => board.skills.find((s) => s.id === id)?.name || id).join(", ") || "nenhuma"}. A seleção explícita na biblioteca atualiza esta sessão.`}</Label>
            <Row>
              <Btn primary disabled={disabled} onPress={onOpen}>
                Retomar conversa
              </Btn>
              <Btn
                disabled={
                  disabled || !allowAgentActions || session.status !== "active"
                }
                onPress={async () => {
                  const state =
                    session.grilling === "running" ? "paused" : "running";
                  if (
                    (await save({
                      type: "session.grilling",
                      sessionId: session.id,
                      state,
                    })) &&
                    state === "running"
                  )
                    await send(
                      "Continue a sessão com UMA pergunta por vez, baseada no conteúdo confirmado e nas skills. Aguarde minha resposta antes de outra pergunta. Eu posso pausar a qualquer momento.",
                    );
                }}
              >
                {session.grilling === "running"
                  ? "Pausar perguntas"
                  : "Uma pergunta por vez"}
              </Btn>
            </Row>
            <Label muted>
              Pausar muda a orientação da próxima resposta. Para parar a geração
              atual, use Parar no chat do Paseo.
            </Label>
            <Disclosure block label="Encerrar esta sessão">
              <Label>
                Peça um resumo candidato ou escreva seu encerramento. Revise
                onde retomar e cada decisão antes de confirmar.
              </Label>
              <Btn
                disabled={disabled || !allowAgentActions}
                onPress={async () => {
                  if (
                    await save({
                      type: "session.closing",
                      sessionId: session.id,
                    })
                  )
                    await send(
                      `Estou encerrando explicitamente a sessão ${session.id}. Não faça novas perguntas. Proponha business_submit_suggestion kind=session_summary, sessionId=${session.id}, text=resumo, whereStopped=onde retomar e decisions=[{text,rationale,targetKind,targetId}]. Não confirme nada por mim.`,
                    );
                }}
              >
                Pedir resumo candidato no chat
              </Btn>
              <Btn
                disabled={disabled}
                onPress={() =>
                  setClosing({
                    sessionId: session.id,
                    summary: "",
                    whereStopped: board.whereStopped,
                    decisions: [],
                    base: snapshot,
                  })
                }
              >
                Escrever encerramento manual
              </Btn>
            </Disclosure>
          </>
        ) : (
          <>
            <Field
              label="Objetivo desta conversa"
              multiline
              value={objective}
              onChange={setObjective}
              placeholder="O que você precisa compreender ou decidir?"
            />
            <Btn selected={grilling} onPress={() => setGrilling(!grilling)}>
              Uma pergunta por vez, baseada no meu contexto
            </Btn>
            <Label muted>
              Use a conversa nativa para responder. Fechar o painel ou o app
              preserva a sessão e não chama o modelo.
            </Label>
            <Btn
              primary
              disabled={
                disabled ||
                !allowAgentActions ||
                !board.agent.id ||
                !objective.trim()
              }
              onPress={async () => {
                const id = makeId("session");
                if (
                  await save({
                    type: "session.start",
                    session: {
                      id,
                      objective,
                      agentId: board.agent.id!,
                      skillVersionIds: board.selectedSkillVersionIds,
                      startedAt: new Date().toISOString(),
                      closedAt: null,
                      status: "active",
                      grilling: grilling ? "running" : "off",
                      summary: "",
                      summarySuggestionId: null,
                    },
                  })
                )
                  await send(
                    `Inicie a sessão ${id}. Objetivo: ${objective}. ${grilling ? "Faça UMA pergunta inicial pertinente ao conteúdo e às skills; aguarde minha resposta." : "Ajude-me com esse objetivo. Comece pelo contexto confirmado, sem impor um framework."}`,
                  );
              }}
            >
              Iniciar sessão e abrir conversa
            </Btn>
            {!board.agent.id && (
              <Label muted>
                Escolha ou crie o agente na aba Agente antes de iniciar.
              </Label>
            )}
          </>
        )}
        {!!error && <Label>{error}</Label>}
      </Pane>
      {closing && (
        <Pane accent>
          <Label large>Revisar encerramento</Label>
          <Label muted>
            Resumo e decisões são candidatos até sua confirmação.
          </Label>
          {closing.base.fingerprint !== snapshot.fingerprint && (
            <>
              <Label>
                O board mudou; seu rascunho foi preservado. Compare onde parei
                salvo: {board.whereStopped || "vazio"}.
              </Label>
              <Btn onPress={() => setClosing({ ...closing, base: snapshot })}>
                Revisei: usar revisão atual no encerramento
              </Btn>
            </>
          )}
          <Field
            label="Resumo revisado por você"
            multiline
            value={closing.summary}
            onChange={(v) => setClosing({ ...closing, summary: v })}
          />
          <Field
            label="Onde retomar após a sessão"
            multiline
            value={closing.whereStopped}
            onChange={(v) => setClosing({ ...closing, whereStopped: v })}
          />
          {closing.decisions.map((d, i) => (
            <Pane key={i}>
              <Btn
                selected={d.checked}
                onPress={() =>
                  setClosing({
                    ...closing,
                    decisions: closing.decisions.map((v, j) =>
                      j === i ? { ...v, checked: !v.checked } : v,
                    ),
                  })
                }
              >
                Incluir decisão confirmada
              </Btn>
              <Field
                label={`Decisão ${i + 1}`}
                multiline
                value={d.text}
                onChange={(v) =>
                  setClosing({
                    ...closing,
                    decisions: closing.decisions.map((x, j) =>
                      j === i ? { ...x, text: v } : x,
                    ),
                  })
                }
              />
              <Field
                label={`Justificativa ${i + 1}`}
                multiline
                value={d.rationale}
                onChange={(v) =>
                  setClosing({
                    ...closing,
                    decisions: closing.decisions.map((x, j) =>
                      j === i ? { ...x, rationale: v } : x,
                    ),
                  })
                }
              />
              <Label
                muted
              >{`Destino: ${d.targetKind === "board" ? board.title : board.sections.find((s) => s.id === d.targetId)?.title || board.sections.flatMap((s) => s.cards).find((c) => c.id === d.targetId)?.title || "Destino removido; desmarque a decisão"}`}</Label>
            </Pane>
          ))}
          <Btn
            onPress={() =>
              setClosing({
                ...closing,
                decisions: [
                  ...closing.decisions,
                  {
                    checked: true,
                    text: "",
                    rationale: "",
                    targetKind: "board",
                    targetId: board.boardId,
                  },
                ],
              })
            }
          >
            Adicionar decisão ao encerramento
          </Btn>
          <Row>
            <Btn
              primary
              disabled={disabled}
              onPress={async () => {
                if (
                  await save(
                    {
                      type: "session.confirm",
                      sessionId: closing.sessionId,
                      closedAt: new Date().toISOString(),
                      summary: closing.summary,
                      whereStopped: closing.whereStopped,
                      decisions: closing.decisions
                        .filter((d) => d.checked)
                        .map((d) => ({
                          id: makeId("memory"),
                          kind: "decision",
                          text: d.text,
                          rationale: d.rationale,
                          target: { kind: d.targetKind, id: d.targetId },
                          createdAt: new Date().toISOString(),
                          sourceSuggestionId: closing.suggestionId || null,
                        })),
                      suggestionId: closing.suggestionId,
                    },
                    closing.base,
                  )
                )
                  setClosing((current) =>
                    current === closing ? null : current,
                  );
              }}
            >
              Confirmar resumo e encerrar
            </Btn>
            <Btn disabled={disabled} onPress={() => setClosing(null)}>
              Fechar rascunho do resumo
            </Btn>
          </Row>
        </Pane>
      )}
      <Disclosure
        block
        label={`Histórico de sessões (${board.sessions.length})`}
      >
        {[...board.sessions].reverse().map((s) => (
          <Pane key={s.id}>
            <Label>{s.objective}</Label>
            <Label
              muted
            >{`${s.status === "closed" ? "Encerrada" : "Aberta"} · ${s.startedAt} · agente ${s.agentId.slice(0, 8)}`}</Label>
            <Label>{s.summary || "Ainda sem resumo confirmado."}</Label>
            <Disclosure block label="Versões da sessão">
              <Label
                muted
              >{`Iniciais: ${(s.initialSkillVersionIds || s.skillVersionIds).join("\n") || "nenhuma"}\nAtivas: ${s.skillVersionIds.join("\n") || "nenhuma"}`}</Label>
            </Disclosure>
          </Pane>
        ))}
      </Disclosure>
    </>
  );
}
