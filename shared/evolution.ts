import { z } from "zod";

const id = z.string().min(1).max(160);
export const skillFileSchema = z.object({
  path: z.string().min(1).max(1000),
  size: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  encoding: z.enum(["utf8", "base64"]),
});
export const skillVersionSchema = z
  .object({
    id,
    skillId: z.string().regex(/^skill-[a-f0-9]{20}$/),
    name: z.string().min(1).max(500),
    description: z.string().max(3000),
    treeHash: z.string().regex(/^[a-f0-9]{64}$/),
    files: z.array(skillFileSchema).min(1).max(400),
    sourcePath: z.string().max(4000),
    sourceUrl: z.string().max(4000),
    createdAt: z.string(),
    parentVersionId: z.string().nullable(),
    originalVersionId: z.string().nullable(),
    rationale: z.string().max(30000),
    diff: z.string().max(4000000),
  })
  .refine(
    (v) => v.id === `${v.skillId}@${v.treeHash}`,
    "Identidade não corresponde ao hash da versão.",
  );
export const skillPreviewSchema = z.object({
  version: skillVersionSchema,
  skillText: z.string().max(2000000),
  warnings: z.array(z.string()),
  totalBytes: z.number().int().nonnegative(),
});
export const sessionSchema = z.object({
  id,
  objective: z.string().min(1).max(30000),
  agentId: id,
  skillVersionIds: z.array(id).max(30),
  initialSkillVersionIds: z.array(id).max(30).optional(),
  startedAt: z.string(),
  closedAt: z.string().nullable(),
  status: z.enum(["active", "closing", "closed"]),
  grilling: z.enum(["off", "running", "paused"]),
  summary: z.string().max(30000),
  summarySuggestionId: z.string().nullable(),
});
export const decisionDraftSchema = z.object({
  text: z.string().max(30000),
  rationale: z.string().max(30000),
  targetKind: z.enum(["board", "section", "card"]),
  targetId: id,
});
export const candidateFields = {
  sessionId: z.string().optional(),
  sourcePath: z.string().max(4000).optional(),
  sourceUrl: z.string().max(4000).optional(),
  skillVersionId: z.string().max(160).optional(),
  skillText: z.string().max(2000000).optional(),
  cardDraft: z
    .object({
      title: z.string().max(500),
      text: z.string().max(30000),
      firstStep: z.string().max(500),
    })
    .optional(),
  whereStopped: z.string().max(30000).optional(),
  decisions: z.array(decisionDraftSchema).max(30).optional(),
};
export type SkillVersion = z.infer<typeof skillVersionSchema>;
export type SkillPreview = z.infer<typeof skillPreviewSchema>;
export type LogicalSession = z.infer<typeof sessionSchema>;

export function textDiff(before: string, after: string): string {
  if (before === after) return "Sem alterações no texto da skill.";
  const a = before.split("\n"),
    b = after.split("\n");
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix])
    prefix++;
  let suffix = 0;
  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  )
    suffix++;
  const start = Math.max(0, prefix - 3),
    endA = Math.min(a.length, a.length - suffix + 3),
    endB = Math.min(b.length, b.length - suffix + 3);
  return [
    "--- versão anterior/SKILL.md",
    "+++ versão derivada/SKILL.md",
    `@@ linha ${start + 1} @@`,
    ...a.slice(start, endA).map((line) => `-${line}`),
    ...b.slice(start, endB).map((line) => `+${line}`),
  ].join("\n");
}
