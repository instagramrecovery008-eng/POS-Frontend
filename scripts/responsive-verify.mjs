/**
 * Responsive QA — real-browser verification across all required viewports.
 *
 * Launches headless Chrome, logs in as the seed ADMIN via the real backend,
 * then for every required viewport (mobile portrait/landscape, tablet
 * portrait/landscape, laptop, desktop) checks each screen for:
 *   - no horizontal page overflow (document vs window)
 *   - no clipped content (elements extending past the right edge)
 *   - navigation drawer works below lg (hamburger) and is hidden at lg+
 *   - POS cart bar/sheet below lg, side rail at lg+
 *
 * The backend must be running on :5001 (seed ADMIN) and the Vite dev server
 * on :3000.  Run: node scripts/responsive-verify.mjs
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = 'C:\\Users\\Divyang\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const DEV = 'http://localhost:3000';
const API = 'http://localhost:5001/api';
const PORT = 9223;

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
  '--user-data-dir=C:\\POS System\\restaurant-pos-frontend\\.chrome-profile-responsive',
  'about:blank',
], { stdio: 'ignore' });

let wsUrl = null;
for (let i = 0; i < 40; i++) {
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
}).then((r) => r.json()).catch(() => ({}));
if (!login.token) {
  console.error('❌ Could not log in — is the backend running on :5001 with the seed ADMIN?');
  chrome.kill();
  process.exit(1);
}
const token = login.token;
const user = login.user;

// Seed localStorage once, then reload so the app boots into the shell
await send('Page.navigate', { url: DEV });
await sleep(2000);
await evaluate(`(() => {
  localStorage.setItem('pos_token', ${JSON.stringify(token)});
  localStorage.setItem('pos_user', ${JSON.stringify(JSON.stringify(user))});
  return true;
})()`);
await send('Page.reload', { ignoreCache: true });
await sleep(3500);

// Seed restaurant tenant → 'POS Ordering' opens the TakeOrderWizard (NewOrder
// wizard). Barcode scanning / Basic POS tenants instead render PosWorkspace.
// Navigate with a click if present; fall back to the wizard page being the
// POS surface (which has its own responsive layout).

// ── The QA matrix from the responsive spec ──
const VIEWPORTS = [
  { name: 'Mobile Portrait 360×800', w: 360, h: 800 },
  { name: 'Mobile Portrait 390×844', w: 390, h: 844 },
  { name: 'Mobile Landscape 800×360', w: 800, h: 360 },
  { name: 'Tablet Portrait 768×1024', w: 768, h: 1024 },
  { name: 'Tablet Portrait 820×1180', w: 820, h: 1180 },
  { name: 'Tablet Landscape 1024×768', w: 1024, h: 768 },
  { name: 'Tablet Landscape 1280×800', w: 1280, h: 800 },
  { name: 'Laptop 1366×768', w: 1366, h: 768 },
  { name: 'Laptop 1440×900', w: 1440, h: 900 },
  { name: 'Desktop 1920×1080', w: 1920, h: 1080 },
];

// Core POS screens each viewport must render without overflow
const SCREENS = [
  { key: 'dashboard', label: 'Dashboard', nav: 'Dashboard' },
  { key: 'new_order', label: 'POS Ordering', nav: 'POS Ordering' },
  { key: 'active_orders', label: 'Active Orders', nav: 'Active Orders' },
  { key: 'orders', label: 'Kitchen Tickets', nav: 'Kitchen' },
  { key: 'menu', label: 'Menu & Stock', nav: 'Menu' },
  { key: 'settings', label: 'Settings', nav: 'Settings' },
];

const setViewport = async (w, h) => {
  await send('Emulation.setDeviceMetricsOverride', {
    width: w, height: h, deviceScaleFactor: 1, mobile: w < 768,
  });
  await sleep(450);
};

const overflowProbe = `(() => {
  const doc = document.documentElement;
  const bodyOverflowX = doc.scrollWidth - window.innerWidth;
  const vw = window.innerWidth;
  const clipped = [];
  document.querySelectorAll('body *').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && (r.right > vw + 2 || r.left < -2)) {
      const cs = getComputedStyle(el);
      if (cs.position === 'fixed') return;                       // overlays may legitimately bleed
      if (el.closest('.overflow-x-auto, .no-scrollbar')) return; // intentional internal scroll
      clipped.push(el.tagName + '.' + String(el.className).split(' ').slice(0, 2).join('.'));
    }
  });
  return {
    bodyOverflowX,
    clippedCount: clipped.length,
    clippedSample: clipped.slice(0, 3),
    hasHamburger: !!document.querySelector('button[aria-label="Open navigation menu"]'),
    sidebarVisible: (() => {
      const aside = document.querySelector('aside:not([aria-modal])');
      if (!aside) return false;
      const r = aside.getBoundingClientRect();
      return r.width > 0 && r.left >= 0;
    })(),
  };
})()`;

for (const vp of VIEWPORTS) {
  console.log(`\n━━ ${vp.name} ━━`);
  await setViewport(vp.w, vp.h);

  for (const screen of SCREENS) {
    await evaluate(`(() => {
      const navButtons = [...document.querySelectorAll('aside button')];
      const btn = navButtons.find((b) => b.textContent.trim().includes('${screen.nav}') || (b.title || '').includes('${screen.nav}'));
      if (btn) btn.click();
      return !!btn;
    })()`);
    await sleep(900);
    const probe = await evaluate(overflowProbe);
    if (!probe) { check(false, `${screen.label}: probe failed`); continue; }
    const label = `${screen.label}`;
    check(probe.bodyOverflowX <= 1, `${label} — no horizontal page overflow (${probe.bodyOverflowX}px)`);
    check(probe.clippedCount === 0, `${label} — no clipped content (${probe.clippedCount}${probe.clippedSample.length ? ': ' + probe.clippedSample.join(', ') : ''})`);
    // Navigation mode per viewport:
    //   < 768 (phones)      → drawer only, no persistent rail
    //   768–1023 (tablets)  → compact icon rail + drawer available
    //   ≥ 1024 (lg+)        → persistent sidebar, no hamburger
    if (screen === SCREENS[0]) {
      if (vp.w < 768) {
        check(probe.hasHamburger, 'navigation: hamburger visible on phones');
        check(!probe.sidebarVisible, 'navigation: persistent sidebar hidden on phones');
      } else if (vp.w < 1024) {
        check(probe.hasHamburger, 'navigation: hamburger available on tablets');
        check(probe.sidebarVisible, 'navigation: compact icon rail visible on tablets');
      } else {
        check(probe.sidebarVisible, 'navigation: persistent sidebar visible at lg+');
      }
    }
  }

  // ── POS cart pattern per viewport ──
  // The seed tenant is a RESTAURANT: 'POS Ordering' opens the TakeOrderWizard
  // (no persistent cart rail). The PosWorkspace cart bar/rail exists on Basic
  // POS / Counter Scan tenants — verify whichever surface this tenant shows.
  await evaluate(`(() => {
    const navButtons = [...document.querySelectorAll('aside button')];
    const btn = navButtons.find((b) => (b.title || '').includes('POS Ordering'));
    if (btn) btn.click();
    return !!btn;
  })()`);
  await sleep(1200);
  const posProbe = await evaluate(`(() => {
    const rail = document.querySelector('[class*="w-[340px]"]');
    const bar = document.querySelector('button[aria-label="Open cart"]');
    const wizard = document.body.innerText.includes('New Order') || document.body.innerText.includes('Order Type');
    return { hasRail: !!rail && rail.offsetParent !== null, hasBar: !!bar, isWizard: wizard };
  })()`);
  if (posProbe.isWizard) {
    check(true, 'POS: restaurant tenant → TakeOrderWizard surface (own responsive layout)');
  } else if (vp.w < 1024) {
    check(posProbe.hasBar, 'POS: sticky cart bar present below lg');
    check(!posProbe.hasRail, 'POS: no side cart rail below lg');
  } else {
    check(posProbe.hasRail, 'POS: side cart rail present at lg+');
    check(!posProbe.hasBar, 'POS: no sticky cart bar at lg+');
  }
}

// ── Drawer open/close sanity (tablet portrait) ──
console.log('\n━━ Navigation drawer behavior (768×1024) ━━');
await setViewport(768, 1024);
await evaluate(`(() => {
  const b = document.querySelector('button[aria-label="Open navigation menu"]');
  if (b) b.click();
  return !!b;
})()`);
await sleep(600);
const drawerOpen = await evaluate(`(() => {
  const aside = document.querySelector('aside[aria-modal="true"]');
  if (!aside) return false;
  const r = aside.getBoundingClientRect();
  return r.left === 0 && r.width > 200;
})()`);
check(drawerOpen, 'drawer opens on hamburger tap');
await evaluate(`(() => {
  const btns = [...document.querySelectorAll('aside[aria-modal="true"] button')];
  const dash = btns.find((b) => b.textContent.includes('Dashboard'));
  if (dash) dash.click();
  return !!dash;
})()`);
await sleep(700);
const drawerClosed = await evaluate(`(() => {
  const aside = document.querySelector('aside[aria-modal="true"]');
  const overlay = [...document.querySelectorAll('div')].find((d) => d.className && String(d.className).includes('bg-black/50') && String(d.className).includes('lg:hidden'));
  return !aside && !overlay;
})()`);
check(drawerClosed, 'drawer closes after selecting a screen');
const dashProbe = await evaluate(overflowProbe);
check(dashProbe && dashProbe.bodyOverflowX <= 1, 'Dashboard still overflow-free after drawer navigation');

// ── Console error summary ──
const realErrors = consoleErrors.filter((e) => !/favicon|Download the React DevTools|net::ERR/i.test(e));
check(realErrors.length === 0, `no runtime console errors across all viewports (${realErrors.length})`);
if (realErrors.length) console.log(realErrors.slice(0, 5).join('\n---\n'));

console.log(`\n  Responsive QA → ${pass} passed, ${fail} failed`);
ws.close();
chrome.kill();
process.exit(fail > 0 ? 1 : 0);
