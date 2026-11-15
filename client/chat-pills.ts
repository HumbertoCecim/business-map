import type {
  PluginClientContext,
  PluginButtonRegistration,
} from "@getpaseo/plugin/client";
import { getBoardRpc } from "../shared/rpc";
import { projectScope } from "../shared/project-state";
import { boardObservations } from "./board-observations";

/** Entry-owned directory observation. No agent polling, hidden component or extra socket. */
export function startChatPills(client: PluginClientContext) {
  const abort = new AbortController();
  const agents = new Map<
    string,
    {
      workspaceId: string;
      pill: PluginButtonRegistration;
      projectId?: string;
      resolving: boolean;
    }
  >();
  const projects = new Map<
    string,
    { members: Set<string>; stop: () => void; label: string }
  >();
  const workspaceProjects = new Map<string, Promise<string>>();
  let disposed = false;
  let release: (() => Promise<void>) | undefined;
  let unobserve: (() => void) | undefined;
  let snapshotEpoch = 0;
  let eventEpoch = 0;
  const changed = new Map<string, number>();
  function remove(id: string) {
    const record = agents.get(id);
    if (!record) return;
    record.pill.remove();
    agents.delete(id);
    if (record.projectId) {
      const group = projects.get(record.projectId);
      group?.members.delete(id);
      if (group && !group.members.size) {
        group.stop();
        projects.delete(record.projectId);
      }
    }
  }
  function setLabel(projectId: string, label: string) {
    const group = projects.get(projectId);
    if (!group) return;
    group.label = label;
    for (const id of group.members)
      agents.get(id)?.pill.update({ title: label, label });
  }
  function upsert(agent: {
    id: string;
    workspaceId?: string | null;
    archivedAt?: string | null;
  }) {
    if (disposed) return;
    if (!agent.workspaceId || agent.archivedAt) {
      remove(agent.id);
      return;
    }
    const existing = agents.get(agent.id);
    if (
      existing?.workspaceId === agent.workspaceId &&
      (existing.projectId || existing.resolving)
    )
      return;
    remove(agent.id);
    const workspaceId = agent.workspaceId,
      agentId = agent.id;
    const label = "Business Canvas: verificar";
    const pill = client.addComposerPill({
      id: "business-canvas",
      workspaceId,
      agentId,
      button: {
        title: label,
        label,
        icon: "PanelsTopLeft",
        behavior: {
          kind: "action",
          onPress: () => {
            client.openPanel("board-conversation", {
              workspaceId,
              agentId,
              location: "explorer",
            });
          },
        },
      },
    });
    const record = {
      workspaceId,
      pill,
      projectId: undefined as string | undefined,
      resolving: true,
    };
    agents.set(agentId, record);
    let lookup = workspaceProjects.get(workspaceId);
    if (!lookup) {
      lookup = client.paseo.workspaces
        .ref(workspaceId)
        .refresh()
        .then((w) => {
          if (!w?.projectId)
            throw new Error("Workspace sem projeto registrado.");
          return w.projectId;
        });
      workspaceProjects.set(workspaceId, lookup);
      void lookup.catch(() => workspaceProjects.delete(workspaceId));
    }
    void lookup
      .then((projectId) => {
        if (disposed || agents.get(agentId) !== record) return;
        record.projectId = projectId;
        record.resolving = false;
        let group = projects.get(projectId);
        if (!group) {
          group = { members: new Set([agentId]), stop: () => {}, label };
          projects.set(projectId, group);
          const hostId = client.paseo.agents.ref(agentId).address.serverId;
          group.stop = boardObservations.watch(
            projectScope(hostId, projectId),
            () => {
              const member = [...(projects.get(projectId)?.members || [])]
                .map((id) => agents.get(id))
                .find((current) => current?.projectId === projectId);
              if (!member)
                throw new Error(
                  "Nenhuma conversa ativa disponível neste projeto.",
                );
              return client.rpc(getBoardRpc, {
                workspaceId: member.workspaceId,
              });
            },
            (snapshot) =>
              setLabel(
                projectId,
                snapshot.fingerprint === "missing"
                  ? "Criar Business Canvas"
                  : "Abrir Business Canvas",
              ),
            () => setLabel(projectId, "Business Canvas: verificar"),
            6000,
            1,
          );
        }
        group.members.add(agentId);
        pill.update({ title: group.label, label: group.label });
      })
      .catch(() => {
        record.resolving = false;
        /* Verify label remains visible, never pretend this is a missing board. */
      });
  }
  void (async () => {
    try {
      const result = await client.paseo.agents.list({
        scope: "active",
        includeBackground: false,
        filter: { includeArchived: false },
        page: { limit: 200 },
        subscribe: {},
        signal: abort.signal,
      });
      if (disposed) {
        await result.subscription.release();
        return;
      }
      release = () => result.subscription.release();
      const reconcile = async (snapshot: typeof result) => {
        const epoch = ++snapshotEpoch,
          before = eventEpoch;
        const ids = new Set<string>();
        let page = snapshot;
        const cursors = new Set<string>();
        for (;;) {
          if (disposed || epoch !== snapshotEpoch) return;
          for (const entry of page.entries) {
            ids.add(entry.agent.id);
            if ((changed.get(entry.agent.id) || 0) <= before)
              upsert(entry.agent);
          }
          if (!page.pageInfo.hasMore || !page.pageInfo.nextCursor) break;
          const cursor = page.pageInfo.nextCursor;
          if (cursors.has(cursor))
            throw new Error("Cursor repetido na lista de conversas.");
          cursors.add(cursor);
          page = {
            ...(await client.paseo.agents.list({
              scope: "active",
              includeBackground: false,
              filter: { includeArchived: false },
              page: { limit: 200, cursor },
              signal: abort.signal,
            })),
            subscription: result.subscription,
            subscriptionId: result.subscriptionId,
          };
        }
        for (const id of agents.keys())
          if (!ids.has(id) && (changed.get(id) || 0) <= before) remove(id);
      };
      const onSnapshot = (snapshot: typeof result) =>
        void reconcile(snapshot).catch((e) => {
          if (!disposed) console.warn("Business Canvas: lista incompleta", e);
        });
      unobserve = result.subscription.subscribe({
        snapshot: onSnapshot,
        update(message) {
          if (message.type !== "agent_update" || disposed) return;
          changed.set(
            message.payload.kind === "remove"
              ? message.payload.agentId
              : message.payload.agent.id,
            ++eventEpoch,
          );
          if (message.payload.kind === "remove")
            remove(message.payload.agentId);
          else upsert(message.payload.agent);
        },
        error() {
          for (const record of agents.values())
            record.pill.update({
              title: "Business Canvas: verificar",
              label: "Business Canvas: verificar",
            });
        },
      });
    } catch (e) {
      if (!disposed)
        console.warn(
          "Business Canvas: observação de conversas indisponível",
          e,
        );
    }
  })();
  return () => {
    if (disposed) return;
    disposed = true;
    abort.abort();
    unobserve?.();
    void release?.().catch(() => {});
    for (const id of [...agents.keys()]) remove(id);
    workspaceProjects.clear();
  };
}
