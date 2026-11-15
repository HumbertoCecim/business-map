import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import { snapshotSchema } from "./rpc";

export const conversationStartFields = {
  requestId: z.string().min(1).max(100),
  agentId: z.string().min(1).max(160),
  title: z.string().trim().min(1).max(500),
  objective: z.string().trim().min(1).max(30000),
  skillVersionIds: z.array(z.string().min(1).max(160)).max(30),
};
export const conversationStartRpc = defineRpc({
  name: "conversation.start",
  input: z.object({
    workspaceId: z.string(),
    expectedRevision: z.number().int().nonnegative(),
    expectedFingerprint: z.string(),
    ...conversationStartFields,
  }),
  output: snapshotSchema,
});
export const conversationDeliverRpc = defineRpc({
  name: "conversation.deliver",
  input: z.object({
    workspaceId: z.string(),
    agentId: z.string(),
    sessionId: z.string(),
    retryConfirmed: z.boolean().optional(),
  }),
  output: z.object({
    snapshot: snapshotSchema,
    status: z.enum(["sent", "already_sent", "waiting", "uncertain"]),
    message: z.string(),
    warning: z.string().optional(),
  }),
});
export function conversationPrompt(session: {
  id: string;
  objective: string;
}): string {
  return `Vamos iniciar uma sessão do Business Canvas.\n\nObjetivo:\n${session.objective}\n\nAntes de responder, consulte o contexto do quadro e as skills ativas. Faça uma pergunta por vez, baseada nesse contexto, e aguarde minha resposta. Posso pausar quando quiser. Preserve minhas palavras, foco e decisões; sugestões ficam para minha revisão.`;
}
