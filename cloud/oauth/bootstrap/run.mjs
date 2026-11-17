import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const folder = path.dirname(fileURLToPath(import.meta.url))
const cloud = path.resolve(folder, '../..')
const stage = process.argv[2] ?? 'staging'
if (!['staging', 'production'].includes(stage)) throw new Error('Choose staging or production')
const credentialsFolder = path.resolve(folder, '../.credentials')
const credentialsFile = path.join(credentialsFolder, `chatgpt-${stage}.json`)
const configFile = path.join(folder, '.bootstrap.config.json')
const varsFile = path.join(folder, '.dev.vars')
const key = randomBytes(32).toString('hex')
const port = 8796
await mkdir(credentialsFolder, { recursive: true })
await writeFile(varsFile, `BOOTSTRAP_KEY=${key}\n`, { mode: 0o600 })
await writeFile(configFile, JSON.stringify({
  name: `business-map-operator-bootstrap-${stage}`,
  main: 'index.ts', compatibility_date: '2026-07-02', compatibility_flags: ['nodejs_compat'],
  workers_dev: false, preview_urls: false, observability: { enabled: false },
  services: [{ binding: 'AUTH', service: `business-map-auth-${stage}`, entrypoint: 'OAuthBinding', remote: true }],
}))
const child = spawn(process.execPath, [path.join(cloud, 'node_modules/wrangler/bin/wrangler.js'), 'dev', '--config', configFile, '--port', String(port), '--ip', '127.0.0.1', '--log-level', 'error'], { cwd: cloud, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
let diagnostics = ''
for (const output of [child.stdout, child.stderr]) output.on('data', (bytes) => { diagnostics = `${diagnostics}${bytes.toString()}`.slice(-4000) })
let exited = false
child.on('exit', () => { exited = true })
try {
  let response
  for (let attempt = 0; attempt < 120; attempt++) {
    if (exited) throw new Error('Wrangler stopped before bootstrap was ready')
    try {
      response = await fetch(`http://127.0.0.1:${port}/health`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(1000) })
      if (response.ok) break
    } catch { /* Wait for the local listener and authenticated remote binding. */ }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  if (!response?.ok) throw new Error('Local bootstrap helper did not become ready')
  // One mutation request only: never retry a timed-out client creation automatically.
  response = await fetch(`http://127.0.0.1:${port}/bootstrap`, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(60000) })
  if (!response.ok) throw new Error(`Bootstrap failed (HTTP ${response.status}). Confirm the OAuth Worker with ensureChatgptClient is deployed.`)
  const credentials = await response.json()
  if (!credentials.clientId || (credentials.created && !credentials.clientSecret)) throw new Error('Bootstrap returned incomplete credentials')
  let previous
  try { previous = JSON.parse(await readFile(credentialsFile, 'utf8')) } catch { /* First bootstrap. */ }
  if (!credentials.clientSecret && previous?.clientId === credentials.clientId) credentials.clientSecret = previous.clientSecret
  const saved = { ...credentials, mcpUrl: stage === 'staging' ? 'https://business-map-cloud-staging.humbertocljunior.workers.dev/mcp' : 'SET_PRODUCTION_MCP_URL', scopes: ['business:read', 'business:propose', 'business:approve'] }
  await writeFile(credentialsFile, `${JSON.stringify(saved, null, 2)}\n`, { mode: 0o600 })
  console.log(`Private ChatGPT client ${credentials.created ? 'created' : 'already exists'}. Credentials saved locally: ${credentialsFile}`)
  console.log('Set APPROVED_CHATGPT_CLIENT_IDS to the exact clientId in both Workers; configure ChatGPT with this clientId and clientSecret.')
  if (!saved.clientSecret) console.log('The secret was returned only at first creation. Retrieve the existing operator copy before configuring ChatGPT.')
} catch (error) {
  // Never print request/response bodies or credentials. Wrangler diagnostics contain no bootstrap response.
  console.error(error instanceof Error ? error.message : 'Bootstrap failed')
  if (diagnostics) console.error(diagnostics.replaceAll(key, '[redacted]'))
  process.exitCode = 1
} finally {
  child.kill()
  await rm(varsFile, { force: true })
  await rm(configFile, { force: true })
}
