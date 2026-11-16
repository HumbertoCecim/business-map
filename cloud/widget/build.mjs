import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
await mkdir(resolve(here, 'dist'), { recursive: true });
const result = await build({ entryPoints: [resolve(here, 'main.tsx')], bundle: true, write: false, minify: true, format: 'iife', target: 'es2022', jsx: 'automatic', outfile: resolve(here, 'dist/widget.js'), define: { 'process.env.NODE_ENV': '"production"' }, legalComments: 'none' });
const script = result.outputFiles.find(file => file.path.endsWith('.js')).text;
const css = result.outputFiles.find(file => file.path.endsWith('.css')).text;
// Only trusted build outputs are embedded. Business/skill/proposal text is rendered as React text.
const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Business Map</title><style>${css.replace(/<\/style/gi, '<\\/style')}</style></head><body><div id="root"></div><script type="module">${script.replace(/<\/script/gi, '<\\/script')}</script></body></html>`;
await writeFile(resolve(here, 'dist/map.html'), html);
await readFile(resolve(here, 'dist/map.html')); // Fail the build if the deliverable was not written.
