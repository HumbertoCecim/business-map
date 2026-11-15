import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import { lstat, readFile, writeFile, unlink } from "node:fs/promises";

export type Owner = { pid: number; host: string; nonce: string };
export async function readOwner(file: string): Promise<Owner | null> {
  try {
    if (!(await lstat(file)).isFile()) throw new Error("Ownership path is not a regular file.");
    const value = JSON.parse(await readFile(file, "utf8")) as Owner;
    if (!Number.isInteger(value.pid) || value.pid < 1 || typeof value.host !== "string" || !value.nonce) throw new Error("Ambiguous owner record; manual recovery required.");
    return value;
  } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return null; throw e; }
}
export function demonstrablyDead(owner: Owner): boolean {
  if (owner.host !== hostname()) return false;
  try { process.kill(owner.pid, 0); return false; }
  catch (e) { return (e as NodeJS.ErrnoException).code === "ESRCH"; }
}
export async function claimOwner(file: string): Promise<{ owner: Owner; release: () => Promise<void> }> {
  const owner = { pid: process.pid, host: hostname(), nonce: randomUUID() };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await writeFile(file, JSON.stringify(owner), { flag: "wx", mode: 0o600 });
      return { owner, release: async () => { const current = await readOwner(file); if (current?.nonce === owner.nonce) await unlink(file); } };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      const recovery = `${file}.recovery`;
      try { await writeFile(recovery, owner.nonce, { flag: "wx", mode: 0o600 }); }
      catch { throw new Error("OWNER_BUSY: ownership recovery is already running or ambiguous."); }
      try {
        const prior = await readOwner(file);
        if (!prior || !demonstrablyDead(prior)) throw new Error("OWNER_BUSY: another service/writer owns this board, or ownership is ambiguous.");
        // Never take ownership on an elapsed-time heuristic.
        const again = await readOwner(file);
        if (again?.nonce !== prior.nonce) throw new Error("OWNER_BUSY: owner changed during recovery.");
        await unlink(file);
      } finally { await unlink(recovery); }
    }
  }
  throw new Error("OWNER_BUSY: ownership claim raced.");
}
