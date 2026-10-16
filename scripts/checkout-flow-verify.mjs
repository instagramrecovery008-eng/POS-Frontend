/**
 * Order creation + cashier checkout — real-browser verification.
 *
 * Confirms the workflow that REPLACED the removed "Save & Pay" action:
 *   Floors & Tables → Open Table → Menu → add an item → Review
 *   → "Print KOT" creates the order AND its kitchen ticket (exactly one),
 *   → the cashier then collects payment from Active Orders (existing overlay).
 *
 * It also asserts the Review step offers NO Hold Order and NO Save & Pay.
 *
 * The verification order is cleaned up at the end (cancel + void its KOTs +
 * soft-delete so the table is released), leaving no active test data behind.
 *
 * Requires the Vite dev server on :3000 and the backend on :5001.
 * Run: node scripts/checkout-flow-verify.mjs
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = process.env.CHROME_PATH
  || 'C:\\Users\\Divyang\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const DEV = 'http://localhost:3000';
const API = 'http://localhost:5001/api';
const PORT = 9225;

let pass = 0, fail = 0;
const check = (cond, msg) => { process.stdout.write(cond ? '  ✅ ' : '  ❌ '); console.log(msg); cond ? pass++ : fail++; };

const api = async (method, path, body, token) => {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let data = null;
  try { data = await res.json(); } catch { /* ignore */ }
  return data;
};

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-proxy-server',
  '--no-default-browser-check', '--disable-extensions',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=C:\\POS System\\restaurant-pos-frontend\\.chrome-profile-checkout',
  'about:blank',
], { stdio: 'ignore' });

let wsUrl = null;
for (let i = 0; i < 60; i++) {
  try {
    const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
    const page = (list || []).find((t) => t.type === 'page');
    if (page && page.webSocketDebuggerUrl) { wsUrl = page.webSocketDebuggerUrl; break; }
  } catch { /* not up */ }
  await sleep(300);
}
if (!wsUrl) { console.error('Chrome CDP did not start'); chrome.kill(); process.exit(1); }

const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let msgId = 0;
const pending = new Map();
const errors = [];
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error') {
    errors.push(msg.params.args?.map((a) => a.value || a.description || '').join(' '));
  }
};
const send = (method, params = {}) => new Promise((res) => {
  const id = ++msgId; pending.set(id, res); ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
await send('Runtime.enable');
await send('Page.enable');

const login = await api('POST', '/auth/login', { email: 'admin@restaurant.com', password: 'password123' });
if (!login?.token) { console.error('❌ login failed'); chrome.kill(); process.exit(1); }
const token = login.token;

const tables = await api('GET', '/tables', undefined, token);
const table = (tables?.tables || []).find((t) => t.status === 'AVAILABLE');
check(!!table, `an available table exists (id=${table?.id})`);
if (!table) { chrome.kill(); process.exit(1); }

await send('Page.navigate', { url: DEV });
await sleep(2500);
await evaluate(`(() => {
  localStorage.setItem('pos_token', ${JSON.stringify(token)});
  localStorage.setItem('pos_user', ${JSON.stringify(JSON.stringify(login.user))});
  return true;
})()`);
await send('Page.reload', { ignoreCache: true });
await sleep(4000);
await send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 820, deviceScaleFactor: 1, mobile: false });
await sleep(600);

// Floors & Tables → tap the AVAILABLE table → Open Table
const nav = await evaluate(`(() => {
  const b = [...document.querySelectorAll('button[title="Floors & Tables"]')][0];
  if (!b) return false;
  b.click();
  return true;
})()`);
check(nav, 'navigated to Floors & Tables');
await sleep(2200);

const clicked = await evaluate(`(() => {
  const spans = [...document.querySelectorAll('span')].filter(s => s.textContent.trim() === 'Open Table');
  const card = spans.length ? spans[0].closest('div[class*="cursor-pointer"]') : null;
  if (!card) return false;
  card.click();
  return true;
})()`);
check(clicked, 'tapped an available table');
await sleep(700);
await evaluate(`(() => {
  const d = document.querySelector('div[role="dialog"]');
  const b = d && [...d.querySelectorAll('button')].find(x => x.textContent.trim() === 'Open Table');
  if (b) b.click();
  return !!b;
})()`);
await sleep(2500);

const onMenu = await evaluate(`!!document.querySelector('input[placeholder="Search dishes, categories..."]')`);
check(onMenu, 'order entry opened directly on the menu');

const before = (await api('GET', '/orders/active', undefined, token))?.data?.length ?? null;
await evaluate(`(() => {
  const grid = [...document.querySelectorAll('div')].filter(d => String(d.className).includes('grid-cols-2') && d.children.length);
  const card = grid.length ? grid[0].querySelector('div[class*="rounded-2xl"]') : null;
  if (card) card.click();
  return !!card;
})()`);
await sleep(600);
await evaluate(`(() => {
  const b = [...document.querySelectorAll('button')].find(x => /^Review \\(/.test(x.textContent.trim()));
  if (b) b.click();
  return !!b;
})()`);
await sleep(800);

// The Review step must offer Print KOT / Cancel Order only.
const reviewActions = await evaluate(`(() => {
  const t = document.body.innerText;
  return {
    printKot: !!([...document.querySelectorAll('button')].find(x => /^Print KOT/.test(x.textContent.trim()))),
    cancel: !!([...document.querySelectorAll('button')].find(x => /^Cancel Order/.test(x.textContent.trim()))),
    hold: /Hold Order/.test(t),
    savePay: /Save & Pay/.test(t),
  };
})()`);
check(reviewActions.printKot, 'Print KOT is available for a new table order');
check(reviewActions.cancel, 'Cancel Order is available');
check(!reviewActions.hold, 'no Hold Order action is offered any more');
check(!reviewActions.savePay, 'no Save & Pay action is offered any more');

// Clicking Print KOT must create the order AND its kitchen ticket exactly once.
const clickedKot = await evaluate(`(() => {
  const b = [...document.querySelectorAll('button')].find(x => /^Print KOT/.test(x.textContent.trim()));
  if (!b) return false;
  b.click();
  return true;
})()`);
check(clickedKot, 'Print KOT was clicked');
await sleep(3500);

// Find the created order for this table, then clean up.
const active = await api('GET', '/orders/active', undefined, token);
const list = active?.data || [];
const created = list.find((o) => Number(o.tableId) === Number(table.id));
check(!!created, `the order was persisted for table ${table.tableNo} (#${created?.orderNo || created?.id})`);
const kots = await api('GET', '/kot', undefined, token);
const orderKots = (kots?.data || []).filter((k) => Number(k.orderId) === Number(created?.id));
check(orderKots.length === 1, `exactly one KOT exists for the order (got ${orderKots.length})`);
check(((orderKots[0]?.kotItems) || []).length >= 1, 'the ticket carries the ordered item');

// A retry (double click / refresh) must never create a second ticket.
await api('POST', '/kot', { orderId: created?.id }, token);
const kotsRetry = await api('GET', '/kot', undefined, token);
const orderKotsRetry = (kotsRetry?.data || []).filter((k) => Number(k.orderId) === Number(created?.id));
check(orderKotsRetry.length === 1, `a KOT retry created no duplicate (still ${orderKotsRetry.length})`);

// Payment continues through the existing cashier checkout: Active Orders → Bill.
// The KOT print preview opens a child window whose print() call can block the
// page renderer in headless mode, so the SPA is reloaded first (a navigation
// closes that dialog) before driving the cashier screen.
await send('Page.navigate', { url: DEV });
await sleep(4500);
const navOrders = await evaluate(`(() => {
  const b = [...document.querySelectorAll('button[title]')].find(x => x.getAttribute('title') === 'Active Orders');
  if (b) { b.click(); return 'rail'; }
  const burger = document.querySelector('button[aria-label="Open navigation menu"]');
  if (burger) { burger.click(); return 'drawer-open'; }
  return 'not-found';
})()`);
if (navOrders === 'drawer-open') {
  await sleep(700);
  await evaluate(`(() => {
    const b = [...document.querySelectorAll('button[title]')].find(x => x.getAttribute('title') === 'Active Orders');
    if (b) b.click();
    return !!b;
  })()`);
}
await sleep(2500);
const billClicked = await evaluate(`(() => {
  const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Bill');
  if (!b) return false;
  b.click();
  return true;
})()`);
check(billClicked, 'the cashier Bill action is available on the order card');
await sleep(2500);
const overlay = await evaluate(`(() => {
  const t = document.body.innerText;
  return { payment: /PAYMENT|Collect Payment|Amount Received|Cash/i.test(t) };
})()`);
check(overlay.payment, 'the cashier payment overlay opened (checkout workflow intact)');

if (created) {
  await api('PATCH', `/orders/${created.id}/cancel`, { reason: 'QA checkout verification cleanup' }, token);
  await api('PATCH', `/kot/cancel-by-order/${created.id}`, { reason: 'QA checkout verification cleanup' }, token);
  await api('DELETE', `/orders/${created.id}`, undefined, token);
  const after = await api('GET', '/tables', undefined, token);
  const t2 = (after?.tables || []).find((t) => Number(t.id) === Number(table.id));
  check(t2?.status === 'AVAILABLE', `cleanup restored table ${table.tableNo} to AVAILABLE (${t2?.status})`);
}

const realErrors = errors.filter((e) => !/favicon|net::ERR_|Failed to load resource/i.test(e));
check(realErrors.length === 0, `no console errors (${realErrors.length})`);
realErrors.slice(0, 5).forEach((e) => console.log('     ! ' + e));

console.log(`\n  Total: ${pass + fail}   Passed: ${pass} ✅   Failed: ${fail} ${fail ? '❌' : '✅'}`);
ws.close(); chrome.kill();
await sleep(300);
process.exit(fail === 0 ? 0 : 1);
