import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
const stage = process.argv[2]
if (!['staging', 'production'].includes(stage)) throw new Error('Choose staging or production.')
const config = JSON.parse(readFileSync(resolve(root, 'wrangler.jsonc'), 'utf8'))
const settings = config.env?.[stage]
if (!settings || JSON.stringify(settings).includes('00000000') || settings.vars?.PUBLIC_APP_URL?.includes('example.com')) {
  throw new Error('Configure separate resources and the public URL for this environment first.')
}
const run = (args, build = true) => {
  const childEnv = { ...process.env }
  if (build) childEnv.CLOUDFLARE_ENV = stage
  else delete childEnv.CLOUDFLARE_ENV
  const result = spawnSync(process.execPath, args, { cwd: root, env: childEnv, stdio: 'inherit', windowsHide: true })
  if (result.status !== 0) process.exit(result.status ?? 1)
}
run(['widget/build.mjs'])
run(['node_modules/vite/bin/vite.js', 'build'])
const generated = JSON.parse(readFileSync(resolve(root, 'dist/server/wrangler.json'), 'utf8'))
if (generated.name !== settings.name) throw new Error('Generated Worker name differs from the selected environment; refusing deployment.')
// The generated config is already flattened for the selected environment.
// Passing CLOUDFLARE_ENV again would apply a second suffix to its Worker name.
run(['node_modules/wrangler/bin/wrangler.js', 'deploy', '--config', 'dist/server/wrangler.json', ...(process.argv.includes('--dry-run') ? ['--dry-run'] : [])], false)
