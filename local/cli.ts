#!/usr/bin/env node
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalRoot, hasProjectRegistration, readRuntime } from "./runtime";
import { serviceRequest, serviceRuntime } from "../server/service-client";
import { startService } from "./server";
import { serveStdio } from "./mcp";
import { controlRequest } from "./control";

function option(args: string[], flag: string) { const index = args.indexOf(flag); if (index < 0) return undefined; const value = args[index + 1]; if (!value || value.startsWith("--")) throw new Error(`${flag} needs a value.`); return value; }
async function stdinText() { let value = ""; for await (const chunk of process.stdin) { value += chunk; if (value.length > 5_000_000) throw new Error("Input exceeds 5 MB."); } return value; }
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
export async function ensureService(root: string, options: { projectId?: string; assetsDir?: string } = {}) {
  try { return await serviceRuntime(root); } catch {}
  // The child alone claims the wx owner gate. Concurrent launchers may spawn, but
  // only one service ever becomes a writer. All parents wait for its health.
  const script = fileURLToPath(import.meta.url);
  const loader = script.endsWith(".ts") ? ["--import", "tsx"] : [];
  const child = spawn(process.execPath, [...loader, script, "serve", "--root", root, ...(options.projectId ? ["--project", options.projectId] : []), ...(options.assetsDir ? ["--assets", options.assetsDir] : [])], { detached: true, windowsHide: true, stdio: "ignore", cwd: path.dirname(script) });
  child.unref(); let launchError: Error | undefined; child.once("error", error => { launchError = error; });
  for (let i = 0; i < 100; i++) { if (launchError) throw launchError; try { return await serviceRuntime(root); } catch {} await pause(100); }
  throw new Error("Local service failed to start. Run business serve --root <path> to see the diagnostic; ambiguous owner files require manual recovery.");
}
export async function main(args = process.argv.slice(2)) {
  const verb = args[0] || "help";
  if (verb === "help" || args.includes("--help")) { process.stdout.write("Business Map\n  business open --root PATH [--no-browser]\n  business stop|status|context --root PATH\n  business query overview|find|show|path --root PATH [--text TEXT] [--id ID] [--from ID --to ID]\n  business suggest --root PATH --file proposal.json (or JSON on stdin)\n  business read-skill --root PATH --version ID [--resource SKILL.md]\n  business mcp --root PATH\n  business serve --root PATH (foreground diagnostics)\n"); return; }
  const explicitRoot = option(args, "--root");
  if ((verb === "open" || verb === "init") && !explicitRoot && !await hasProjectRegistration(process.cwd())) throw new Error("First registration requires an explicit business root: business open --root <path>.");
  const root = await canonicalRoot(explicitRoot || process.cwd());
  if (verb === "serve") {
    const service = await startService({ root, projectId: option(args, "--project"), assetsDir: option(args, "--assets") });
    // Do not print runtime credentials, including in diagnostics.
    process.stderr.write(`Business Map service listening at ${service.runtime.url}\n`);
    const stop = () => { void service.stop().then(() => process.exit(0), error => { process.stderr.write(String(error)); process.exit(1); }); };
    process.once("SIGINT", stop); process.once("SIGTERM", stop); return;
  }
  if (verb === "open" || verb === "init") {
    const runtime = await ensureService(root, { projectId: option(args, "--project"), assetsDir: option(args, "--assets") });
    const { code } = await controlRequest(runtime, "open");
    const browserUrl = `${runtime.url}/#code=${code}`;
    if (!args.includes("--no-browser") && verb !== "init") {
      const opener = process.platform === "win32" ? spawn("rundll32.exe", ["url.dll,FileProtocolHandler", browserUrl], { detached: true, windowsHide: true, stdio: "ignore" }) : spawn(process.platform === "darwin" ? "open" : "xdg-open", [browserUrl], { detached: true, stdio: "ignore" });
      opener.on("error", () => {}); opener.unref();
    }
    process.stdout.write(`${browserUrl}\n`); return;
  }
  if (verb === "mcp") { await serviceRuntime(root); await serveStdio(root); return; }
  let value: unknown;
  if (verb === "status") { try { const runtime = await serviceRuntime(root); value = { running: true, root, url: runtime.url, pid: runtime.pid, projectId: runtime.projectId }; } catch { value = { running: false, root, registered: !!await readRuntime(root) }; } }
  else if (verb === "stop") {
    const runtime = await serviceRuntime(root); await controlRequest(runtime, "stop");
    for (let i = 0; i < 100; i++) { const current = await readRuntime(root); if (!current || current.nonce !== runtime.nonce) { value = { stopped: true, root }; break; } await pause(100); }
    if (!value) throw new Error("Service has not completed ordered shutdown.");
  }
  else if (verb === "context") value = await serviceRequest(root, "/api/context");
  else if (verb === "query") value = await serviceRequest(root, "/api/query", { mode: args[1] || "overview", text: option(args, "--text"), id: option(args, "--id"), fromId: option(args, "--from"), toId: option(args, "--to") });
  else if (verb === "suggest") { const file = option(args, "--file"); const input = JSON.parse(file ? await readFile(file, "utf8") : await stdinText()); value = await serviceRequest(root, "/api/suggestions", input); }
  else if (verb === "read-skill") { const version = option(args, "--version"); if (!version) throw new Error("--version is required."); value = await serviceRequest(root, `/api/skills/${encodeURIComponent(version)}?resource=${encodeURIComponent(option(args, "--resource") || "SKILL.md")}`); }
  else throw new Error(`Unknown command: ${verb}`);
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}
const entry = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (entry) void main().catch(error => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
