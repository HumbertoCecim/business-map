import { createConnection, createServer, type Server, type Socket } from "node:net";
import { chmod } from "node:fs/promises";
import path from "node:path";
import { runtimeHome, rootKey, type Runtime } from "./runtime";

export const controlSocketPath = (root: string, nonce: string) => process.platform === "win32"
  ? `\\\\.\\pipe\\business-map-${rootKey(root)}-${nonce}`
  : path.join(runtimeHome(), `control-${rootKey(root).slice(0, 12)}-${nonce.slice(0, 12)}.sock`);
export async function startControl(runtime: Runtime, handle: (action: "open" | "stop") => unknown | Promise<unknown>) {
  const sockets = new Set<Socket>();
  const server = createServer(socket => {
    sockets.add(socket); socket.setTimeout(5000, () => socket.destroy()); socket.once("close", () => sockets.delete(socket));
    let text = "", handled = false;
    socket.on("error", () => {});
    socket.on("data", data => {
      if (handled) return;
      text += data.toString("utf8"); if (text.length > 4096) { socket.destroy(); return; }
      if (!text.includes("\n")) return; handled = true;
      void (async () => {
        const input = JSON.parse(text.split("\n")[0]);
        if (input.root !== runtime.root || input.nonce !== runtime.nonce || !["open", "stop"].includes(input.action)) throw new Error("Control identity mismatch.");
        socket.end(`${JSON.stringify(await handle(input.action))}\n`);
      })().catch(error => socket.end(`${JSON.stringify({ error: error instanceof Error ? error.message : String(error) })}\n`));
    });
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(runtime.controlSocket, resolve); });
  if (process.platform !== "win32") await chmod(runtime.controlSocket, 0o600);
  return { close: async () => { for (const socket of sockets) socket.destroy(); await new Promise<void>(resolve => server.close(() => resolve())); } };
}
/** Explicit local control channel. Never called by agent HTTP/MCP operations. */
export function controlRequest(runtime: Runtime, action: "open" | "stop"): Promise<any> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(runtime.controlSocket), timeout = setTimeout(() => { socket.destroy(); reject(new Error("Local control channel timed out.")); }, 5000);
    let text = "";
    socket.once("connect", () => socket.write(`${JSON.stringify({ root: runtime.root, nonce: runtime.nonce, action })}\n`));
    socket.on("data", data => { text += data.toString("utf8"); if (text.length > 4096) socket.destroy(new Error("Invalid control response.")); });
    socket.once("error", error => { clearTimeout(timeout); reject(error); });
    socket.once("end", () => { clearTimeout(timeout); try { const result = JSON.parse(text); if (result.error) reject(new Error(result.error)); else resolve(result); } catch (error) { reject(error); } });
  });
}
