import { useEffect, useState } from "react";
import { useRpc } from "@getpaseo/plugin/client";
import type { RpcOutput } from "@getpaseo/plugin";
import type { Command, Suggestion } from "../shared/model";
import type { SkillPreview, SkillVersion } from "../shared/evolution";
import { getBoardRpc } from "../shared/rpc";
import {
  skillConfirmRpc,
  skillDeriveConfirmRpc,
  skillDerivePreviewRpc,
  skillExportRpc,
  skillPreviewRpc,
  skillReadRpc,
} from "../shared/evolution-rpc";
import { friendlyError } from "../shared/errors";
import { useProjectState } from "./project-state";
import { Btn, Disclosure, Field, Label, Pane, Row } from "./ui";
type Snapshot = RpcOutput<typeof getBoardRpc>;
type Draft = {
  kind: "import" | "derive";
  sourcePath: string;
  sourceUrl: string;
  parentVersionId: string;
  skillText: string;
  rationale: string;
  suggestionId?: string;
  preview: SkillPreview | null;
  base: Snapshot;
};
export function SkillLibrary({
  scope,
  workspaceId,
  snapshot,
  busy,
  save,
  onSnapshot,
  candidate,
  onReviewed,
}: {
  scope: string;
  workspaceId: string;
  snapshot: Snapshot;
  busy: boolean;
  save: (cmd: Command, base?: Snapshot) => Promise<boolean>;
  onSnapshot: (value: Snapshot) => void;
  candidate: Suggestion | null;
  onReviewed: () => void;
}) {
  const previewImport = useRpc(skillPreviewRpc),
    confirmImport = useRpc(skillConfirmRpc),
    previewDerived = useRpc(skillDerivePreviewRpc),
    confirmDerived = useRpc(skillDeriveConfirmRpc),
    read = useRpc(skillReadRpc),
    exportSkill = useRpc(skillExportRpc);
  const board = snapshot.board;
  const [draft, setDraft] = useProjectState<Draft | null>(
    scope,
    "skill.draft",
    null,
  );
  const [selection, setSelection] = useProjectState<{
    ids: string[];
    base: Snapshot;
  } | null>(scope, "skill.selection", null);
  const [view, setView] = useProjectState<{
    versionId: string;
    resource: string;
    content: string;
    encoding: string;
  } | null>(scope, "skill.view", null);
  const [working, setWorking] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  useEffect(() => {
    if (
      !candidate ||
      !["skill_import", "skill_adjustment"].includes(candidate.kind)
    )
      return;
    setDraft({
      kind: candidate.kind === "skill_import" ? "import" : "derive",
      sourcePath: candidate.sourcePath || "",
      sourceUrl: candidate.sourceUrl || "",
      parentVersionId: candidate.skillVersionId || "",
      skillText: candidate.skillText || "",
      rationale: candidate.rationale,
      suggestionId: candidate.id,
      preview: null,
      base: snapshot,
    });
    onReviewed();
  }, [candidate?.id]);
  async function run(fn: () => Promise<void>) {
    setWorking(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setWorking(false);
    }
  }
  async function inspect(version: SkillVersion, resource = "SKILL.md") {
    await run(async () => {
      const result = await read({
        workspaceId,
        versionId: version.id,
        resource,
      });
      setView(result);
    });
  }
  const selected = selection?.ids || board.selectedSkillVersionIds;
  const disabled = busy || working;
  return (
    <>
      <Pane>
        <Label large>Skills completas, sob sua escolha</Label>
        <Label>
          Importe a pasta que contém SKILL.md com referências, scripts e assets.
          A cópia preserva os arquivos; scripts não são executados na
          importação.
        </Label>
        <Label muted>
          Para uma skill externa, peça ao agente que pesquise e baixe a pasta
          completa. A importação usa o mesmo caminho local, com prévia e
          confirmação. Nomes do catálogo ou referências manuais continuam “não
          lido”.
        </Label>
        <Btn
          primary
          disabled={disabled}
          onPress={() =>
            setDraft({
              kind: "import",
              sourcePath: "",
              sourceUrl: "",
              parentVersionId: "",
              skillText: "",
              rationale: "",
              preview: null,
              base: snapshot,
            })
          }
        >
          Importar pasta completa
        </Btn>
      </Pane>
      {!!error && (
        <Pane>
          <Label>{error}</Label>
          <Label muted>
            O rascunho foi preservado. Revise a prévia ou atualize a base antes
            de tentar novamente.
          </Label>
        </Pane>
      )}
      {!!notice && <Label muted>{notice}</Label>}
      {draft && (
        <Pane accent>
          <Label large>
            {draft.kind === "import"
              ? "Prévia de importação"
              : "Ajustar uma cópia completa"}
          </Label>
          {!!draft.suggestionId && (
            <Label muted>
              Candidata do agente. Revise o conteúdo e o motivo antes de
              confirmar.
            </Label>
          )}
          {draft.base.fingerprint !== snapshot.fingerprint && (
            <>
              <Label>
                O board mudou. Compare as versões registradas abaixo; o rascunho
                foi preservado.
              </Label>
              <Btn onPress={() => setDraft({ ...draft, base: snapshot })}>
                Revisei: usar revisão atual na skill
              </Btn>
            </>
          )}
          {draft.kind === "import" ? (
            <>
              <Field
                label="Pasta local completa da skill"
                value={draft.sourcePath}
                onChange={(sourcePath) =>
                  setDraft({ ...draft, sourcePath, preview: null })
                }
                placeholder="C:\\...\\minha-skill"
              />
              <Field
                label="Origem externa (opcional)"
                value={draft.sourceUrl}
                onChange={(sourceUrl) =>
                  setDraft({ ...draft, sourceUrl, preview: null })
                }
              />
            </>
          ) : (
            <>
              <Label
                muted
              >{`Original: ${board.skills.find((v) => v.id === draft.parentVersionId)?.name || "Versão indisponível"}. Os demais arquivos serão preservados byte a byte.`}</Label>
              <Field
                label="SKILL.md completo da versão derivada"
                multiline
                value={draft.skillText}
                onChange={(skillText) =>
                  setDraft({ ...draft, skillText, preview: null })
                }
              />
              <Field
                label="Motivo do ajuste"
                multiline
                value={draft.rationale}
                onChange={(rationale) =>
                  setDraft({ ...draft, rationale, preview: null })
                }
              />
            </>
          )}
          <Btn
            disabled={disabled}
            onPress={() =>
              run(async () => {
                const preview =
                  draft.kind === "import"
                    ? await previewImport({
                        workspaceId,
                        sourcePath: draft.sourcePath,
                        sourceUrl: draft.sourceUrl,
                      })
                    : await previewDerived({
                        workspaceId,
                        parentVersionId: draft.parentVersionId,
                        skillText: draft.skillText,
                        rationale: draft.rationale,
                      });
                setDraft((current) =>
                  current === draft ? { ...draft, preview } : current,
                );
              })
            }
          >
            Gerar prévia verificada
          </Btn>
          {draft.preview && (
            <>
              <Label large>{draft.preview.version.name}</Label>
              <Label>{draft.preview.version.description}</Label>
              <Label
                muted
              >{`${draft.preview.version.files.length} arquivos · ${draft.preview.totalBytes} bytes · versão ${draft.preview.version.treeHash.slice(0, 10)}`}</Label>
              {draft.preview.warnings.map((warning, i) => (
                <Label key={i}>{warning}</Label>
              ))}
              <Disclosure
                block
                label="Ler SKILL.md completo antes de confirmar"
              >
                <Field
                  label="Conteúdo integral da prévia"
                  multiline
                  value={draft.preview.skillText}
                  onChange={() => {}}
                />
              </Disclosure>
              {draft.kind === "derive" && (
                <>
                  <Label muted>{`Motivo: ${draft.rationale}`}</Label>
                  <Field
                    label="Diferenças do SKILL.md"
                    multiline
                    value={draft.preview.version.diff}
                    onChange={() => {}}
                  />
                </>
              )}
              <Disclosure block label="Manifesto de todos os arquivos">
                {draft.preview.version.files.map((f) => (
                  <Label
                    key={f.path}
                    muted
                  >{`${f.path} · ${f.size} bytes · ${f.encoding}\nSHA256 ${f.sha256}`}</Label>
                ))}
              </Disclosure>
              <Btn
                primary
                disabled={disabled}
                onPress={() =>
                  run(async () => {
                    const base = {
                      workspaceId,
                      expectedRevision: draft.base.board.revision,
                      expectedFingerprint: draft.base.fingerprint,
                      treeHash: draft.preview!.version.treeHash,
                      sourceSuggestionId: draft.suggestionId,
                    };
                    const next =
                      draft.kind === "import"
                        ? await confirmImport({
                            ...base,
                            sourcePath: draft.sourcePath,
                            sourceUrl: draft.sourceUrl,
                          })
                        : await confirmDerived({
                            ...base,
                            parentVersionId: draft.parentVersionId,
                            skillText: draft.skillText,
                            rationale: draft.rationale,
                          });
                    onSnapshot(next);
                    setDraft((current) => (current === draft ? null : current));
                    setNotice(
                      "Versão completa registrada. Selecione-a explicitamente para usar na conversa; o original foi preservado.",
                    );
                  })
                }
              >
                {draft.kind === "import"
                  ? "Confirmar importação integral"
                  : "Confirmar versão derivada"}
              </Btn>
            </>
          )}
          <Btn disabled={disabled} onPress={() => setDraft(null)}>
            Fechar rascunho da skill
          </Btn>
        </Pane>
      )}
      <Label large>{`Biblioteca do projeto (${board.skills.length})`}</Label>
      {board.skills.length === 0 && (
        <Label muted>
          Nenhuma skill completa importada. O quadro continua livre, sem
          estrutura imposta.
        </Label>
      )}
      {board.skills.map((version) => (
        <Pane key={version.id}>
          <Row>
            <Label large>{version.name}</Label>
            <Label muted>
              {version.parentVersionId ? "Derivada" : "Original"}
            </Label>
          </Row>
          <Label>{version.description}</Label>
          <Label
            muted
          >{`Versão ${version.treeHash.slice(0, 10)} · ${version.files.length} arquivos${board.selectedSkillVersionIds.includes(version.id) ? " · ativa na conversa" : ""}`}</Label>
          <Row>
            <Btn
              selected={selected.includes(version.id)}
              disabled={disabled}
              onPress={() =>
                setSelection({
                  base: selection?.base || snapshot,
                  ids: selected.includes(version.id)
                    ? selected.filter((id) => id !== version.id)
                    : [
                        ...selected.filter(
                          (id) =>
                            board.skills.find((v) => v.id === id)?.skillId !==
                            version.skillId,
                        ),
                        version.id,
                      ],
                })
              }
            >
              {selected.includes(version.id)
                ? "Selecionada para usar"
                : "Selecionar esta versão"}
            </Btn>
            <Btn disabled={disabled} onPress={() => inspect(version)}>
              Ler conteúdo completo
            </Btn>
          </Row>
          <Disclosure block label="Versão, recursos e ajustes">
            <Label
              muted
            >{`Origem: ${version.sourceUrl || version.sourcePath}\nHash da árvore: ${version.treeHash}\nCriada: ${version.createdAt}\nOriginal: ${version.originalVersionId}\nAnterior: ${version.parentVersionId || "nenhuma"}`}</Label>
            <Label>{`Motivo: ${version.rationale}`}</Label>
            {!!version.diff && (
              <Field
                label="Diferenças registradas"
                multiline
                value={version.diff}
                onChange={() => {}}
              />
            )}
            <Row>
              {version.files.map((f) => (
                <Btn
                  key={f.path}
                  disabled={disabled}
                  onPress={() => inspect(version, f.path)}
                >
                  {f.path}
                </Btn>
              ))}
            </Row>
            <Row>
              <Btn
                disabled={disabled}
                onPress={() =>
                  run(async () => {
                    const content = await read({
                      workspaceId,
                      versionId: version.id,
                      resource: "SKILL.md",
                    });
                    setDraft({
                      kind: "derive",
                      sourcePath: "",
                      sourceUrl: "",
                      parentVersionId: version.id,
                      skillText: content.content,
                      rationale: "",
                      preview: null,
                      base: snapshot,
                    });
                  })
                }
              >
                Criar ajuste desta versão
              </Btn>
              <Btn
                disabled={disabled}
                onPress={() =>
                  run(async () => {
                    const result = await exportSkill({
                      workspaceId,
                      versionId: version.id,
                    });
                    setNotice(
                      `Pasta exportada: ${result.path} (${result.fileCount} arquivos).`,
                    );
                  })
                }
              >
                Exportar pasta completa
              </Btn>
            </Row>
          </Disclosure>
        </Pane>
      ))}
      {selection && (
        <Pane accent>
          <Label>
            Confirme quais versões orientarão os próximos turnos. Uma sessão
            aberta passa a usar essa seleção e preserva suas versões iniciais no
            histórico.
          </Label>
          {selection.base.fingerprint !== snapshot.fingerprint && (
            <Btn onPress={() => setSelection({ ...selection, base: snapshot })}>
              Revisei: atualizar base da seleção
            </Btn>
          )}
          <Label muted>
            {selection.ids
              .map((id) => board.skills.find((v) => v.id === id)?.name || id)
              .join(", ") || "Nenhuma skill selecionada"}
          </Label>
          <Row>
            <Btn
              primary
              disabled={disabled}
              onPress={async () => {
                if (
                  await save(
                    { type: "skill.select", versionIds: selection.ids },
                    selection.base,
                  )
                )
                  setSelection((current) =>
                    current === selection ? null : current,
                  );
              }}
            >
              Confirmar skills ativas
            </Btn>
            <Btn onPress={() => setSelection(null)}>
              Descartar seleção em rascunho
            </Btn>
          </Row>
        </Pane>
      )}
      {view && (
        <Pane>
          <Label large>{view.resource}</Label>
          <Label
            muted
          >{`Versão ${view.versionId.split("@")[1]?.slice(0, 10)} · ${view.encoding === "base64" ? "Binário apresentado em base64" : "Texto integral verificado"}`}</Label>
          <Field
            label="Conteúdo verificado do recurso"
            multiline
            value={view.content}
            onChange={() => {}}
          />
          <Btn onPress={() => setView(null)}>Fechar leitura do recurso</Btn>
        </Pane>
      )}
    </>
  );
}
