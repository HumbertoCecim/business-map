import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdir, chmod } from 'node:fs/promises';
import path from 'node:path';

await mkdir('build', { recursive: true });
await build({
  entryPoints: ['local/cli.ts'],
  outfile: 'build/cli.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  packages: 'external',
});
if (process.platform !== 'win32') await chmod('build/cli.mjs', 0o755);
execFileSync(process.execPath, [path.resolve('node_modules/vite/bin/vite.js'), 'build', '--config', 'web/vite.config.ts'], { stdio: 'inherit' });
