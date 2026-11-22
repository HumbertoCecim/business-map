import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { emptyBoard, boardSchema } from "../../shared/model";
import { startService } from "../../local/server";
import { controlRequest } from "../../local/control";

export const assetsDir = path.dirname(fileURLToPath(import.meta.url));
export async function startCanvasTrial(base: string, options: { port?: number; fake?: boolean; timeoutMs?: number } = {}) {
  const root = path.join(base, "project");
  process.env.BUSINESS_MAP_HOME = path.join(base, "home");
  await mkdir(path.join(root, ".business-board"), { recursive: true });
  const data = JSON.parse(await readFile(path.join(assetsDir, "data.json"), "utf8"));
  const board = emptyBoard("aurora-canvas-trial"); board.title = "Ateliê Aurora";
  board.sections = data.blocks.map((b: any) => ({ id: b.id, title: b.name, questions: b.question,
    cards: data.seed.filter((c: any) => c.block === b.id).map((c: any) => ({ id: c.id, title: c.title, text: c.text, firstStep: c.step, semanticType: c.kind, lane: "later", done: false, urgent: false, important: false })) }));
  const ids = new Set<string>();
  board.relations = data.seed.flatMap((c: any) => c.related.flatMap((toId: string) => {
    const key = [c.id, toId].sort().join(":"); if (ids.has(key)) return []; ids.add(key);
    return [{ id: `link-${ids.size}`, fromId: c.id, toId, label: "Relação a investigar" }];
  }));
  try { await writeFile(path.join(root, ".business-board", "board.json"), JSON.stringify(boardSchema.parse(board), null, 2), { flag: "wx" }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  // Injection is trusted process configuration, never an HTTP option.
  return startService({ root, assetsDir, port: options.port,
    askLimits: { timeoutMs: options.timeoutMs ?? 180_000, maxConcurrent: 1 },
    ...(options.fake ? { resolveAskProvider: async () => ({ executable: process.execPath, prefix: [path.join(assetsDir, "fake-provider.cjs")] }) } : {}) });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const fake = process.argv.includes("--fake");
  const base = path.resolve(assetsDir, "../../.local/canvas-agente", fake ? "fake" : "live");
  const service = await startCanvasTrial(base, { port: fake ? 6816 : 6815, fake });
  const pair = await controlRequest(service.runtime, "open");
  console.log(`${fake ? "SIMULAÇÃO" : "CLI LOCAL — nenhuma chamada até Enviar"}\n${service.runtime.url}/#code=${pair.code}\nLink de uso único, válido por 60 segundos. Ctrl+C encerra apenas este teste.`);
  let stopping = false;
  const stop = async () => { if (stopping) return; stopping = true; await service.stop(); process.exit(0); };
  process.on("SIGINT", () => void stop()); process.on("SIGTERM", () => void stop());
}
