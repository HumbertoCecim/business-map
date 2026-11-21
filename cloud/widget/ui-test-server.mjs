// Loopback-only UI harness. Fictional maps live in this process; no cloud bindings or private data.
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { build, context } from 'esbuild';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const ui = await context({ stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import{BusinessApp}from'./src/features/business/components/BusinessApp';createRoot(document.getElementById('root')).render(<BusinessApp/>);`, resolveDir: resolve(here, '..'), sourcefile: 'ui-test.tsx', loader: 'tsx' }, bundle: true, write: false, format: 'iife', jsx: 'automatic', outfile: 'ui-test.js', define: { 'process.env.NODE_ENV': '"production"' } });
const widget = await context({ entryPoints: [resolve(here, 'main.tsx')], bundle: true, write: false, minify: true, format: 'iife', target: 'es2022', jsx: 'automatic', outfile: 'widget.js', define: { 'process.env.NODE_ENV': '"production"' } });
const dataBundle = await build({ entryPoints: [resolve(here, 'demo-data.ts')], bundle: true, write: false, platform: 'node', format: 'esm' });
const { createDemoData } = await import(`data:text/javascript;base64,${Buffer.from(dataBundle.outputFiles[0].text).toString('base64')}`);
const demo = createDemoData();
const sockets = new Map();
const business = request => /(?:^|;\s*)ui01-business=research(?:;|$)/.test(request.headers.cookie || '') ? 'research' : 'studio';
const notify = key => { for (const [socket, selected] of sockets) if (selected === key && !socket.destroyed) socket.write(Buffer.from([0x81, 2, 0x7b, 0x7d])); };
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>.dark{--muted:#11141b;--border:#232733;--dot:rgba(180,187,201,.1)}</style><link rel="stylesheet" href="/ui-test.css"></head><body style="margin:0"><div id="root"></div><script src="/ui-test.js"></script></body></html>';
const host = await build({ stdin: { contents: `
import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge';
const frame = document.getElementById('map-frame');
let context = { theme: new URL(location.href).searchParams.get('theme') || 'light', displayMode: 'inline', availableDisplayModes: ['inline', 'fullscreen'] };
const bridge = new AppBridge(null, { name: 'BusinessMap browser test host', version: '1.0.0' }, { serverTools: {} }, { hostContext: context });
let inlineHeight = 650;
bridge.onsizechange = ({ height }) => {
  if (height == null) return;
  document.body.dataset.resizeCount = String(Number(document.body.dataset.resizeCount || 0) + 1);
  document.body.dataset.reportedHeight = String(height);
  if (context.displayMode === 'inline') {
    inlineHeight = height;
    // Exercise the real host/app feedback path; the ceiling only contains a broken test app.
    frame.style.height = Math.min(height, 4000) + 'px';
  }
};
bridge.oncalltool = async params => (await fetch('/test-tool', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params) })).json();
bridge.onrequestdisplaymode = async ({ mode }) => {
  context = { ...context, displayMode: mode };
  frame.style.height = (mode === 'fullscreen' ? Math.max(300, window.innerHeight - 50) : inlineHeight) + 'px';
  bridge.setHostContext(context);
  document.body.dataset.display = mode;
  return { mode };
};
bridge.connect(new PostMessageTransport(frame.contentWindow, frame.contentWindow)).then(() => frame.src = '/widget-frame');
`, resolveDir: resolve(here, '..'), sourcefile: 'widget-host.ts', loader: 'ts' }, bundle: true, write: false, format: 'iife', target: 'es2022', outfile: 'widget-host.js' });
const hostScript = host.outputFiles[0].text;
const hostHtml = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f7f7f2;padding:25px"><iframe id="map-frame" title="Business Map inline app" style="width:100%;height:650px;border:0"></iframe><script src="/widget-host.js"></script></body></html>';
const demoHtml = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>UI-01 preview</title><style>body{font:16px/1.6 system-ui;max-width:760px;margin:60px auto;padding:24px;color:#25352d;background:#f7f8f4}a,button{display:inline-block;padding:10px 16px;margin:4px;border:1px solid #bac6bc;border-radius:10px;background:white;color:inherit}h1{font-size:38px}small{display:block}</style><h1>GrowYourPlan · UI-01</h1><p>Fictional maps for visual review. Changes last until this preview process stops. Browser layout preferences can survive a reload.</p><p><a href="/business">Open the website</a><a href="/widget-host">Open the inline widget preview</a><a href="/widget-host?theme=dark">Dark widget preview</a></p><h2>Switch fictional business</h2><a href="/demo/switch?business=studio">Northstar Creative Studio</a><a href="/demo/switch?business=research">Harbor Community Research</a><h2>Simulate a data update</h2><p>Keep the map open in another tab to check whether its arrangement stays in place.</p><button onclick="update('add')">Add an area</button><button onclick="update('remove')">Remove that area</button><button onclick="update('reset')">Reset fictional map</button><p id="status" role="status"></p><small>This is an isolated UI harness with the official MCP Apps browser bridge. It does not validate ChatGPT, OAuth, cloud persistence or authentication. Import and account management are outside this preview.</small><script>async function update(action){const response=await fetch('/demo/update?action='+action,{method:'POST'});const data=await response.json();document.getElementById('status').textContent=response.ok?'Fictional map updated. Refresh its tab if needed.':data.error.message}</script></html>`;
const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  const path = url.pathname, key = business(request);
  response.setHeader('Cache-Control', 'no-store');
  const json = (value, status = 200) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(value)); };
  try {
    if (path === '/demo/switch') {
      const selected = url.searchParams.get('business');
      if (!['studio', 'research'].includes(selected)) return json({ error: { message: 'Unknown fictional business.' } }, 400);
      response.writeHead(303, { 'Set-Cookie': `ui01-business=${selected}; Path=/; SameSite=Lax; HttpOnly`, Location: url.searchParams.get('surface') === 'widget' ? '/widget-host' : '/business' }); response.end(); return;
    }
    if (path === '/demo/stats') return json({ ...demo.stats(), businessId: demo.get(key).businessId, revision: demo.get(key).board.revision });
    if (path === '/demo/update' && request.method === 'POST') { const action = url.searchParams.get('action'); const state = action === 'reset' ? demo.reset(key) : demo.update(key, action); notify(key); return json(state); }
    if (path.startsWith('/api/') || path === '/test-tool') {
      if (path === '/api/business/events') return json({ error: { message: 'WebSocket upgrade required.' } }, 426);
      let raw = ''; for await (const chunk of request) { raw += chunk; if (raw.length > 2_000_000) throw new Error('LIMIT: Demo request too large.'); }
      const input = raw ? JSON.parse(raw) : {};
      const result = path === '/test-tool' ? demo.tool(key, input) : demo.api(key, path, input);
      if (request.method === 'POST' && !path.endsWith('/preview') && input.name !== 'business_get_ui_state') notify(key);
      return json(result);
    }
    response.setHeader('Content-Type', path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : 'text/html');
    if (path === '/ui-test.js' || path === '/ui-test.css') {
      const built = await ui.rebuild(); response.end(built.outputFiles.find(file => file.path.endsWith(path.endsWith('.css') ? '.css' : '.js')).text); return;
    }
    if (path === '/widget-frame') {
      const built = await widget.rebuild(), script = built.outputFiles.find(file => file.path.endsWith('.js')).text, css = built.outputFiles.find(file => file.path.endsWith('.css')).text;
      response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'");
      response.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.replace(/<\/style/gi, '<\\/style')}</style><div id="root"></div><script type="module">${script.replace(/<\/script/gi, '<\\/script')}</script></html>`); return;
    }
    response.end(path === '/widget-host.js' ? hostScript : path === '/widget-host' ? hostHtml : path === '/demo' || path === '/' ? demoHtml : html);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (path === '/test-tool') return json({ isError: true, content: [{ type: 'text', text: message }] });
    json({ error: { message } }, /CONFLICT/.test(message) ? 409 : /NOT_FOUND/.test(message) ? 404 : 400);
  }
});
server.on('upgrade', (request, socket) => {
  if (request.url !== '/api/business/events' || !request.headers['sec-websocket-key']) { socket.destroy(); return; }
  const accept = createHash('sha1').update(request.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  sockets.set(socket, business(request));
  socket.on('data', data => { if ((data[0] & 0x0f) === 8) socket.end(Buffer.from([0x88, 0])); });
  socket.on('close', () => sockets.delete(socket)); socket.on('error', () => sockets.delete(socket));
});
const port = Number(process.env.UI_PORT || 3091);
server.listen(port, '127.0.0.1', () => console.log(`UI-01 fictional preview: http://127.0.0.1:${port}/demo`));
