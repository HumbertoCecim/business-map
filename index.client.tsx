import type { PluginClientContext } from "@getpaseo/plugin/client";
import { BoardPanel } from "./client/board";
import { ConversationPanel } from "./client/conversation";
import { startChatPills } from "./client/chat-pills";
import { boardObservations } from "./client/board-observations";

export default function contribute(client: PluginClientContext) {
  const removeConversationPanel = client.addAgentPanel({
    id: "board-conversation",
    title: "Business Canvas",
    icon: "PanelsTopLeft",
    locations: ["explorer"],
    Component: (props) => (
      <ConversationPanel
        {...props}
        onOpenBoard={(location, workspaceId) =>
          client.openPanel(
            location === "workspace" ? "board-main" : "board-side",
            { workspaceId: workspaceId || props.workspaceId, location },
          )
        }
      />
    ),
  });
  const stopPills = startChatPills(client);
  // Preserve already-open 0.1 tabs; all new expansion uses a fresh workspace-only ID.
  client.addWorkspacePanel({
    id: "board",
    title: "Business Harness · aba anterior",
    icon: "PanelsTopLeft",
    context: "workspace",
    locations: ["workspace"],
    Component: (props) => (
      <BoardPanel
        {...props}
        surface="workspace"
        onOpenSurface={(location, workspaceId) =>
          client.openPanel(
            location === "explorer" ? "board-side" : "board-main",
            { workspaceId: workspaceId || props.workspaceId, location },
          )
        }
      />
    ),
  });
  client.addWorkspacePanel({
    id: "board-main",
    title: "Business Harness",
    icon: "PanelsTopLeft",
    context: "workspace",
    locations: ["workspace"],
    Component: (props) => (
      <BoardPanel
        {...props}
        surface="workspace"
        onOpenSurface={(location, workspaceId) =>
          client.openPanel(
            location === "explorer" ? "board-side" : "board-main",
            {
              workspaceId: workspaceId || props.workspaceId,
              location,
            },
          )
        }
      />
    ),
  });
  client.addWorkspacePanel({
    id: "board-side",
    title: "Business Harness",
    icon: "PanelsTopLeft",
    context: "workspace",
    locations: ["explorer"],
    Component: (props) => (
      <BoardPanel
        {...props}
        surface="explorer"
        onOpenSurface={(location, workspaceId) =>
          client.openPanel(
            location === "explorer" ? "board-side" : "board-main",
            {
              workspaceId: workspaceId || props.workspaceId,
              location,
            },
          )
        }
      />
    ),
  });
  client.addCommandCenterItem({
    id: "open-board",
    title: "Abrir Business Harness",
    icon: "PanelsTopLeft",
    context: "workspace",
    onSelect({ openPanel }) {
      openPanel("board-side", { location: "explorer" });
    },
  });
  return () => {
    stopPills();
    removeConversationPanel();
    boardObservations.dispose();
  };
}
