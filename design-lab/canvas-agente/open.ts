import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { readRuntime } from "../../local/runtime";
import { controlRequest } from "../../local/control";

const base = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.local/canvas-agente", process.argv.includes("--fake") ? "fake" : "live");
process.env.BUSINESS_MAP_HOME = path.join(base, "home");
const runtime = await readRuntime(path.join(base, "project"));
if (!runtime) throw new Error("Teste desligado. Execute npm run canvas:local em outro terminal.");
const pair = await controlRequest(runtime, "open");
const url = `${runtime.url}/#code=${pair.code}`;
console.log(url);
if (process.argv.includes("--open")) {
  const command = process.platform === "win32" ? "rundll32.exe" : process.platform === "darwin" ? "open" : "xdg-open";
  execFile(command, process.platform === "win32" ? ["url.dll,FileProtocolHandler", url] : [url], { windowsHide: true }, error => { if (error) console.error("Abra o link acima no navegador."); });
}
