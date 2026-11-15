import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

/** Pairing credentials stay in the daemon process; the client receives no token. */
export const pairServiceRpc = defineRpc({
  name: "service.pair",
  input: z.object({ workspaceId: z.string(), code: z.string().trim().min(1).max(160) }),
  output: z.object({ connected: z.literal(true), message: z.string() }),
});
