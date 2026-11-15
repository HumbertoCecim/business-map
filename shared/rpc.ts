import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import { boardSchema, commandSchema } from "./model";
export const snapshotSchema = z.object({
  board: boardSchema,
  fingerprint: z.string(),
  root: z.string(),
  warning: z.string().optional(),
  migrationRequired: z.boolean().optional(),
});
export const getBoardRpc = defineRpc({
  name: "board.get",
  input: z.object({ workspaceId: z.string() }),
  output: snapshotSchema,
});
export const applyCommandRpc = defineRpc({
  name: "board.apply",
  input: z.object({
    workspaceId: z.string(),
    expectedRevision: z.number().int(),
    expectedFingerprint: z.string(),
    command: commandSchema,
  }),
  output: snapshotSchema,
});
export const exportRpc = defineRpc({
  name: "board.export",
  input: z.object({ workspaceId: z.string(), save: z.boolean() }),
  output: z.object({ markdown: z.string(), path: z.string().nullable() }),
});
export const bindRpc = defineRpc({
  name: "board.bind",
  input: z.object({ workspaceId: z.string(), agentId: z.string() }),
  output: z.object({ message: z.string() }),
});
