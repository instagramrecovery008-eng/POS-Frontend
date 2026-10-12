/**
 * REAL-BROWSER QA — POS fixes (profile dropdown, dietary consistency, Lock Screen removal).
 *
 * Launches headless Chrome via CDP against the REAL running app:
 *   frontend dev server  http://localhost:3000
 *   backend              http://localhost:5001/api
 *
 * It seeds two restaurants through the real Super Admin onboarding API
 * (Restaurant A = VEG_ONLY, Restaurant B = VEG_AND_NON_VEG), changes each
 * admin's temporary password, then drives the actual UI:
 *   - real login form
 *   - sidebar has no "Lock Screen" entry
 *   - POS Settings Food Settings shows the persisted mode (A locked, B both)
 *   - Menu & Stock filter derives its options from the persisted mode
 *   - Add Menu Item hides Non-Veg for A
 *   - profile dropdown is a body portal, fully inside the viewport and on top
 *     of the page content, on POS Settings / Menu & Stock / Dashboard, after
 *     scrolling, and across phone / tablet / laptop / desktop viewports
 *   - logout returns to the login screen
 *
 * Requires BOTH dev servers already running (the harness does not start them):
 *   backend:  cd backend  && npm run dev
 *   frontend: cd frontend && npm run dev
 *
 * Run:      node scripts/qa-pos-fixes.mjs
 * Clean up: cd backend && node scripts/_qa_cleanup.js   (removes the seeded
 *           restaurants recorded in /tmp/qa-created.json)
 *
 * Exits non-zero when any check fails, and always tears Chrome down.
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// A brand-new Chrome profile per run: a reused profile keeps the previous run's
// localStorage (pos_token / pos_user), so the app restores a stale session and
// the login form never renders. Kept OUTSIDE the project — a Chrome profile
// inside frontend/ makes Vite's file watcher crash (EBUSY on locked files).
const CHROME_PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-pos-chrome-'));

const CHROME = 'C:\\Users\\Divyang\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
// The origin MUST be http://localhost:3000 — the app calls the backend at the
// absolute VITE_API_URL (http://localhost:5001/api), and the backend CORS
// allow-list only contains localhost, so http://127.0.0.1:3000 is blocked and
// every API call fails as an axios "Network Error".
const DEV = 'http://localhost:3000';
const API = 'http://localhost:5001/api';
const CDP_PORT = 9333;
const TMP_PASS = 'Temp#12345';
const NEW_PASS = 'QaPass#12345';

let pass = 0, fail = 0;
const check = (cond, msg, detail) => {
  process.stdout.write(cond ? '  ✅ ' : '  ❌ ');
  console.log(msg + (detail === undefined ? '' : ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`));
  cond ? pass++ : fail++;
};

const api = async (method, path, body, token) => {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let data = null;
  try { data = await res.json(); } catch (_) {}
  return { status: res.status, data };
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. Seed two restaurants through the real Super Admin onboarding API
// ─────────────────────────────────────────────────────────────────────────────
const created = [];
async function seed() {
  const sa = await api('POST', '/auth/login', { email: 'superadmin@pos.com', password: 'SuperAdmin@123' });
  check(sa.status === 200 && !!sa.data?.token, 'Super Admin login (API)');
  const saToken = sa.data.token;
  const plans = await api('GET', '/super-admin/plans', undefined, saToken);
  const plan = (plans.data?.plans || plans.data?.data || []).find((p) => p.businessMode === 'RESTAURANT' && p.isActive !== false)
    || (plans.data?.plans || plans.data?.data || [])[0];
  check(!!plan, 'a RESTAURANT plan exists', plan?.name);

  const stamp = Date.now().toString().slice(-8);
  const out = {};
  for (const [key, mode, digit] of [['A', 'VEG_ONLY', '5'], ['B', 'VEG_AND_NON_VEG', '6']]) {
    const adminEmail = `qa-browser-${mode.toLowerCase()}-${stamp}@example.com`;
    const create = await api('POST', '/super-admin/restaurants/onboarding', {
      name: `QA Browser ${mode} ${stamp}`,
      ownerName: 'QA Owner',
      mobile: digit + stamp + '55',
      email: `qa-br-${stamp}-${mode}@example.com`,
      businessType: 'RESTAURANT',
      dietaryMode: mode,
      adminName: 'QA Admin',
      adminEmail,
      adminPassword: TMP_PASS,
      planId: plan.id,
    }, saToken);
    const id = create.data?.data?.id ?? create.data?.id;
    check(create.status === 200 || create.status === 201, `onboarded Restaurant ${key} (${mode})`, create.status);
    if (!id) { console.error('onboard failed', JSON.stringify(create.data).slice(0, 300)); process.exit(1); }
    created.push({ id, adminEmail });

    // Real first-login flow: temp password → forced change → new password.
    const first = await api('POST', '/auth/login', { email: adminEmail, password: TMP_PASS });
    check(first.status === 200, `Restaurant ${key} admin first login`, first.status);
    const toChange = first.data?.mustChangePassword;
    let finalToken = first.data?.token;
    if (toChange) {
      const cp = await api('POST', '/auth/change-password', { currentPassword: TMP_PASS, newPassword: NEW_PASS }, finalToken);
      check(cp.status === 200, `Restaurant ${key} forced password change`, cp.status);
    }
    const relogin = await api('POST', '/auth/login', { email: adminEmail, password: NEW_PASS });
    check(relogin.status === 200 && !!relogin.data?.token, `Restaurant ${key} admin login with new password`, relogin.status);
    finalToken = relogin.data?.token;
    const snapshotMode = relogin.data?.settings?.dietaryMode;
    check(snapshotMode === mode, `Restaurant ${key} login snapshot carries the persisted mode`, snapshotMode);
    out[key] = { id, email: adminEmail, token: finalToken, mode };
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Chrome over CDP
// ─────────────────────────────────────────────────────────────────────────────
let ws, msgId = 0;
const pending = new Map();
const pageErrors = [];
const send = (method, params = {}) => new Promise((res) => {
  const id = ++msgId;
  pending.set(id, res);
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error('eval failed: ' + (r.result.exceptionDetails.text || '') + ' ' + (r.result.exceptionDetails.exception?.description || ''));
  return r.result?.result?.value;
};
const setViewport = async (w, h) => {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
};

// Hoisted so the finally block can always terminate Chrome, even on a crash.
let chrome = null;

// JS injected into the page for login + interaction helpers.
const HELPERS = `
  (() => {
    const setVal = (el, v) => {
      const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      s.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    window.__qa = {
      login(email, password) {
        const e = document.querySelector('input[placeholder="Enter email or user ID"]');
        const p = document.querySelector('input[placeholder="Enter password"]');
        if (!e || !p) return 'no-form';
        setVal(e, email); setVal(p, password);
        const btn = [...document.querySelectorAll('button')].find((b) => b.type === 'submit');
        if (!btn) return 'no-submit';
        btn.click();
        return 'submitted';
      },
      clickText(text, exact) {
        const els = [...document.querySelectorAll('button, a, [role="menuitem"], option')];
        const el = els.find((b) => exact ? b.textContent.trim() === text : b.textContent.includes(text));
        if (!el) return 'not-found:' + text;
        el.click();
        return 'clicked';
      },
      menuReport() {
        const menu = document.querySelector('[role="menu"]');
        if (!menu) return { present: false };
        const r = menu.getBoundingClientRect();
        const vw = window.innerWidth, vh = window.innerHeight;
        const inView = r.top >= 0 && r.left >= 0 && r.right <= vw + 0.5 && r.bottom <= vh + 0.5;
        const hitTop = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + 6));
        const hitBottom = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.bottom - 6));
        return {
          present: true,
          portal: menu.parentElement === document.body,
          rect: { top: Math.round(r.top), left: Math.round(r.left), right: Math.round(r.right), bottom: Math.round(r.bottom) },
          vw, vh,
          inView,
          onTop: !!hitTop && (menu.contains(hitTop) || hitTop === menu),
          bottomOnTop: !!hitBottom && (menu.contains(hitBottom) || hitBottom === menu),
          text: menu.innerText.replace(/\\s+/g, ' ').trim().slice(0, 200),
        };
      },
      sidebarText() {
        const aside = document.querySelector('aside');
        return aside ? aside.innerText.replace(/\\s+/g, ' ').trim() : '';
      },
      scrollMain(y) {
        const main = document.querySelector('main');
        if (!main) return 'no-main';
        main.scrollTop = y;
        return main.scrollTop;
      },
      bodyText() { return document.body.innerText.replace(/\\s+/g, ' '); },
      openProfile() {
        const b = document.querySelector('[aria-haspopup="menu"]');
        if (!b) return 'no-trigger';
        b.click();
        return 'clicked';
      },
      filterOptions() {
        const sel = document.querySelector('select[aria-label="Food type filter"]');
        if (!sel) return { present: false };
        return { present: true, disabled: sel.disabled, options: [...sel.options].map((o) => o.text) };
      },
      hasNonVegButton() {
        return [...document.querySelectorAll('button')].some((b) => /non-veg/i.test(b.textContent) && b.closest('[role="dialog"], form, div'));
      },
      loginVisible() {
        return !!document.querySelector('input[placeholder="Enter password"]');
      },
    };
    return 'ok';
  })()
`;

async function waitReady() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`).then((r) => r.json());
      const page = (list || []).find((t) => t.type === 'page');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch (_) {}
    await sleep(300);
  }
  return null;
}

async function gotoAndSettle(ms = 2500) {
  await sleep(ms);
}

// Poll a page expression until it is truthy. Fixed sleeps are unreliable here:
// Vite compiles the module graph on the first request (cold start can take tens
// of seconds), and a reload re-mounts the whole shell.
async function waitFor(expr, timeoutMs = 30000, stepMs = 300, label = '') {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    try { last = await evaluate(expr); if (last) return last; } catch (e) { last = 'eval-error: ' + e.message; }
    await sleep(stepMs);
  }
  if (label) {
    console.log(`    [timeout] ${label} → ${JSON.stringify(last)}`);
    try {
      const href = await evaluate('location.href');
      const text = await evaluate('document.body ? document.body.innerText.replace(/\\s+/g, " ").slice(0, 400) : "(no body)"');
      console.log(`    [page] ${href} :: ${text}`);
    } catch (_) {}
  }
  return false;
}
// Case-insensitive: card titles are CSS-uppercased, so innerText reports
// "FOOD SETTINGS" while the source says "Food Settings".
const waitText = (text, timeoutMs = 25000, label = text) =>
  waitFor(`document.body.innerText.toLowerCase().includes(${JSON.stringify(text.toLowerCase())})`,
    timeoutMs, 250, `text: ${label}`);
const waitShell = (label = 'shell') =>
  waitFor(`!!window.__qa && window.__qa.sidebarText().length > 0`, 45000, 400, label);
const waitGone = (selector, timeoutMs = 6000) =>
  waitFor(`!document.querySelector(${JSON.stringify(selector)})`, timeoutMs, 150, `gone: ${selector}`);

// Open the profile dropdown and return a settled menu report (or {present:false}).
// The trigger toggles, so retry once with a diagnostic: a click landing while
// the page is still re-mounting can leave the menu closed.
async function openAndReport(label, timeoutMs = 8000) {
  const triggerState = () => evaluate(`(() => {
    const b = document.querySelector('[aria-haspopup="menu"]');
    return { trigger: !!b, expanded: b ? b.getAttribute('aria-expanded') : null, menus: document.querySelectorAll('[role="menu"]').length };
  })()`);
  const openOnce = () => evaluate('window.__qa.openProfile()');
  const report = (t) => waitFor(`(() => { const m = window.__qa.menuReport(); return m.present ? m : false; })()`, t, 200, `menu: ${label}`);

  const before = await triggerState();
  await openOnce();
  let r = await report(timeoutMs);
  if (r) return r;

  const after = await triggerState();
  console.log(`    [diag] ${label}: before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
  await openOnce();
  r = await report(6000);
  return r || { present: false };
}

(async () => {
  console.log('\n=== Seeding restaurants through the real Super Admin API ===');
  const rest = await seed();

  console.log('\n=== Launching headless Chrome ===');
  chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-proxy-server',
    '--no-default-browser-check', '--disable-extensions',
    // Chrome resolves "localhost" to ::1 first, but the Vite dev server binds
    // IPv4 only (0.0.0.0), so the page failed with ERR_CONNECTION_REFUSED.
    // Keep the URL host as localhost (the backend CORS allow-list has
    // http://localhost:3000, not 127.0.0.1) and just force IPv4 resolution.
    '--host-resolver-rules=MAP localhost 127.0.0.1',
    `--remote-debugging-port=${CDP_PORT}`,
    '--window-size=1440,900',
    '--user-data-dir=' + CHROME_PROFILE,
    'about:blank',
  ], { stdio: 'ignore' });

  const wsUrl = await waitReady();
  if (!wsUrl) { console.error('Chrome CDP did not start'); chrome.kill(); process.exit(1); }
  ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    if (msg.method === 'Runtime.exceptionThrown') {
      pageErrors.push(msg.params?.exceptionDetails?.exception?.description || msg.params?.exceptionDetails?.text || 'exception');
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error') {
      pageErrors.push(msg.params.args?.map((a) => a.value || a.description || '').join(' '));
    }
  };
  await send('Runtime.enable');
  await send('Page.enable');
  // Install the QA helpers on EVERY document so they survive reloads.
  await send('Page.addScriptToEvaluateOnNewDocument', { source: HELPERS });

  // ── Restaurant A (Veg Only): real UI login ──
  console.log('\n=== Restaurant A (Veg Only) — real UI login ===');
  await setViewport(1440, 900);
  await send('Page.navigate', { url: DEV });
  const formReady = await waitFor(
    `!!window.__qa && !!document.querySelector('input[placeholder="Enter email or user ID"]')`,
    90000, 400, 'login form (cold first paint)');
  check(!!formReady, 'login form rendered on first paint');
  let loginClicked = await evaluate(`window.__qa.login(${JSON.stringify(rest.A.email)}, ${JSON.stringify(NEW_PASS)})`);
  check(loginClicked === 'submitted', 'login form submitted through the UI', loginClicked);
  check(!!(await waitShell('POS shell after login')), 'Restaurant A shell rendered after login');
  const aSidebar = await evaluate('window.__qa.sidebarText()');
  check(!/Lock Screen/i.test(aSidebar), 'Restaurant A sidebar has no Lock Screen entry');
  check(!(await evaluate('window.__qa.loginVisible()')), 'Restaurant A landed on the POS shell (not a lock/login screen)');

  // POS Settings → POS Screen Settings → Food Settings.
  // Food Settings lives under the "POS Screen Settings" section (the default
  // section is General), so the section has to be selected first.
  await evaluate(`window.__qa.clickText('POS Settings')`);
  await waitText('POS Screen Settings', 25000, 'POS Settings (A)');
  await evaluate(`window.__qa.clickText('POS Screen Settings')`);
  await waitText('Food Settings', 20000, 'POS Screen Settings / Food Settings (A)');
  const aSettings = await evaluate('window.__qa.bodyText()');
  check(/Food Settings/i.test(aSettings), 'Restaurant A POS Settings shows the Food Settings card');
  check(/Veg Only/i.test(aSettings), 'Restaurant A Food Settings shows Veg Only');
  check(/Configured/i.test(aSettings), 'Restaurant A Food Settings marks Veg Only as the configured mode');
  check(!/Veg \+ Non-Veg/i.test(aSettings), 'Restaurant A Food Settings does NOT offer Veg + Non-Veg');

  // Profile dropdown on POS Settings + after scroll
  let rep = await openAndReport('POS Settings');
  check(rep.present && rep.portal, 'Restaurant A profile menu is a body portal', rep.portal);
  check(!!rep.inView, 'Restaurant A profile menu is fully inside the viewport on POS Settings', rep.rect);
  check(!!(rep.onTop && rep.bottomOnTop), 'Restaurant A profile menu renders above the page content (not clipped/covered)');
  check((rep.text || '').includes(rest.A.email), 'Restaurant A profile menu shows the real email');
  check(/Admin/i.test(rep.text || ''), 'Restaurant A profile menu shows the real role');
  // close it
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
  const closed = await waitGone('[role="menu"]');
  check(closed === true, 'Restaurant A profile menu closes on Escape');

  await evaluate('window.__qa.scrollMain(600)');
  await gotoAndSettle(400);
  rep = await openAndReport('POS Settings after scroll');
  check(!!(rep.inView && rep.onTop), 'Restaurant A profile menu stays in view after scrolling', rep.rect);
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
  await waitGone('[role="menu"]');

  // Menu & Stock filter + Add Menu Item
  await evaluate(`window.__qa.clickText('Menu & Stock')`);
  await waitFor(`window.__qa.filterOptions().present`, 25000, 300, 'Menu & Stock (A)');
  const aFilter = await evaluate('window.__qa.filterOptions()');
  check(aFilter.present, 'Restaurant A Menu & Stock shows the dietary filter');
  check(Array.isArray(aFilter.options) && aFilter.options.length === 1 && aFilter.options[0] === 'Veg Only',
    'Restaurant A filter offers ONLY Veg Only (no Veg + Non-Veg / Non-Veg Only)', aFilter.options);
  check(aFilter.disabled === true, 'Restaurant A filter cannot be switched');
  const aMenuText = await evaluate('window.__qa.bodyText()');
  check(/Veg Only · set by the restaurant configuration/i.test(aMenuText), 'Restaurant A filter explains the configuration controls it');

  // Profile dropdown on Menu & Stock (scrollable page)
  rep = await openAndReport('Menu & Stock');
  check(!!(rep.inView && rep.onTop && rep.bottomOnTop), 'Restaurant A profile menu fully visible on Menu & Stock', rep.rect);
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
  await waitGone('[role="menu"]');

  // Add Menu Item
  const addClicked = await evaluate(`window.__qa.clickText('Add Item', false)`);
  await waitFor(`[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Cancel')`,
    8000, 200, 'Add Menu Item dialog');
  if (addClicked === 'clicked') {
    const addText = await evaluate('window.__qa.bodyText()');
    check(/Veg Only — all items are vegetarian|configured for Veg Only/i.test(addText), 'Restaurant A Add Menu Item explains Veg Only');
    const hasNonVeg = await evaluate(`(() => {
      const btns = [...document.querySelectorAll('button')];
      return btns.some((b) => /non-veg/i.test(b.textContent));
    })()`);
    check(!hasNonVeg, 'Restaurant A Add Menu Item hides the Non-Veg option');
    await evaluate(`window.__qa.clickText('Cancel', true)`);
    await gotoAndSettle(500);
  } else {
    check(false, 'Restaurant A Add Menu Item could be opened', addClicked);
  }

  // Dashboard dropdown
  await evaluate(`window.__qa.clickText('Dashboard Overview')`);
  await waitText('Dashboard', 25000, 'Dashboard (A)');
  rep = await openAndReport('Dashboard');
  check(!!(rep.inView && rep.onTop), 'Restaurant A profile menu fully visible on Dashboard', rep.rect);
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
  await waitGone('[role="menu"]');

  // Refresh → mode persists
  await send('Page.reload', { ignoreCache: true });
  await waitShell('shell after refresh (A)');
  // Let the session-restore redirect land on the role home screen before
  // navigating — a click issued during that redirect gets overwritten.
  await gotoAndSettle(2500);
  await evaluate(`window.__qa.clickText('POS Settings')`);
  await waitText('POS Screen Settings', 25000, 'POS Settings after refresh (A)');
  await evaluate(`window.__qa.clickText('POS Screen Settings')`);
  await waitText('Food Settings', 20000, 'Food Settings after refresh (A)');
  const aAfterReload = await evaluate('window.__qa.bodyText()');
  check(/Veg Only/i.test(aAfterReload) && !/Veg \+ Non-Veg/i.test(aAfterReload), 'Restaurant A Veg Only persists after a refresh');

  // ── Viewports ──
  console.log('\n=== Profile dropdown across viewports (POS Settings) ===');
  for (const [label, w, h] of [
    ['mobile portrait 375x812', 375, 812],
    ['tablet portrait 820x1180', 820, 1180],
    ['tablet landscape 1180x820', 1180, 820],
    ['laptop 1440x900', 1440, 900],
    ['desktop 1920x1080', 1920, 1080],
  ]) {
    await setViewport(w, h);
    await gotoAndSettle(600);
    await send('Page.reload', { ignoreCache: false });
    await waitShell(`shell (${label})`);
    await gotoAndSettle(2500);
    await evaluate(`window.__qa.clickText('POS Settings')`);
    await waitText('POS Screen Settings', 25000, `POS Settings (${label})`);
    await evaluate(`window.__qa.clickText('POS Screen Settings')`);
    await waitText('Food Settings', 20000, `Food Settings (${label})`);
    const r = await openAndReport(label);
    check(r.present && r.inView && r.onTop && r.bottomOnTop, `dropdown fully in viewport — ${label}`, r.rect);
    await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
    await waitGone('[role="menu"]');
  }

  await setViewport(1440, 900);
  await gotoAndSettle(400);
  await send('Page.reload', { ignoreCache: false });
  await waitShell('shell before logout');

  // ── Logout via the profile dropdown ──
  console.log('\n=== Logout ===');
  await openAndReport('logout');
  const signOutClicked = await evaluate(`window.__qa.clickText('Sign Out', false)`);
  check(signOutClicked === 'clicked', 'Sign Out clicked from the profile dropdown', signOutClicked);
  const backToLogin = await waitFor(`window.__qa.loginVisible()`, 15000, 300, 'login screen after logout');
  check(!!backToLogin, 'logout returns to the login screen');

  // ── Restaurant B (Veg + Non-Veg) ──
  console.log('\n=== Restaurant B (Veg + Non-Veg) — real UI login ===');
  await waitFor(`window.__qa.loginVisible()`, 20000, 300, 'login form for B');
  await evaluate(`window.__qa.login(${JSON.stringify(rest.B.email)}, ${JSON.stringify(NEW_PASS)})`);
  await waitShell('POS shell after B login');
  const bSidebar = await evaluate('window.__qa.sidebarText()');
  check(!/Lock Screen/i.test(bSidebar), 'Restaurant B sidebar has no Lock Screen entry');
  await evaluate(`window.__qa.clickText('POS Settings')`);
  await waitText('POS Screen Settings', 25000, 'POS Settings (B)');
  await evaluate(`window.__qa.clickText('POS Screen Settings')`);
  await waitText('Food Settings', 20000, 'Food Settings (B)');
  const bSettings = await evaluate('window.__qa.bodyText()');
  check(/Veg \+ Non-Veg/i.test(bSettings), 'Restaurant B Food Settings offers Veg + Non-Veg');
  check(/Veg Only/i.test(bSettings), 'Restaurant B Food Settings also offers Veg Only');
  await evaluate(`window.__qa.clickText('Menu & Stock')`);
  await waitFor(`window.__qa.filterOptions().present`, 25000, 300, 'Menu & Stock (B)');
  const bFilter = await evaluate('window.__qa.filterOptions()');
  check(bFilter.present && bFilter.disabled === false, 'Restaurant B filter is enabled');
  check(Array.isArray(bFilter.options) && bFilter.options.length === 3,
    'Restaurant B filter offers Veg + Non-Veg / Veg Only / Non-Veg Only', bFilter.options);

  // ── Console errors ──
  console.log('\n=== Runtime errors ===');
  const realErrors = pageErrors.filter((e) => !/Download the React DevTools|favicon|Failed to load resource/i.test(e));
  check(realErrors.length === 0, 'no runtime/console errors during the QA session', realErrors.slice(0, 3));

  console.log(`\n  BROWSER QA → ${pass} passed, ${fail} failed`);
  ws.close();
  chrome.kill();
  process.exitCode = fail > 0 ? 1 : 0;
})().catch(async (e) => {
  console.error('QA HARNESS ERROR:', e);
  if (pageErrors.length) console.error('PAGE ERRORS:\n - ' + pageErrors.slice(0, 5).join('\n - '));
  process.exitCode = 2;
}).finally(async () => {
  // The QA restaurants are removed afterwards by the backend cleanup command
  // (see the run instructions) — the frontend project has no Prisma client.
  console.log('\n  QA_RESTAURANTS=' + JSON.stringify(created));
  try { const fs = await import('node:fs'); fs.writeFileSync('/tmp/qa-created.json', JSON.stringify(created)); } catch (_) {}
  // Always tear Chrome down — otherwise its child process keeps the event loop
  // alive and the harness appears to hang after the last check.
  try { ws?.close(); } catch (_) {}
  try { chrome?.kill(); } catch (_) {}
  // Best-effort: Chrome may still hold locks for a moment after the kill.
  try { await sleep(1500); fs.rmSync(CHROME_PROFILE, { recursive: true, force: true }); } catch (_) {}
  process.exit(process.exitCode || 0);
});
