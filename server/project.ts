import type { PluginHandlerContext } from "@getpaseo/plugin/server";
type PaseoApi = PluginHandlerContext["paseo"];
import type { Location } from "./store";

/** Resolve through the registered project, never the checkout/worktree cwd. */
export async function resolveProject(
  paseo: PaseoApi,
  workspaceId: string,
): Promise<Location> {
  const workspace = await paseo.workspaces.ref(workspaceId).refresh();
  if (!workspace?.projectId)
    throw new Error(
      "Workspace sem projeto registrado. Abra/registre o projeto no Paseo e tente novamente.",
    );
  const result = await paseo.projects.list();
  const project = result.projects.find(
    (p) => p.projectId === workspace.projectId,
  );
  if (!project?.projectRootPath)
    throw new Error(
      "Raiz registrada do projeto indisponível. Reabra o projeto no Paseo e recarregue.",
    );
  return { projectId: project.projectId, root: project.projectRootPath };
}
export async function assertAgentProject(
  paseo: PaseoApi,
  location: Location,
  agentId: string,
) {
  const agent = paseo.agents.ref(agentId);
  const result = await agent.refresh();
  if (!result?.agent.workspaceId || result.agent.archivedAt)
    throw new Error("Agente indisponível ou arquivado.");
  const agentLocation = await resolveProject(paseo, result.agent.workspaceId);
  if (agentLocation.projectId !== location.projectId)
    throw new Error("Escolha um agente existente deste projeto.");
  return agent;
}
