/**
 * Manager "Reset Password" — real-browser verification.
 *
 * Drives the exact flow an operator (and the manager) uses:
 *   1. ADMIN resets a MANAGER's password from the roster API (same call the
 *      Staff Roster "Reset Password" modal makes).
 *   2. The manager signs in through the LOGIN FORM with the new temporary
 *      password.
 *   3. The forced password-change screen appears (and the POS is NOT reachable)
 *      because the reset flagged mustChangePassword.
 *   4. The manager sets their own password; the app returns to the login screen.
 *   5. The manager signs in with their own password and the POS shell renders.
 *
 * The manager's original password is restored at the end (API), so the demo
 * credentials stay usable. Requires the Vite dev server on :3000 and the
 * backend on :5001.
 *
 * Run: node scripts/manager-reset-flow-verify.mjs
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = process.env.CHROME_PATH
  || 'C:\\Users\\Divyang\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const DEV = 'http://localhost:3000';
const API = 'http://localhost:5001/api';
const PORT = 9226;

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@restaurant.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'password123';
const MANAGER_EMAIL = process.env.MANAGER_EMAIL || 'manager@restaurant.com';
const MANAGER_ORIGINAL = process.env.MANAGER_PASSWORD || 'password123';
const TEMP_PASSWORD = 'ResetTemp#2026';
const MANAGER_OWN_PASSWORD = 'ManagerOwn#2026';

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
  return { status: res.status, data };
};

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-proxy-server',
  '--no-default-browser-check', '--disable-extensions',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=C:\\\\POS System\\\\restaurant-pos-frontend\\\\.chrome-profile-manager-reset',
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

// React-controlled inputs need the native setter + an input event.
const TYPE_INTO = (selectorExpr, value) => `(() => {
  const el = ${selectorExpr};
  if (!el) return false;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, ${JSON.stringify(value)});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
})()`;

const login = async (email, password) => {
  await evaluate(TYPE_INTO(`document.querySelector('input[placeholder="you@restaurant.com"]')`, email));
  await evaluate(TYPE_INTO(`document.querySelector('input[placeholder="Enter your password"]')`, password));
  await sleep(200);
  await evaluate(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Log In');
    if (b) b.click();
    return !!b;
  })()`);
};

let managerId = null;
const restoreOriginalPassword = async () => {
  // Works whether the flow completed (own password active) or not (temp active).
  for (const candidate of [MANAGER_OWN_PASSWORD, TEMP_PASSWORD, MANAGER_ORIGINAL]) {
    const l = await api('POST', '/auth/login', { email: MANAGER_EMAIL, password: candidate });
    if (l.status === 200 && l.data?.token) {
      if (candidate === MANAGER_ORIGINAL) return true;
      const changed = await api('POST', '/auth/change-password', {
        currentPassword: candidate, newPassword: MANAGER_ORIGINAL,
      }, l.data.token);
      if (changed.status === 200) return true;
    }
  }
  return false;
};

try {
  // ── 1. ADMIN resets the manager's password (same call as the roster modal) ──
  const admin = await api('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  check(admin.status === 200 && !!admin.data?.token, `ADMIN session established (${admin.status})`);
  if (!admin.data?.token) throw new Error('admin login failed');
  const adminToken = admin.data.token;

  const list = await api('GET', '/users?limit=100', undefined, adminToken);
  const manager = (list.data?.data?.users || list.data?.users || []).find(
    (u) => u.email === MANAGER_EMAIL && u.role === 'MANAGER'
  );
  check(!!manager, `roster exposes MANAGER ${MANAGER_EMAIL} (id=${manager?.id})`);
  if (!manager) throw new Error('manager not found');
  managerId = Number(manager.id);

  const reset = await api('PATCH', `/users/${managerId}/password`, { newPassword: TEMP_PASSWORD }, adminToken);
  check(reset.status === 200 && reset.data?.success === true, `admin reset succeeds (HTTP ${reset.status})`);

  // ── 2. The manager signs in through the login form ─────────────────────────
  await send('Page.navigate', { url: DEV });
  await sleep(2500);
  await evaluate('(() => { localStorage.clear(); return true; })()');
  await send('Page.reload', { ignoreCache: true });
  await sleep(4000);
  await send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 820, deviceScaleFactor: 1, mobile: false });
  await sleep(500);

  const onLogin = await evaluate(`!!document.querySelector('input[placeholder="Enter your password"]')`);
  check(onLogin, 'the login screen is shown');
  await login(MANAGER_EMAIL, TEMP_PASSWORD);
  await sleep(5000);

  const forced = await evaluate(`(() => {
    const t = document.body.innerText;
    return {
      forced: /Change your password/i.test(t) && /temporary password/i.test(t),
      submit: !!([...document.querySelectorAll('button')].find(b => b.textContent.includes('Set new password'))),
      tempField: !!document.querySelector('input[placeholder="Enter your temporary password"]'),
      posShell: !!document.querySelector('aside') && /Dashboard|POS|Orders/i.test(t),
    };
  })()`);
  check(forced.forced, 'the forced password-change screen is shown after login');
  check(forced.tempField, 'it asks for the temporary password the admin handed over');
  check(!forced.posShell, 'the POS shell is NOT reachable while the temporary password is in use');

  // ── 3. The manager sets their own password ─────────────────────────────────
  const filled = await evaluate(`(() => {
    const setVal = (el, v) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const inputs = [...document.querySelectorAll('input')];
    const temp = document.querySelector('input[placeholder="Enter your temporary password"]');
    const fresh = document.querySelector('input[placeholder="Choose a strong password"]');
    const confirm = document.querySelector('input[placeholder="Repeat the new password"]');
    if (!temp || !fresh || !confirm) return { ok: false, count: inputs.length };
    setVal(temp, ${JSON.stringify(TEMP_PASSWORD)});
    setVal(fresh, ${JSON.stringify(MANAGER_OWN_PASSWORD)});
    setVal(confirm, ${JSON.stringify(MANAGER_OWN_PASSWORD)});
    return { ok: true, count: inputs.length };
  })()`);
  check(filled.ok, `the change form exposes the three password fields (${filled.count} inputs)`);
  await sleep(300);
  await evaluate(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('Set new password'));
    if (b) b.click();
    return !!b;
  })()`);
  await sleep(6000);

  const afterChange = await evaluate(`(() => {
    const t = document.body.innerText;
    return {
      loginScreen: !!document.querySelector('input[placeholder="Enter your password"]'),
      loggedOut: !localStorage.getItem('pos_token'),
      text: t.slice(0, 120),
    };
  })()`);
  check(afterChange.loginScreen && afterChange.loggedOut, 'after the change the manager is signed out and returned to login');

  // ── 4. Sign in with the manager's own password ─────────────────────────────
  await login(MANAGER_EMAIL, MANAGER_OWN_PASSWORD);
  await sleep(6000);
  const shell = await evaluate(`(() => {
    const t = document.body.innerText;
    return {
      loginScreen: !!document.querySelector('input[placeholder="Enter your password"]'),
      user: JSON.parse(localStorage.getItem('pos_user') || 'null'),
      shell: !!document.querySelector('aside') || /Dashboard|POS|Orders/i.test(t),
    };
  })()`);
  check(!shell.loginScreen && shell.shell, 'the manager reaches the POS shell with their own password');
  check(shell.user?.mustChangePassword !== true, 'the session reports no pending forced change');

  // The old temporary password must no longer work.
  const tempLogin = await api('POST', '/auth/login', { email: MANAGER_EMAIL, password: TEMP_PASSWORD });
  check(tempLogin.status === 401, `the admin's temporary password is retired (HTTP ${tempLogin.status})`);

  const realErrors = errors.filter((e) => !/favicon|net::ERR_|Failed to load resource|PASSWORD_CHANGE_REQUIRED|403/i.test(e));
  check(realErrors.length === 0, `no unexpected console errors (${realErrors.length})`);
  realErrors.slice(0, 5).forEach((e) => console.log('     ! ' + e));
} catch (e) {
  check(false, `flow crashed: ${e.message}`);
}

// ── 5. Restore the demo credentials ──────────────────────────────────────────
const restored = await restoreOriginalPassword();
check(restored, `manager's original password restored (${MANAGER_ORIGINAL})`);
const finalLogin = await api('POST', '/auth/login', { email: MANAGER_EMAIL, password: MANAGER_ORIGINAL });
check(finalLogin.status === 200, `demo manager login works again (HTTP ${finalLogin.status})`);

console.log(`\n  Total: ${pass + fail}   Passed: ${pass} ✅   Failed: ${fail} ${fail ? '❌' : '✅'}`);
ws.close(); chrome.kill();
await sleep(300);
process.exit(fail === 0 ? 0 : 1);
