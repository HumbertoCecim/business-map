import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import { skillPreviewSchema } from "./evolution";
import { snapshotSchema } from "./rpc";
const workspace = { workspaceId: z.string() };
const expected = {
  ...workspace,
  expectedRevision: z.number().int(),
  expectedFingerprint: z.string(),
};
const source = {
  sourcePath: z.string().min(1).max(4000),
  sourceUrl: z.string().max(4000).optional(),
};
const derived = {
  parentVersionId: z.string(),
  skillText: z.string().max(2000000),
  rationale: z.string().max(30000),
};
export const skillPreviewRpc = defineRpc({
  name: "skill.preview",
  input: z.object({ ...workspace, ...source }),
  output: skillPreviewSchema,
});
export const skillConfirmRpc = defineRpc({
  name: "skill.confirm",
  input: z.object({
    ...expected,
    ...source,
    treeHash: z.string(),
    sourceSuggestionId: z.string().optional(),
  }),
  output: snapshotSchema,
});
export const skillDerivePreviewRpc = defineRpc({
  name: "skill.derive.preview",
  input: z.object({ ...workspace, ...derived }),
  output: skillPreviewSchema,
});
export const skillDeriveConfirmRpc = defineRpc({
  name: "skill.derive.confirm",
  input: z.object({
    ...expected,
    ...derived,
    treeHash: z.string(),
    sourceSuggestionId: z.string().optional(),
  }),
  output: snapshotSchema,
});
export const skillReadRpc = defineRpc({
  name: "skill.read",
  input: z.object({
    ...workspace,
    versionId: z.string(),
    resource: z.string(),
  }),
  output: z.object({
    versionId: z.string(),
    resource: z.string(),
    canonicalSkillRoot: z.string(),
    canonicalResourcePath: z.string(),
    encoding: z.enum(["utf8", "base64"]),
    content: z.string(),
    sha256: z.string(),
    files: z.array(
      z.object({
        path: z.string(),
        size: z.number(),
        sha256: z.string(),
        encoding: z.enum(["utf8", "base64"]),
      }),
    ),
  }),
});
export const skillExportRpc = defineRpc({
  name: "skill.export",
  input: z.object({ ...workspace, versionId: z.string() }),
  output: z.object({
    path: z.string(),
    treeHash: z.string(),
    fileCount: z.number(),
  }),
});
