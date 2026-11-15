import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  writeFile,
  mkdir,
  rm,
  symlink,
  unlink,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { BoardStore, type Snapshot } from "../store";
import { resolveProject } from "../project";
import type { PaseoApi } from "@getpaseo/client";
async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const root = await mkdtemp(path.join(os.tmpdir(), "business-harness-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new BoardStore();
  const loc = { root, projectId: "p" };
  return { root, store, loc };
}
test("serialized concurrent writes reject stale revision", async (t) => {
  const { store, loc } = await fixture(t);
  const s = await store.get(loc);
  const args = [loc, s.board.revision, s.fingerprint] as const;
  const result = await Promise.allSettled([
    store.apply(...args, { type: "title", title: "A" }),
    store.apply(...args, { type: "title", title: "B" }),
  ]);
  assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await store.get(loc)).board.revision, 1);
});
test("same-revision external edit detected by fingerprint", async (t) => {
  const { store, loc, root } = await fixture(t);
  let s = await store.get(loc);
  s = await store.apply(loc, 0, s.fingerprint, { type: "title", title: "A" });
  await writeFile(
    path.join(root, ".business-board", "board.json"),
    JSON.stringify({ ...s.board, title: "External" }),
  );
  await assert.rejects(
    store.apply(loc, s.board.revision, s.fingerprint, {
      type: "title",
      title: "B",
    }),
    /CONFLICT/,
  );
  assert.equal((await store.get(loc)).board.title, "External");
});
test("corruption preserves malformed file and valid last backup", async (t) => {
  const { store, loc, root } = await fixture(t);
  let s = await store.get(loc);
  s = await store.apply(loc, 0, s.fingerprint, { type: "title", title: "A" });
  await store.apply(loc, 1, s.fingerprint, { type: "title", title: "B" });
  const file = path.join(root, ".business-board", "board.json");
  await writeFile(file, "{bad");
  await assert.rejects(store.get(loc), /Backup válido/);
  assert.equal(await readFile(file, "utf8"), "{bad");
  const backup = JSON.parse(
    await readFile(
      path.join(root, ".business-board", "board.backup.json"),
      "utf8",
    ),
  );
  assert.equal(backup.title, "A");
});
test("idempotency survives new store and rejects key reuse", async (t) => {
  const { store, loc } = await fixture(t);
  const s = await store.get(loc);
  const receipt = { id: "agent:r", value: "payload" };
  const first = await store.apply(
    loc,
    0,
    s.fingerprint,
    { type: "title", title: "Once" },
    receipt,
  );
  const second = await new BoardStore().apply(
    loc,
    0,
    "old",
    { type: "title", title: "Twice" },
    receipt,
  );
  assert.deepEqual(first.board, second.board);
  await assert.rejects(
    store.apply(
      loc,
      1,
      first.fingerprint,
      { type: "title", title: "Again" },
      { ...receipt, value: "different" },
    ),
    /requestId/,
  );
});
test("empty identity remains stable and board is portable", async (t) => {
  const { store, loc } = await fixture(t);
  const a = await store.get(loc);
  const b = await store.get(loc);
  assert.equal(a.board.boardId, b.board.boardId);
  await store.apply(loc, 0, a.fingerprint, {
    type: "title",
    title: "Portable",
  });
  assert.equal(
    (await new BoardStore().get({ ...loc, projectId: "another-registration" }))
      .board.boardId,
    a.board.boardId,
  );
});
test("projects remain isolated and snapshots export safely", async (t) => {
  const { store, loc, root } = await fixture(t);
  const other = path.join(root, "other");
  await mkdir(other);
  const a = await store.get(loc);
  await store.apply(loc, 0, a.fingerprint, { type: "title", title: "Only A" });
  assert.equal(
    (await store.get({ root: other, projectId: "b" })).board.revision,
    0,
  );
  const result = await store.export(loc, true);
  assert.equal(result.path, path.join(root, ".business-board", "board.md"));
  assert.match(result.markdown, /Only A/);
});
test("symlink board directory rejected", async (t) => {
  const { store, loc, root } = await fixture(t);
  const outside = path.join(root, "outside");
  await mkdir(outside);
  try {
    await symlink(
      outside,
      path.join(root, ".business-board"),
      process.platform === "win32" ? "junction" : "dir",
    );
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EPERM") {
      t.skip("Host does not allow symlinks");
      return;
    }
    throw e;
  }
  await assert.rejects(store.get(loc), /links simbólicos/);
});
test("missing canonical file is reported rather than silently recreating it", async (t) => {
  const { store, loc, root } = await fixture(t);
  const initial = await store.get(loc);
  const saved = await store.apply(loc, 0, initial.fingerprint, {
    type: "title",
    title: "Valid",
  });
  await unlink(path.join(root, ".business-board", "board.json"));
  await assert.rejects(store.get(loc), /desapareceu/);
  await assert.rejects(
    store.apply(loc, saved.board.revision, saved.fingerprint, {
      type: "title",
      title: "Overwrite",
    }),
    /desapareceu/,
  );
});

test("SDK resolver maps worktrees to registered project root and fails closed", async () => {
  const api = {
    workspaces: {
      ref: (id: string) => ({
        refresh: async () =>
          id === "missing"
            ? null
            : {
                projectId: "p",
                workspaceDirectory: id === "worktree" ? "/worktree" : "/repo",
              },
      }),
    },
    projects: {
      list: async () => ({
        projects: [{ projectId: "p", projectRootPath: "/repo" }],
      }),
    },
  } as unknown as PaseoApi;
  assert.deepEqual(
    await resolveProject(api, "worktree"),
    await resolveProject(api, "main"),
  );
  await assert.rejects(resolveProject(api, "missing"), /projeto registrado/);
});
