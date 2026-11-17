import { z } from 'zod'
import { skillVersionSchema, type SkillVersion } from '../../../shared/evolution'
import { DomainError, type SkillPackageInput } from './model'
import { assertBounded, canonicalJSON, portableURL, sha256 } from './domain'

const MAX_FILE_BYTES = 2_000_000, MAX_PACKAGE_BYTES = 20_000_000
const inputSchema = z.object({
  version: skillVersionSchema,
  files: z.array(z.object({
    path: z.string().min(1).max(1000), encoding: z.enum(['utf8', 'base64']),
    content: z.string().max(2_666_672),
  }).strict()).min(1).max(400),
}).strict()
export type StoredSkillPackage = {
  version: SkillVersion; available: true; manifestHash: string
  files: { path: string; encoding: 'utf8' | 'base64'; content: string }[]
}
export function validateSkillPath(path: string): void {
  if (!path || path.startsWith('/') || /[\\:\x00-\x1f]/.test(path) || path.split('/').some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part) || part.toLowerCase() === '.git')) throw new DomainError('INVALID', 'Skill file path must stay inside the package.')
}
function fileBytes(file: { encoding: 'utf8' | 'base64'; content: string }): Uint8Array {
  if (file.encoding === 'utf8') {
    const bytes = new TextEncoder().encode(file.content)
    if (file.content.includes('\0') || new TextDecoder().decode(bytes) !== file.content) throw new DomainError('INVALID', 'Skill text is not valid UTF-8.')
    return bytes
  }
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.content)) throw new DomainError('INVALID', 'Skill binary file is not valid base64.')
  try { return Uint8Array.from(atob(file.content), character => character.charCodeAt(0)) }
  catch { throw new DomainError('INVALID', 'Skill binary file is not valid base64.') }
}
export async function validateSkillPackage(raw: SkillPackageInput): Promise<StoredSkillPackage> {
  assertBounded(raw, 32_000_000)
  const input = inputSchema.parse(raw), version = input.version
  const paths = new Set<string>()
  let total = 0
  if (input.files.length !== version.files.length) throw new DomainError('INVALID', 'Skill manifest does not match the package files.')
  for (const file of input.files) {
    validateSkillPath(file.path)
    const folded = file.path.normalize('NFC').toLowerCase()
    if (paths.has(folded)) throw new DomainError('INVALID', 'Duplicate skill file path or case collision.')
    paths.add(folded)
    const manifest = version.files.find(entry => entry.path === file.path)
    const bytes = fileBytes(file)
    total += bytes.byteLength
    if (bytes.byteLength > MAX_FILE_BYTES || total > MAX_PACKAGE_BYTES) throw new DomainError('LIMIT', 'Skill package exceeds the file or package size limit.')
    if (!manifest || manifest.size !== bytes.byteLength || manifest.encoding !== file.encoding || manifest.sha256 !== await sha256(bytes)) throw new DomainError('INVALID', 'Skill file does not match its immutable manifest.')
  }
  if (!input.files.some(file => file.path === 'SKILL.md' && file.encoding === 'utf8')) throw new DomainError('INVALID', 'Skill package requires a UTF-8 SKILL.md.')
  // This is the same manifest hash algorithm used by the portable local skill repository.
  const manifestHash = await sha256(JSON.stringify(version.files.map(({ path, size, sha256, encoding }) => ({ path, size, sha256, encoding }))))
  if (manifestHash !== version.treeHash) throw new DomainError('INVALID', 'Skill tree hash does not match the manifest.')
  version.sourcePath = ''
  version.sourceUrl = portableURL(version.sourceUrl) ?? ''
  return { version, available: true, manifestHash, files: version.files.map(entry => input.files.find(file => file.path === entry.path)!) }
}
async function packageKey(businessId: string, version: Pick<SkillVersion, 'skillId' | 'treeHash'>): Promise<string> {
  return `business/${await sha256(businessId)}/skills/${version.skillId}/${version.treeHash}.json`
}
export async function storeSkillPackage(bucket: R2Bucket, businessId: string, raw: SkillPackageInput): Promise<StoredSkillPackage> {
  const validated = await validateSkillPackage(raw), key = await packageKey(businessId, validated.version)
  const serialized = canonicalJSON(validated)
  const result = await bucket.put(key, serialized, {
    onlyIf: { etagDoesNotMatch: '*' },
    httpMetadata: { contentType: 'application/json', cacheControl: 'private, no-store' },
    customMetadata: { manifestHash: validated.manifestHash, immutable: 'true' },
  })
  if (!result) {
    const existing = await bucket.get(key)
    if (!existing) throw new DomainError('CONFLICT', 'Immutable skill package could not be read.')
    const stored = await existing.json<StoredSkillPackage>()
    const verified = await validateSkillPackage({ version: stored.version, files: stored.files })
    if (verified.manifestHash !== validated.manifestHash || canonicalJSON(verified.files) !== canonicalJSON(validated.files)) throw new DomainError('CONFLICT', 'An immutable skill version already exists with different content.')
    // Content identity is independent of import timestamp/source. Keep the first immutable metadata.
    return verified
  }
  return validated
}
export async function readSkillPackage(bucket: R2Bucket, businessId: string, version: SkillVersion): Promise<StoredSkillPackage | null> {
  const object = await bucket.get(await packageKey(businessId, version))
  if (!object) return null
  const stored = await object.json<StoredSkillPackage>()
  const validated = await validateSkillPackage({ version: stored.version, files: stored.files })
  if (validated.version.id !== version.id || validated.manifestHash !== stored.manifestHash) throw new DomainError('INVALID', 'Stored skill integrity check failed.')
  return validated
}
