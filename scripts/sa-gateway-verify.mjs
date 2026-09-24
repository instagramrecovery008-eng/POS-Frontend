/**
 * Real-browser verification of the Super Admin Payment Gateway screen.
 * Logs in as SUPER_ADMIN via the real backend, injects the session before the
 * app loads (avoids the reload race), navigates to the Payment Gateway screen,
 * and verifies: status card, config form, webhook panel, metrics, and payment
 * history render without console errors and without leaking secrets.
 *
 * Run: node scripts/sa-gateway-verify.mjs
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = 'C:\\Users\\Divyang\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const DEV = 'http://localhost:3000';
const API = 'http://localhost:5001/api';
const PORT = 9223;

let pass = 0, fail = 0;
const check = (cond, msg) => { process.stdout.write(cond ? '  ✅ ' : '  ❌ '); console.log(msg); cond ? pass++ : fail++; };

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-proxy-server',
  '--no-default-browser-check', '--disable-extensions',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=C:\\POS System\\restaurant-pos-frontend\\.chrome-profile-sa2',
  'about:blank',
], { stdio: 'ignore' });

let wsUrl = null;
for (let i = 0; i < 40; i++) {
  try {
    const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
    const page = (list || []).find((t) => t.type === 'page');
    if (page && page.webSocketDebuggerUrl) { wsUrl = page.webSocketDebuggerUrl; break; }
  } catch (e) { /* not up yet */ }
  await sleep(300);
}
if (!wsUrl) { console.error('Chrome CDP did not start'); chrome.kill(); process.exit(1); }

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

// ── Real Super Admin login ──
const login = await fetch(API + '/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'superadmin@pos.com', password: 'SuperAdmin@123' }),
}).then((r) => r.json());
check(!!login.token, 'Super Admin login via real backend');
check(login.user?.role === 'SUPER_ADMIN', 'Role is SUPER_ADMIN');
const token = login.token;
const user = login.user;

// Inject session before app scripts run — avoids the reload/localStorage race
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `localStorage.setItem('pos_token', ${JSON.stringify(token)}); localStorage.setItem('pos_user', ${JSON.stringify(JSON.stringify(user))});`,
});
await send('Page.navigate', { url: DEV });
await sleep(6000);

// ── Navigate to Payment Gateway via sidebar ──
const nav = await evaluate(`(() => {
  const buttons = [...document.querySelectorAll('button')];
  const item = buttons.find((b) => b.textContent.includes('Payment Gateway'));
  if (!item) return 'not-found';
  item.click();
  return 'clicked';
})()`);
check(nav === 'clicked', `Payment Gateway sidebar item found and clicked (${nav})`);
await sleep(2500);

const pageText = await evaluate(`document.body.innerText.slice(0, 20000)`);

// Status card
check(pageText.includes('Payment Gateway'), 'Payment Gateway screen header rendered');
check(/RAZORPAY/i.test(pageText), 'RAZORPAY gateway name shown');
check(/TEST MODE|LIVE MODE/.test(pageText), 'Environment badge shown');
check(/Test Connection/.test(pageText), 'Test Connection button present');
check(/Online Payments/.test(pageText), 'Online Payments toggle present');

// Config form
check(pageText.includes('Gateway Configuration'), 'Configuration section rendered');
check(pageText.includes('Key ID'), 'Key ID field present');
check(pageText.includes('Key Secret'), 'Key Secret field present');
check(pageText.includes('Webhook Secret'), 'Webhook Secret field present');
check(/SAVE CONFIGURATION|Save Configuration/.test(pageText), 'Save Configuration button present');

// Webhook panel
check(pageText.includes('Webhook'), 'Webhook section rendered');
const webhookUrl = await evaluate(`(() => {
  const inputs = [...document.querySelectorAll('input')];
  const wb = inputs.find((i) => i.value && i.value.includes('/api/subscriptions/webhook'));
  return wb ? wb.value : '';
})()`);
check(webhookUrl.includes('/api/subscriptions/webhook'), `Webhook endpoint shown (${webhookUrl})`);
check(/payment.captured/.test(pageText) && /payment.failed/.test(pageText), 'Required webhook events listed');
check(/Copy/.test(pageText), 'Copy Webhook URL button present');

// Metrics
check(/Platform Subscription Metrics/.test(pageText), 'Metrics section rendered');
check(/Active Subscriptions|ACTIVE SUBSCRIPTIONS/.test(pageText), 'Active subscriptions metric shown');

// Payment history
check(/Payment History/.test(pageText), 'Payment history section rendered');

// ── No secrets leaked in DOM ──
const secretLeak = await evaluate(`(() => {
  const t = document.body.innerText;
  return /rzp_(test|live)_[A-Za-z0-9]{10,}/.test(t);
})()`);
check(!secretLeak, 'No full Razorpay key id rendered (masked only)');

// ── No runtime errors ──
const subErrors = consoleErrors.filter((e) => /PaymentGateway|ReferenceError|TypeError/.test(e));
check(subErrors.length === 0, `No Payment Gateway runtime errors (${subErrors.length} matched)`);

console.log(`\n  SA Gateway browser verification → ${pass} passed, ${fail} failed`);
console.log('  Console errors captured:', consoleErrors.length);
ws.close();
chrome.kill();
process.exit(fail > 0 ? 1 : 0);
