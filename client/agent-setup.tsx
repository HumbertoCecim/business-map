import { useState } from "react";
import { usePaseo } from "@getpaseo/plugin/client";
type PaseoApi = ReturnType<typeof usePaseo>;
type PaseoProviderModelsResult = Awaited<ReturnType<PaseoApi["providers"]["listModels"]>>;
type PaseoProviderModesResult = Awaited<ReturnType<PaseoApi["providers"]["listModes"]>>;
import { friendlyError } from "../shared/errors";
import { useProjectState } from "./project-state";
import { Btn, Disclosure, Field, Label, Pane, Row } from "./ui";

export function AgentSetup({
  scope,
  workspaceId,
  disabled,
  onCreated,
}: {
  scope: string;
  workspaceId: string;
  disabled: boolean;
  onCreated: (id: string) => Promise<void>;
}) {
  const paseo = usePaseo();
  const [providers, setProviders] = useState<
    { provider: string; available: boolean; error?: string | null }[]
  >([]);
  const [models, setModels] = useState<
    NonNullable<PaseoProviderModelsResult["models"]>
  >([]);
  const [modes, setModes] = useState<
    NonNullable<PaseoProviderModesResult["modes"]>
  >([]);
  const [provider, setProvider] = useProjectState(scope, "new.provider", "");
  const [model, setModel] = useProjectState(scope, "new.model", "");
  const [mode, setMode] = useProjectState(scope, "new.mode", "");
  const [thinking, setThinking] = useProjectState(scope, "new.thinking", "");
  const [title, setTitle] = useProjectState(
    scope,
    "new.title",
    "Conversa do projeto",
  );
  const [createdId, setCreatedId] = useProjectState<string | null>(
    scope,
    "new.createdId",
    null,
  );
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
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
  async function discover(value: string) {
    setProvider(value);
    setModel("");
    setMode("");
    setThinking("");
    setModels([]);
    setModes([]);
    const workspace = await paseo.workspaces.ref(workspaceId).refresh();
    const [a, b] = await Promise.all([
      paseo.providers.listModels(value, { cwd: workspace?.workspaceDirectory }),
      paseo.providers.listModes(value, { cwd: workspace?.workspaceDirectory }),
    ]);
    setModels(a.models || []);
    setModes(b.modes || []);
    if (a.error || b.error)
      throw new Error([a.error, b.error].filter(Boolean).join(" · "));
  }
  const selected = models.find((m) => m.id === model);
  return (
    <Disclosure block label="Criar agente nativo">
      <Label>
        O Paseo mantém a conversa, o provider e as permissões. A criação só
        acontece no botão de confirmação.
      </Label>
      <Btn
        disabled={working || disabled}
        onPress={() =>
          run(async () => {
            const result = await paseo.providers.listAvailable();
            setProviders(result.providers);
            if (result.error) throw new Error(result.error);
          })
        }
      >
        Consultar providers disponíveis
      </Btn>
      <Row>
        {providers.map((p) => (
          <Btn
            key={p.provider}
            selected={provider === p.provider}
            disabled={!p.available || working || disabled}
            onPress={() => run(() => discover(p.provider))}
          >{`${p.provider}${p.available ? "" : " · indisponível"}`}</Btn>
        ))}
      </Row>
      {!!provider && (
        <>
          <Label muted>{`Provider escolhido: ${provider}`}</Label>
          <Btn disabled={working} onPress={() => run(() => discover(provider))}>
            Atualizar modelos e permissões
          </Btn>
        </>
      )}
      <Field label="Nome do novo agente" value={title} onChange={setTitle} />
      <Label muted>Modelo</Label>
      <Row>
        {models
          .filter((m) => m.isSelectable !== false)
          .map((m) => (
            <Btn
              key={m.id}
              selected={model === m.id}
              onPress={() => {
                setModel(m.id);
                setThinking("");
              }}
            >
              {m.label}
            </Btn>
          ))}
      </Row>
      {!!selected?.thinkingOptions?.length && (
        <>
          <Label muted>Raciocínio (opcional)</Label>
          <Row>
            {selected.thinkingOptions.map((t) => (
              <Btn
                key={t.id}
                selected={thinking === t.id}
                onPress={() => setThinking(t.id)}
              >
                {t.label}
              </Btn>
            ))}
          </Row>
        </>
      )}
      <Label muted>Modo de permissões informado pelo provider</Label>
      {modes.map((m) => (
        <Pane key={m.id}>
          <Btn selected={mode === m.id} onPress={() => setMode(m.id)}>
            {m.label}
          </Btn>
          {!!m.description && <Label muted>{m.description}</Label>}
        </Pane>
      ))}
      {!modes.length && !!provider && (
        <Label muted>
          Consulte as permissões. Se o provider não as informar, crie o agente
          pelo fluxo nativo do Paseo e vincule-o pela lista.
        </Label>
      )}
      {!!error && <Label>{error}</Label>}
      {createdId ? (
        <>
          <Label>
            O agente já foi criado. Retome o vínculo abaixo para evitar criar
            uma cópia.
          </Label>
          <Btn
            disabled={working || disabled}
            onPress={() =>
              run(async () => {
                await onCreated(createdId);
                setCreatedId(null);
              })
            }
          >
            Vincular agente criado
          </Btn>
        </>
      ) : (
        <Btn
          primary
          disabled={
            working || disabled || !provider || !model || !mode || !title.trim()
          }
          onPress={() =>
            run(async () => {
              const agent = await paseo.workspaces
                .ref(workspaceId)
                .agents.create({
                  title,
                  config: {
                    provider: `${provider}/${model}`,
                    modeId: mode,
                    ...(thinking ? { thinkingOptionId: thinking } : {}),
                  },
                });
              setCreatedId(agent.id);
              await onCreated(agent.id);
              setCreatedId(null);
            })
          }
        >
          Confirmar criação e vínculo
        </Btn>
      )}
    </Disclosure>
  );
}
