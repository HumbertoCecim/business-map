import { readRuntime, type Runtime } from "./service-runtime";
export type Capability = "agent" | "human";
const sessions = new Map<string, { token: string; nonce: string }>();
export async function setHumanSession(root: string, token: string) {
  const runtime = await serviceRuntime(root);
  if (!token || token === runtime.agentToken) throw new Error("Invalid viewer/Paseo capability.");
  sessions.set(runtime.root, { token, nonce: runtime.nonce });
}
export async function pairHumanSession(root: string, code: string) {
  const runtime = await serviceRuntime(root);
  const response = await fetch(`${runtime.url}/api/pair/paseo`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
  const result = await response.json() as { token?: string; error?: string };
  if (!response.ok || !result.token) throw new Error(result.error || "Pairing failed.");
  await setHumanSession(root, result.token);
}
export async function serviceRuntime(root: string): Promise<Runtime> {
  const runtime = await readRuntime(root);
  if (!runtime) throw new Error("No local service. Run business open --root <path>.");
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 1500);
  let response: Response;
  try { response = await fetch(`${runtime.url}/api/health`, { headers: { Authorization: `Bearer ${runtime.agentToken}` }, signal: controller.signal }); }
  finally { clearTimeout(timeout); }
  if (!response.ok) throw new Error("Local service is unavailable or authentication failed.");
  const health = await response.json() as { nonce: string };
  if (health.nonce !== runtime.nonce) throw new Error("Local service identity changed.");
  return runtime;
}
export async function serviceRequest(root: string, endpoint: string, body?: unknown, capability: Capability = "agent", method?: string): Promise<any> {
  const runtime = await serviceRuntime(root);
  const session = sessions.get(runtime.root);
  if (capability === "human" && (!session || session.nonce !== runtime.nonce)) throw new Error("PAIRING_REQUIRED: authorize the Paseo connection in the Business Map browser and enter its one-use pairing code.");
  const response = await fetch(`${runtime.url}${endpoint}`, {
    method: method || (body === undefined ? "GET" : "POST"),
    headers: { Authorization: `Bearer ${capability === "human" ? session!.token : runtime.agentToken}`, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json() as any;
  if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
  return result;
}
/** Optional adapter: reads and pending proposals use its agent capability. */
export const call = (root: string, method: string, route: string, body?: unknown) => {
  const readOnlyExport = route === "/api/export" && (body as { save?: unknown } | undefined)?.save !== true;
  return serviceRequest(root, route, body, method === "GET" || route === "/api/query" || route === "/api/suggestions" || readOnlyExport ? "agent" : "human", method);
};
