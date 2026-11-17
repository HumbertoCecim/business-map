import { createServer, type Server } from 'node:http';
import { expect, test } from '@playwright/test';
import { consentPage } from '../oauth/src/consent-page';

let authorizationServer: Server, callbackServer: Server;
let origin: string, callbackOrigin: string;
let submittedOrigin: string | undefined, callbackReferer: string | undefined;

async function listen(server: Server) {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected local HTTP listener');
  return `http://127.0.0.1:${address.port}`;
}

test.beforeAll(async () => {
  callbackServer = createServer((request, response) => {
    if (!request.url?.startsWith('/callback?')) { response.writeHead(204).end(); return; }
    callbackReferer = request.headers.referer;
    response.end('Authorized callback reached');
  });
  callbackOrigin = await listen(callbackServer);
  authorizationServer = createServer(async (request, response) => {
    if (request.method === 'POST') {
      submittedOrigin = request.headers.origin;
      if (submittedOrigin !== origin) { response.writeHead(403).end('Invalid origin'); return; }
      response.writeHead(303, { Location: `${callbackOrigin}/callback?code=test-only-code` }).end();
      return;
    }
    const document = consentPage('<h1>Consent</h1><form method="post" action="/authorize"><button name="decision" value="approve">Authorize</button></form>', undefined, 200, `${callbackOrigin}/callback`);
    response.writeHead(document.status, Object.fromEntries(document.headers));
    response.end(await document.text());
  });
  origin = await listen(authorizationServer);
});

test.afterAll(async () => {
  await Promise.all([authorizationServer, callbackServer].filter(Boolean).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
});

test('native consent form preserves its Origin and reaches a validated cross-origin callback', async ({ page }) => {
  const cspFailures: string[] = [];
  page.on('console', message => { if (message.text().includes('form-action')) cspFailures.push(message.text()); });
  await page.goto(`${origin}/authorize?private-consent-handle=not-for-callback`);
  await page.getByRole('button', { name: 'Authorize', exact: true }).click();
  await expect(page).toHaveURL(`${callbackOrigin}/callback?code=test-only-code`);
  await expect(page.getByText('Authorized callback reached')).toBeVisible();
  expect(submittedOrigin).toBe(origin);
  expect(callbackReferer).toBeUndefined();
  expect(cspFailures).toEqual([]);
});

test('consent policy only permits the validated callback origin and still refuses foreign submissions', async ({ request }) => {
  const document = consentPage('Preview', undefined, 200, `${callbackOrigin}/callback?ignored=query`);
  expect(document.headers.get('Content-Security-Policy')).toContain(`form-action 'self' ${callbackOrigin};`);
  expect(document.headers.get('Content-Security-Policy')).not.toContain('ignored=query');
  expect(consentPage('Error').headers.get('Content-Security-Policy')).toContain("form-action 'self';");
  expect(() => consentPage('Preview', undefined, 200, 'javascript:alert(1)')).toThrow();
  const response = await request.post(`${origin}/authorize`, { headers: { Origin: 'https://attacker.example' } });
  expect(response.status()).toBe(403);
});
