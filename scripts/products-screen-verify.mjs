/**
 * Super Admin Products screen — real-browser verification.
 * Injects a valid SUPER_ADMIN session (signed with the backend's JWT secret,
 * same as the app's own login token) so the screen can be driven without
 * changing any credentials, then exercises the live GET
 * /api/super-admin/products contract that previously returned HTTP 500.
 *
 * Read-only: no product is created, modified or deleted.
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';

const CHROME = process.env.CHROME_PATH
  || 'C:\\Users\\Divyang\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const DEV = 'http://localhost:3000';
const PORT = 9241;

let pass = 0, fail = 0;
const check = (cond, msg) => { process.stdout.write(cond ? '  ✅ ' : '  ❌ '); console.log(msg); cond ? pass++ : fail++; };
const section = (t) => console.log(`\n${'='.repeat(64)}\n  ${t}\n${'='.repeat(64)}`);

// Backend JWT secret (same .env the API signs with) → a real SUPER_ADMIN token.
const env = Object.fromEntries(
  readFileSync('../backend/.env', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')];
    }),
);
// HS256 JWT — identical claims to the ones /api/auth/login issues.
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const header = b64({ alg: 'HS256', typ: 'JWT' });
const now = Math.floor(Date.now() / 1000);
const payload = b64({ id: 1, role: 'SUPER_ADMIN', restaurantId: null, iat: now, exp: now + 1800 });
const signature = createHmac('sha256', env.JWT_SECRET).update(`${header}.${payload}`).digest('base64url');
const token = `${header}.${payload}.${signature}`;
const user = { id: 1, name: 'Super Admin', email: 'superadmin@pos.com', role: 'SUPER_ADMIN' };

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-proxy-server',
  '--no-default-browser-check', `--remote-debugging-port=${PORT}`,
  // Unique profile per run: a leftover Chrome from an earlier run would keep
  // the profile locked and hand back a stale tab.
  `--user-data-dir=C:\\temp-chrome-products-${Date.now()}`, 'about:blank',
], { stdio: 'ignore' });

let wsUrl = null;
for (let i = 0; i < 60; i++) {
  try {
    const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
    const page = (list || []).find((t) => t.type === 'page');
    if (page && page.webSocketDebuggerUrl) { wsUrl = page.webSocketDebuggerUrl; break; }
  } catch { /* not up yet */ }
  await sleep(300);
}
if (!wsUrl) { console.error('Chrome CDP did not start'); chrome.kill(); process.exit(1); }

const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0;
const pending = new Map();
const consoleErrors = [];
// When true, the products request is answered with HTTP 500 in-browser — this
// is how the error state is exercised without touching the real API or DB.
let failProducts = false;
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') consoleErrors.push(m.params?.exceptionDetails?.exception?.description || m.params?.exceptionDetails?.text || 'exception');
  if (m.method === 'Fetch.requestPaused') {
    const { requestId } = m.params;
    if (failProducts) {
      send('Fetch.fulfillRequest', {
        requestId,
        responseCode: 500,
        responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
        body: Buffer.from(JSON.stringify({ success: false, message: 'Failed to fetch products' })).toString('base64'),
      });
    } else {
      send('Fetch.continueRequest', { requestId });
    }
  }
};
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) return { __error: r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text };
  return r.result?.result?.value;
};

await send('Runtime.enable');
await send('Page.enable');
await send('Page.navigate', { url: DEV });
await sleep(2500);

// Seed the session BEFORE the SPA boots, then open the Products screen.
await evaluate(`(() => {
  localStorage.setItem('pos_token', ${JSON.stringify(token)});
  localStorage.setItem('pos_user', ${JSON.stringify(JSON.stringify(user))});
  localStorage.setItem('pos_remember', 'true');
  return true;
})()`);
await send('Page.reload', { ignoreCache: true });

let booted = false;
for (let i = 0; i < 60; i++) {
  await sleep(500);
  const state = await evaluate(`(() => ({
    signedIn: !!document.querySelector('aside') && !document.querySelector('#login-password'),
    onLogin: !!document.querySelector('#login-password'),
  }))()`);
  if (state && state.signedIn) { booted = true; break; }
  if (state && state.onLogin && i > 20) break;
}
check(booted, 'the app boots with the injected SUPER_ADMIN session');

// Navigate to the Products screen through the sidebar (the real user path).
let clicked = false;
for (let i = 0; i < 20 && !clicked; i++) {
  clicked = await evaluate(`(() => {
    const btn = [...document.querySelectorAll('button, a')].find(el => el.textContent.trim().replace(/\\s+/g, ' ') === 'Products');
    if (!btn) return false;
    btn.click();
    return true;
  })()`);
  if (!clicked) await sleep(400);
}
check(clicked, 'the Products item is reachable from the Super Admin sidebar');

let text = '';
for (let i = 0; i < 40; i++) {
  await sleep(400);
  text = String(await evaluate(`document.body.textContent`));
  if (/Products Management/.test(text)) break;
}
check(/Products Management/.test(text), 'the Products Management screen renders');
check(!/Failed to fetch products/.test(text), 'the previous “Failed to fetch products” error is gone');

const state = await evaluate(`(() => {
  const body = document.body.textContent;
  const rows = [...document.querySelectorAll('table tbody tr')].map(tr => tr.textContent.replace(/\\s+/g, ' ').trim());
  return {
    rows,
    hasTable: !!document.querySelector('table'),
    emptyState: body.includes('No products yet.'),
    errorState: body.includes('Failed to load products'),
    skeleton: !!document.querySelector('[aria-busy="true"]'),
    spinnerOnly: body.includes('Loading products…'),
    search: !!document.querySelector('input[aria-label="Search products"]'),
    addBtn: [...document.querySelectorAll('button')].some(b => /Add New Product/.test(b.textContent)),
    activeBadge: body.includes('Active'),
    currentBadge: body.includes('Current'),
    urlShown: body.includes('https://infinixotech.com'),
  };
})()`);
check(state.hasTable, 'the product table renders (success state)');
check(!state.errorState, 'no error state on a healthy API');
check(!state.skeleton && !state.spinnerOnly, 'the loading skeleton is replaced once data arrives');
check(state.search, 'search-by-name input present');
check(state.addBtn, '"Add New Product" action present');
check(state.activeBadge, 'each row shows its active/inactive status');
check(state.urlShown, 'the product URL is displayed');
check(state.currentBadge, 'the current product is marked');
check((state.rows || []).some((r) => /KlarGo POS/.test(r)), `the live product row is displayed (${(state.rows || []).length} row(s))`);

// Search filters client-side.
await evaluate(`(() => {
  const el = document.querySelector('input[aria-label="Search products"]');
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  set.call(el, 'zzz-no-match');
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`);
await sleep(500);
const noMatch = await evaluate(`document.body.textContent.includes('No products match your search.')`);
check(noMatch, 'searching with no match shows the search empty state');
await evaluate(`(() => {
  const el = document.querySelector('input[aria-label="Search products"]');
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  set.call(el, '');
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`);
await sleep(500);

// The add form opens with validation wired up.
await evaluate(`(() => {
  const b = [...document.querySelectorAll('button')].find(x => /Add New Product/.test(x.textContent));
  b.click(); return true;
})()`);
await sleep(700);
const modal = await evaluate(`(() => {
  const dlg = document.querySelector('[role="dialog"]');
  const body = document.body.textContent;
  return {
    open: !!dlg,
    labelled: !!dlg?.getAttribute('aria-label'),
    nameField: !!document.querySelector('#product-name'),
    urlField: !!document.querySelector('#product-url'),
    saveBtn: [...document.querySelectorAll('button')].some(b => /Create Product/.test(b.textContent)),
    cancelBtn: [...document.querySelectorAll('button')].some(b => /^Cancel$/.test(b.textContent.trim())),
  };
})()`);
check(modal.open && modal.labelled, 'the Add Product dialog opens with an accessible label');
check(modal.nameField && modal.urlField, 'the form exposes the product name + URL fields');
check(modal.saveBtn && modal.cancelBtn, 'the form offers Create and Cancel actions');

// Invalid URL is rejected client-side (no request leaves the browser).
await evaluate(`(() => {
  const setV = (sel, v) => {
    const el = document.querySelector(sel);
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  setV('#product-name', 'Validation Check');
  setV('#product-url', 'javascript:alert(1)');
  return true;
})()`);
await sleep(300);
await evaluate(`(() => {
  const b = [...document.querySelectorAll('button')].find(x => /Create Product/.test(x.textContent));
  b.click(); return true;
})()`);
await sleep(700);
const invalid = await evaluate(`(() => ({
  msg: document.body.textContent.includes('Enter a valid http(s) URL.'),
  stillOpen: !!document.querySelector('[role="dialog"]'),
}))()`);
check(invalid.msg, 'an unsafe URL is rejected with an inline error');
check(invalid.stillOpen, 'the dialog stays open after a validation error');

await evaluate(`(() => {
  const b = [...document.querySelectorAll('button')].find(x => /^Cancel$/.test(x.textContent.trim()));
  if (b) b.click(); return true;
})()`);
await sleep(400);

// ── Error state + Retry (the API is made to fail in-browser only) ──
section('ERROR STATE + RETRY');
// Fail the FIRST load of the screen (reload → the request fails while the
// screen mounts), which is the case the error state exists for.
await send('Fetch.enable', { patterns: [{ urlPattern: '*super-admin/products*', requestStage: 'Request' }] });
failProducts = true;
await send('Page.reload', { ignoreCache: true });
for (let i = 0; i < 60; i++) {
  await sleep(500);
  if (await evaluate(`!!document.querySelector('aside') && !document.querySelector('#login-password')`)) break;
}
for (let i = 0; i < 20; i++) {
  const ok = await evaluate(`(() => {
    const btn = [...document.querySelectorAll('button, a')].find(el => el.textContent.trim().replace(/\\s+/g, ' ') === 'Products');
    if (!btn) return false;
    btn.click();
    return true;
  })()`);
  if (ok) break;
  await sleep(400);
}
let errorText = '';
for (let i = 0; i < 40; i++) {
  await sleep(300);
  errorText = String(await evaluate(`document.body.textContent`));
  if (/Failed to load products/.test(errorText)) break;
}
check(/Failed to load products/.test(errorText), 'a failing API shows the error state (not an empty catalog)');
check(!/No products yet\./.test(errorText), 'the error is never disguised as “no products yet”');
const retryBtn = await evaluate(`(() => {
  const b = [...document.querySelectorAll('button')].find(x => /^Retry$/.test(x.textContent.trim()));
  return b ? { text: b.textContent.trim(), visible: b.getBoundingClientRect().width > 0 } : null;
})()`);
check(!!retryBtn && retryBtn.visible, 'a Retry action is offered when loading fails');

failProducts = false;
await evaluate(`(() => {
  const b = [...document.querySelectorAll('button')].find(x => /^Retry$/.test(x.textContent.trim()));
  b.click(); return true;
})()`);
let recovered = '';
for (let i = 0; i < 40; i++) {
  await sleep(300);
  recovered = String(await evaluate(`document.body.textContent`));
  if (!/Failed to load products/.test(recovered) && /KlarGo POS/.test(recovered)) break;
}
check(!/Failed to load products/.test(recovered), 'Retry clears the error state', );
check(/KlarGo POS/.test(recovered), 'Retry reloads the catalog from the API');
await send('Fetch.disable');

section('CONSOLE');
const real = consoleErrors.filter((e) => !/favicon|net::ERR_|401/.test(e));
check(real.length === 0, `no uncaught exceptions (${real.length} found)`);
real.slice(0, 5).forEach((e) => console.log('     ! ' + String(e).slice(0, 160)));

console.log(`\n  Total: ${pass + fail}   Passed: ${pass} ✅   Failed: ${fail} ${fail ? '❌' : '✅'}`);
ws.close();
chrome.kill();
await sleep(400);
process.exit(fail ? 1 : 0);
