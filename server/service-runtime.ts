import { createHash, randomBytes } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";
import { chmod, lstat, mkdir, readFile, realpath, rename, unlink, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

/** Agent-readable discovery record. Viewer/Paseo capabilities never persist. */
export type Runtime = { root: string; projectId: string; pid: number; url: string; agentToken: string; nonce: string; controlSocket: string };
export const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export const token = () => randomBytes(32).toString("base64url");
export const runtimeHome = () => process.env.BUSINESS_MAP_HOME || path.join(homedir(), ".business-map");
export async function privateDir(base = runtimeHome()) {
  await mkdir(base, { recursive: true, mode: 0o700 });
  if ((await lstat(base)).isSymbolicLink()) throw new Error("Runtime directory cannot be a symbolic link.");
  await chmod(base, 0o700);
  if (process.platform === "win32") {
    const identity = `${process.env.USERDOMAIN ? `${process.env.USERDOMAIN}\\` : ""}${process.env.USERNAME}`;
    if (!process.env.USERNAME) throw new Error("Cannot establish private runtime ACL.");
    const actual = await promisify(execFile)("whoami.exe", ["/user", "/fo", "csv", "/nh"], { windowsHide: true });
    const sid = /S-1-[0-9-]+/.exec(actual.stdout)?.[0];
    if (!sid) throw new Error("Cannot determine the current process identity for private runtime ACL.");
    // The process may run under a separate agent account; keep both that account
    // and the interactive owner, without retaining broad inherited ACL grants.
    await promisify(execFile)("icacls.exe", [base, "/inheritance:r", "/grant:r", `${identity}:(OI)(CI)F`, `*${sid}:(OI)(CI)F`], { windowsHide: true });
  }
  return base;
}
export async function canonicalRoot(root: string) { return realpath(path.resolve(root)); }
export function rootKey(root: string) { return digest(process.platform === "win32" ? root.toLowerCase() : root).slice(0, 32); }
async function gitCommon(root: string) {
  try {
    const run = promisify(execFile);
    const top = await run("git", ["rev-parse", "--show-toplevel"], { cwd: root, windowsHide: true });
    if (rootKey(await realpath(top.stdout.trim())) !== rootKey(root)) return null;
    const common = await run("git", ["rev-parse", "--git-common-dir"], { cwd: root, windowsHide: true });
    return realpath(path.resolve(root, common.stdout.trim()));
  } catch { return null; }
}
async function gitRegistry(root: string) { const common = await gitCommon(root); return common ? path.join(runtimeHome(), `git-${rootKey(common)}.json`) : null; }
const aliases = new Map<string, string>();
export async function registeredRoot(root: string) {
  root = await canonicalRoot(root);
  const cacheKey = `${runtimeHome()}:${rootKey(root)}`;
  const cached = aliases.get(cacheKey); if (cached) return canonicalRoot(cached);
  try {
    const direct = JSON.parse(await readFile(path.join(runtimeHome(), `project-${rootKey(root)}.json`), "utf8"));
    if (direct.root !== root) throw new Error("Invalid canonical project registry.");
    return root;
  } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
  const registry = await gitRegistry(root);
  if (!registry) return root;
  try { const record = JSON.parse(await readFile(registry, "utf8")); if (typeof record.root !== "string") throw new Error("Invalid project registry."); const target = await canonicalRoot(record.root); aliases.set(cacheKey, target); return target; }
  catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return root; throw e; }
}
export async function runtimePath(root: string) { return path.join(runtimeHome(), `runtime-${rootKey(await registeredRoot(root))}.json`); }
export async function hasProjectRegistration(root: string) {
  const canonical = await registeredRoot(root);
  try { const record = JSON.parse(await readFile(path.join(runtimeHome(), `project-${rootKey(canonical)}.json`), "utf8")); return record.root === canonical && typeof record.projectId === "string"; }
  catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return false; throw e; }
}
export async function readRuntime(root: string): Promise<Runtime | null> {
  try {
    const file = await runtimePath(root);
    if ((await lstat(file)).isSymbolicLink()) throw new Error("Runtime record cannot be a link.");
    const runtime = JSON.parse(await readFile(file, "utf8")) as Runtime;
    if (runtime.root !== await registeredRoot(root) || !/^http:\/\/127\.0\.0\.1:\d+$/.test(runtime.url) || !runtime.agentToken || !runtime.controlSocket || !runtime.nonce) throw new Error("Invalid runtime record.");
    const { root: canonical, projectId, pid, url, agentToken, nonce, controlSocket } = runtime;
    return { root: canonical, projectId, pid, url, agentToken, nonce, controlSocket };
  } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return null; throw e; }
}
export async function writeRuntime(runtime: Runtime) {
  await privateDir();
  const file = await runtimePath(runtime.root), temp = `${file}.${token()}.tmp`;
  const { root, projectId, pid, url, agentToken, nonce, controlSocket } = runtime;
  await writeFile(temp, JSON.stringify({ root, projectId, pid, url, agentToken, nonce, controlSocket }), { flag: "wx", mode: 0o600 });
  await rename(temp, file);
}
export async function removeRuntime(runtime: Runtime) {
  const current = await readRuntime(runtime.root);
  if (current?.nonce === runtime.nonce) await unlink(await runtimePath(runtime.root));
}
export async function registerProject(root: string, requestedId?: string) {
  if (requestedId && !/^[a-zA-Z0-9_.-]{1,160}$/.test(requestedId)) throw new Error("Invalid project ID.");
  root = await canonicalRoot(root);
  await privateDir();
  const registry = await gitRegistry(root);
  if (registry) {
    let first = { root, projectId: requestedId || `project-${rootKey(root)}` };
    const common = await gitCommon(root);
    if (common && path.basename(common).toLowerCase() === ".git") {
      // A project can be registered before git init. Honor that explicit main
      // project record when its first additional worktree is opened later.
      const main = path.dirname(common);
      try { const existing = JSON.parse(await readFile(path.join(runtimeHome(), `project-${rootKey(main)}.json`), "utf8")); if (existing.root === main) first = existing; }
      catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
    }
    let selected = first;
    try { await writeFile(registry, JSON.stringify(first), { flag: "wx", mode: 0o600 }); }
    catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      selected = JSON.parse(await readFile(registry, "utf8")) as typeof first;
    }
    if (requestedId && selected.projectId !== requestedId) throw new Error("Git worktrees are already registered with another identity.");
    root = await canonicalRoot(selected.root); requestedId = selected.projectId;
  }
  const projectId = requestedId || `project-${rootKey(root)}`;
  if (!/^[a-zA-Z0-9_.-]{1,160}$/.test(projectId)) throw new Error("Invalid project ID.");
  // One immutable record per canonical root avoids registry read/modify/write races.
  const file = path.join(await privateDir(), `project-${rootKey(root)}.json`);
  const record = { projectId, root };
  try { await writeFile(file, JSON.stringify(record), { flag: "wx", mode: 0o600 }); return record; }
  catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    const existing = JSON.parse(await readFile(file, "utf8")) as typeof record;
    if (existing.root !== root || (requestedId && requestedId !== existing.projectId)) throw new Error("Canonical root is already registered with another identity.");
    return existing;
  }
}
