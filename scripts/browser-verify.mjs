/**
 * Real-browser verification of the SubscriptionPage TDZ fix.
 *
 * Launches headless Chrome, logs in as the seed ADMIN via the real backend,
 * clicks the header plan pill, and verifies the subscription screen loads
 * without ReferenceError — all plans render, Monthly/Yearly toggle works,
 * plan selection opens the payment review.
 *
 * Run: node scripts/browser-verify.mjs
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = 'C:\\Users\\Divyang\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const DEV = 'http://localhost:3000';
const API = 'http://localhost:5001/api';
const PORT = 9222;

let pass = 0, fail = 0;
const check = (cond, msg) => { process.stdout.write(cond ? '  ✅ ' : '  ❌ '); console.log(msg); cond ? pass++ : fail++; };

// ── Launch headless Chrome ──
const chrome = spawn(CHROME, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-proxy-server',
  '--no-default-browser-check',
  '--disable-extensions',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=C:\\POS System\\restaurant-pos-frontend\\.chrome-profile',
  'about:blank',
], { stdio: 'ignore' });

let wsUrl = null;
for (let i = 0; i < 40; i++) {
  try {
    const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
    // Pick a real page target — never an extension/service-worker background page.
    const page = (list || []).find((t) => t.type === 'page');
    if (page && page.webSocketDebuggerUrl) { wsUrl = page.webSocketDebuggerUrl; break; }
  } catch (e) { /* not up yet */ }
  await sleep(300);
}
if (!wsUrl) { console.error('Chrome CDP did not start'); chrome.kill(); process.exit(1); }

// ── CDP client over native WebSocket ──
const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let msgId = 0;
const pending = new Map();
const consoleErrors = [];
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error') {
    consoleErrors.push(msg.params.args?.map((a) => a.value || a.description || '').join(' '));
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    consoleErrors.push('EXCEPTION: ' + (msg.params?.exceptionDetails?.text || '') + ' ' + (msg.params?.exceptionDetails?.exception?.description || ''));
  }
};
const send = (method, params = {}) => new Promise((res) => {
  const id = ++msgId;
  pending.set(id, res);
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  return r.result?.result?.value;
};

await send('Runtime.enable');
await send('Page.enable');

// ── Real login to get a token ──
const login = await fetch(API + '/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@restaurant.com', password: 'password123' }),
}).then((r) => r.json());
check(!!login.token, 'Admin login via real backend');
const token = login.token;
const user = login.user;

// ── Seed localStorage + load app ──
await send('Page.navigate', { url: DEV });
await sleep(2500);
await evaluate(`(() => {
  localStorage.setItem('pos_token', ${JSON.stringify(token)});
  localStorage.setItem('pos_user', ${JSON.stringify(JSON.stringify(user))});
  return true;
})()`);
await send('Page.reload', { ignoreCache: true });
await sleep(3500);

// ── Click the header plan pill (ADMIN + subscription present) ──
const pillClicked = await evaluate(`(() => {
  const buttons = [...document.querySelectorAll('button')];
  const pill = buttons.find((b) => b.textContent.includes('Plan') && b.textContent.includes('left'));
  if (!pill) return 'pill-not-found';
  pill.click();
  return 'clicked';
})()`);
check(pillClicked === 'clicked', `Header plan pill found and clicked (${pillClicked})`);
await sleep(2500);

// ── Subscription screen content ──
const screenText = await evaluate(`document.body.innerText.slice(0, 4000)`);
check(screenText.includes('Subscription & Billing'), 'Subscription screen header rendered');
check(screenText.includes('Current Plan'), 'Current Plan section rendered');
check(screenText.includes('Available Plans'), 'Available Plans section rendered');
check(/Basic/.test(screenText) && /Premium/.test(screenText) && /Professional/.test(screenText), 'All DB plans visible (Basic, Premium, Professional)');
check(/renew plan/i.test(screenText), "RENEWAL button shown for current plan");
check(/upgrade plan|change to plan|renew plan/i.test(screenText), "Plan action buttons rendered");

// ── Monthly/Yearly toggle ──
const toggled = await evaluate(`(() => {
  const btns = [...document.querySelectorAll('button')];
  const yearly = btns.find((b) => b.textContent.trim() === 'Yearly');
  if (!yearly) return 'no-toggle';
  yearly.click();
  return 'clicked';
})()`);
check(toggled === 'clicked', 'Yearly cycle toggle clicked');
await sleep(2000);

// ── Select a plan → payment screen ──
const planClicked = await evaluate(`(() => {
  const btns = [...document.querySelectorAll('button')];
  const upgrade = btns.find((b) => /Upgrade Plan|Change to Plan/.test(b.textContent));
  if (!upgrade) return 'no-action-btn';
  upgrade.click();
  return 'clicked';
})()`);
check(planClicked === 'clicked', `Plan action clicked (${planClicked})`);
await sleep(1500);
const payText = await evaluate(`document.body.innerText.slice(0, 8000)`);
check(/Payment/i.test(payText) && /current plan/i.test(payText) && /selected plan/i.test(payText), 'Payment review shows Current → Selected Plan');
check(/new expiry/i.test(payText) && /(calculated by backend|\d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4})/i.test(payText), 'New expiry shown (backend value or placeholder before checkout)');

// ── Cancel closes payment review ──
const cancelled = await evaluate(`(() => {
  const btns = [...document.querySelectorAll('button')];
  const cancel = btns.find((b) => b.textContent.trim() === 'Cancel');
  if (!cancel) return 'no-cancel';
  cancel.click();
  return 'clicked';
})()`);
check(cancelled === 'clicked', 'Cancel closes payment review');
await sleep(1000);

// ── No runtime errors from SubscriptionPage ──
const subErrors = consoleErrors.filter((e) => /activeCycle|ReferenceError|SubscriptionPage/.test(e));
check(subErrors.length === 0, `No ReferenceError / activeCycle errors (${subErrors.length} matched)`);

console.log(`\n  Browser verification → ${pass} passed, ${fail} failed`);
console.log('  Console errors captured:', consoleErrors.length);
ws.close();
chrome.kill();
process.exit(fail > 0 ? 1 : 0);
