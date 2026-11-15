import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import type { IncomingMessage, ServerResponse } from "node:http";
import { serviceRequest } from "../server/service-client";

export function createMcp(root: string) {
  const server = new McpServer({ name: "business-map", version: "0.5.0" }, { instructions: "Read business_get_context first. Use business_query to inspect confirmed content and business_read_skill for selected immutable skills. Submit only optional pending suggestions with a stable requestId and the captured baseRevision. Human text, focus, status and priorities require viewer confirmation; new accepted map cards start neutral. Caller identity is self-declared provenance. Never claim a suggestion was applied." });
  const readAnnotations = { readOnlyHint: true, idempotentHint: true, destructiveHint: false, openWorldHint: false };
  const proposalAnnotations = { readOnlyHint: false, idempotentHint: true, destructiveHint: false, openWorldHint: false };
  const result = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }] });
  server.registerTool("business_get_context", { description: "Read confirmed map, pending suggestions and revision. External caller identity is self-declared. Only the local service writes.", annotations: readAnnotations, inputSchema: {} }, async () => result(await serviceRequest(root, "/api/context")));
  server.registerTool("business_query", { description: "Query overview, text search, show ID, or a directed relation path.", annotations: readAnnotations, inputSchema: { mode: z.enum(["overview", "find", "show", "path"]).default("overview"), text: z.string().optional(), id: z.string().optional(), fromId: z.string().optional(), toId: z.string().optional() } }, async input => result(await serviceRequest(root, "/api/query", input)));
  server.registerTool("business_submit_suggestion", { description: "Submit pending suggestions only. Cannot edit human content, status, focus or priorities. sourceAgentId is self-declared provenance, not authentication.", annotations: proposalAnnotations, inputSchema: { requestId: z.string().min(1).max(160), sourceAgentId: z.string().min(1).max(160), baseRevision: z.number().int().nonnegative(), suggestion: z.record(z.string(), z.unknown()) } }, async input => result(await serviceRequest(root, "/api/suggestions", input)));
  server.registerTool("business_read_skill", { description: "Read a confirmed immutable skill version and resource; verifies manifest hash.", annotations: readAnnotations, inputSchema: { versionId: z.string(), resource: z.string().default("SKILL.md") } }, async input => result(await serviceRequest(root, `/api/skills/${encodeURIComponent(input.versionId)}?resource=${encodeURIComponent(input.resource)}`)));
  return server;
}
export async function serveStdio(root: string) { const server = createMcp(root); await server.connect(new StdioServerTransport()); return server; }
export async function handleMcp(root: string, req: IncomingMessage, res: ServerResponse, body: unknown) {
  const server = createMcp(root);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.once("close", () => { void transport.close(); void server.close(); });
  await server.connect(transport);
  await transport.handleRequest(req, res, body);
}
