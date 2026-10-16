/**
 * Open Table + Kitchen KOT — real-browser verification (headless Chrome via CDP).
 *
 * Drives the ACTUAL running app (Vite on :3000, backend on :5001) through the
 * fixed flows and asserts the observable behavior at the required viewports:
 *   320×640, 375×812, 768×1024 and a desktop size.
 *
 * Checks per viewport:
 *   1. Sidebar branding renders (logo image loaded OR the initials fallback —
 *      never a broken image), next to the tenant's restaurant name.
 *   2. Floors & Tables → tap an AVAILABLE table → the guest dialog fits inside
 *      the visible viewport.
 *   3. "Open Table" hands the table to the POS ORDERING SCREEN and shows the
 *      menu INLINE there for that exact table: no separate modal/card overlay,
 *      no Dine In/Take Away step, no floor/table screens, and the table number
 *      shown on Review matches the table that was tapped.
 *   4. That screen fits the viewport (no horizontal overflow) and scrolls
 *      internally (desktop, tablet and mobile).
 *   5. Leaving the table order (the in-page exit) returns to Floors & Tables
 *      and releases the background scroll lock.
 *   6. Kitchen Tickets shows no "Checkout Desk" action and keeps the Active /
 *      History tabs (hold orders were removed from the product).
 *   7. No console errors / page exceptions during the whole run.
 *
 * Read-only with respect to order data: no order/KOT is created (the session is
 * left before any submit action) and no existing record is modified. The Review
 * step is also asserted to offer Print KOT / Cancel Order only. The full
 * workflow INCLUDING a real order submission is covered by
 * scripts/pos-ordering-open-table-verify.mjs.
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = process.env.CHROME_PATH
  || 'C:\\Users\\Divyang\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const DEV = 'http://localhost:3000';
const API = 'http://localhost:5001/api';
const PORT = 9224;

let pass = 0, fail = 0;
const check = (cond, msg) => { process.stdout.write(cond ? '  ✅ ' : '  ❌ '); console.log(msg); cond ? pass++ : fail++; };

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-proxy-server',
  '--no-default-browser-check', '--disable-extensions',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=C:\\POS System\\restaurant-pos-frontend\\.chrome-profile-opentable',
  'about:blank',
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

let msgId = 0;
const pending = new Map();
const consoleErrors = [];
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error') {
    consoleErrors.push('console: ' + (msg.params.args?.map((a) => a.value || a.description || '').join(' ')));
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
  if (r.result?.exceptionDetails) {
    return { __error: r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text };
  }
  return r.result?.result?.value;
};

await send('Runtime.enable');
await send('Page.enable');

// ── Log in through the real API and boot the app with that session ──
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
console.log(`Logged in as ${login.user?.email} (${login.user?.role}) — ${login.user?.restaurantName || 'restaurant'}\n`);

await send('Page.navigate', { url: DEV });
await sleep(2500);
await evaluate(`(() => {
  localStorage.setItem('pos_token', ${JSON.stringify(login.token)});
  localStorage.setItem('pos_user', ${JSON.stringify(JSON.stringify(login.user))});
  return true;
})()`);
await send('Page.reload', { ignoreCache: true });
await sleep(4000);

const VIEWPORTS = [
  { name: 'Mobile 320×640', w: 320, h: 640, mobile: true },
  { name: 'Mobile 375×812', w: 375, h: 812, mobile: true },
  { name: 'Tablet 768×1024', w: 768, h: 1024, mobile: true },
  { name: 'Desktop 1440×900', w: 1440, h: 900, mobile: false },
];

// Reusable DOM helpers (evaluated in the page)
const NAV_TO = (label) => `(() => {
  const clickByTitle = () => {
    const b = [...document.querySelectorAll('button[title]')].find(x => x.getAttribute('title') === ${JSON.stringify(label)});
    if (b) { b.click(); return true; }
    return false;
  };
  if (clickByTitle()) return 'rail';
  const burger = document.querySelector('button[aria-label="Open navigation menu"]');
  if (burger) { burger.click(); return 'drawer-open'; }
  return 'not-found';
})()`;

const CLICK_DRAWER_ITEM = (label) => `(() => {
  const b = [...document.querySelectorAll('button[title]')].find(x => x.getAttribute('title') === ${JSON.stringify(label)});
  if (!b) return false;
  b.click();
  return true;
})()`;

for (const vp of VIEWPORTS) {
  console.log(`\n${'='.repeat(64)}\n  ${vp.name}\n${'='.repeat(64)}`);
  await send('Emulation.setDeviceMetricsOverride', {
    width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: vp.mobile,
  });
  await sleep(700);

  // ── 1. Sidebar branding ──
  // Below md the persistent rail is hidden and the SAME branding lives in the
  // off-canvas drawer — open it so a real branding surface is on screen (a
  // lazy image inside a display:none element is never fetched).
  // NOTE: the off-canvas drawer is position:fixed, so offsetParent is always
  // null for it — visibility must come from computed style + a real box.
  const VISIBLE = `(el) => {
    if (!el) return false;
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }`;
  const railVisible = await evaluate(`(() => {
    const visible = ${VISIBLE};
    return visible(document.querySelector('aside'));
  })()`);
  let drawerOpened = false;
  if (!railVisible) {
    const burger = await evaluate(`(() => {
      const b = document.querySelector('button[aria-label="Open navigation menu"]');
      if (!b) return false;
      b.click();
      return true;
    })()`);
    drawerOpened = burger;
    await sleep(800);
  }

  // Poll until the tenant logo settles (a remote URL may still be in flight).
  let branding = { found: false };
  for (let i = 0; i < 25; i++) {
    branding = await evaluate(`(() => {
      const visible = ${VISIBLE};
      const aside = [...document.querySelectorAll('aside')].find(visible);
      if (!aside) return { found: false };
      const img = aside.querySelector('img');
      const mark = [...aside.querySelectorAll('span')].find(s => s.getAttribute('role') === 'img');
      return {
        found: true,
        hasImg: !!img,
        imgLoaded: img ? (img.complete && img.naturalWidth > 0) : false,
        imgBroken: img ? (img.complete && img.naturalWidth === 0) : false,
        imgObjectFit: img ? getComputedStyle(img).objectFit : null,
        imgBox: img ? [Math.round(img.getBoundingClientRect().width), Math.round(img.getBoundingClientRect().height)] : null,
        initialMark: mark ? mark.textContent.trim() : null,
        text: aside.textContent.slice(0, 40),
      };
    })()`);
    if (!branding.found || !branding.hasImg || branding.imgLoaded || branding.imgBroken) break;
    await sleep(300);
  }
  check(branding.found, `${drawerOpened ? 'mobile drawer' : 'sidebar rail'} branding is rendered`);
  if (branding.found) {
    check(!branding.imgBroken, 'no broken-image glyph in the sidebar branding');
    if (branding.hasImg && branding.imgLoaded) {
      check(true, 'the configured restaurant logo actually loaded (naturalWidth > 0)');
      check(branding.imgObjectFit === 'contain', `sidebar logo uses object-contain (got ${branding.imgObjectFit}) — no distortion`);
      check(branding.imgBox && branding.imgBox[0] === branding.imgBox[1], `logo keeps a square aspect ratio (${branding.imgBox?.join('×')})`);
    } else {
      check(!!branding.initialMark,
        `a failed/missing logo falls back to the restaurant initial (rendered: ${branding.initialMark || 'none'})`);
    }
    check(branding.text.length > 0, `restaurant name is rendered beside the mark (${branding.text})`);
  }
  if (drawerOpened) {
    await evaluate(`(() => {
      const b = document.querySelector('button[aria-label="Close navigation"]');
      if (b) b.click();
      return true;
    })()`);
    await sleep(500);
  }

  // ── 2. Navigate to Floors & Tables ──
  let nav = await evaluate(NAV_TO('Floors & Tables'));
  if (nav === 'drawer-open') {
    await sleep(500);
    const clicked = await evaluate(CLICK_DRAWER_ITEM('Floors & Tables'));
    check(clicked, 'drawer navigation reaches Floors & Tables');
  } else {
    check(nav === 'rail', `Floors & Tables navigation available (${nav})`);
  }
  await sleep(2000);

  const onTables = await evaluate(`document.body.innerText.includes('Restaurant Floors & Tables')`);
  check(onTables, 'Floors & Tables screen is visible');

  // ── 3. Tap an AVAILABLE table ──
  const tableInfo = await evaluate(`(() => {
    const spans = [...document.querySelectorAll('span')].filter(s => s.textContent.trim() === 'Open Table' && s.offsetParent !== null);
    if (!spans.length) return { ok: false };
    const card = spans[0].closest('div[class*="cursor-pointer"]');
    if (!card) return { ok: false };
    const label = card.querySelector('p')?.textContent?.trim() || '';
    card.click();
    return { ok: true, label };
  })()`);
  check(tableInfo.ok, `an available table was found and tapped (${tableInfo.label || 'n/a'})`);
  if (!tableInfo.ok) continue;
  await sleep(600);

  // ── 4. Guest dialog fits the viewport ──
  const dialog = await evaluate(`(() => {
    const d = document.querySelector('div[role="dialog"]');
    if (!d) return { found: false };
    const box = d.firstElementChild.getBoundingClientRect();
    return {
      found: true,
      top: Math.round(box.top), bottom: Math.round(box.bottom),
      left: Math.round(box.left), right: Math.round(box.right),
      vh: window.innerHeight, vw: window.innerWidth,
      bodyLocked: document.body.style.overflow === 'hidden' || document.documentElement.style.overflow === 'hidden',
      text: d.textContent.slice(0, 80),
    };
  })()`);
  check(dialog.found, 'Open Table dialog opened');
  if (dialog.found) {
    check(dialog.top >= -1 && dialog.bottom <= dialog.vh + 1,
      `dialog fits vertically (${dialog.top}…${dialog.bottom} of ${dialog.vh})`);
    check(dialog.left >= -1 && dialog.right <= dialog.vw + 1,
      `dialog fits horizontally (${dialog.left}…${dialog.right} of ${dialog.vw})`);
    check(dialog.bodyLocked, 'background scrolling is locked while the dialog is open');
  }

  // ── 5. Confirm → the wizard opens directly on the Menu for THIS table ──
  const confirmed = await evaluate(`(() => {
    const d = document.querySelector('div[role="dialog"]');
    if (!d) return false;
    const btn = [...d.querySelectorAll('button')].find(b => b.textContent.trim() === 'Open Table');
    if (!btn) return false;
    btn.click();
    return true;
  })()`);
  check(confirmed, 'Open Table confirmed');
  await sleep(2500);

  const wizard = await evaluate(`(() => {
    const has = (t) => document.body.innerText.includes(t);
    // Ordering happens ON the POS Ordering screen: the wizard is rendered in
    // page mode (a screen, not a modal overlay card).
    const overlays = [...document.querySelectorAll('div')].filter(d => String(d.className || '').includes('z-[90]'));
    const badge = [...document.querySelectorAll('span')]
      .find(s => /^Table /.test(s.textContent.trim()) && s.getAttribute('title'));
    return {
      onBoard: has('Restaurant Floors & Tables'),
      orderTypeStep: has('Choose Order Type'),
      floorStep: has('Select Floor / Area'),
      tableStep: has('Select Table'),
      menuStep: !!(document.querySelector('input[placeholder="Search dishes, categories..."]') || has('No menu items found')),
      overlayCards: overlays.length,
      // NOTE: a regex escape written inside this evaluated template literal
      // would collapse (\s -> s), so plain string matching is used here.
      headerTable: badge ? badge.textContent.trim() : null,
      exitControl: !!document.querySelector('button[aria-label="Exit table order"]'),
      vh: window.innerHeight,
      horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
      bodyLocked: document.body.style.overflow === 'hidden' || document.documentElement.style.overflow === 'hidden',
      scrollableInside: (() => {
        const scrollers = [...document.querySelectorAll('*')].filter(e => {
          const s = getComputedStyle(e);
          return (s.overflowY === 'auto' || s.overflowY === 'scroll') && e.clientHeight > 40 && e.scrollHeight > e.clientHeight;
        });
        return scrollers.length > 0;
      })(),
    };
  })()`);
  check(!wizard.onBoard, 'the POS Ordering screen replaced the Floors & Tables board (one integrated screen)');
  check(wizard.overlayCards === 0, 'no separate full-screen modal/card overlay is mounted');
  check(!wizard.orderTypeStep, 'no Dine In / Take Away selection step in the Open Table flow');
  check(!wizard.floorStep, 'no floor re-selection in the Open Table flow');
  check(!wizard.tableStep, 'no table re-selection in the Open Table flow');
  check(wizard.menuStep, 'the order-entry menu is shown immediately');
  check(!!wizard.headerTable
    && wizard.headerTable.replace(/[^0-9]/g, '') === (tableInfo.label || '').replace(/[^0-9]/g, ''),
    `the ordering screen shows the tapped table (${wizard.headerTable})`);
  check(wizard.exitControl, 'the full-screen session offers an explicit exit back to Floors & Tables');
  check(wizard.horizontalOverflow <= 2,
    `the ordering screen fits the width (${wizard.horizontalOverflow}px overflow at ${vp.w}px)`);
  check(!wizard.bodyLocked, 'the screen is not left scroll-locked (page mode owns the viewport)');
  check(wizard.scrollableInside, 'content scrolls INSIDE the ordering screen (internal scroll container present)');

  // ── 6. Correct table number is carried into the order ──
  const addedItem = await evaluate(`(() => {
    const grid = [...document.querySelectorAll('div')].filter(d => String(d.className).includes('grid-cols-2') && d.children.length);
    if (!grid.length) return false;
    const card = grid[0].querySelector('div[class*="rounded-2xl"]');
    if (!card) return false;
    card.click();
    return true;
  })()`);
  check(addedItem, 'a menu item can be added to the table order');
  await sleep(600);

  const continued = await evaluate(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => /^Review \\(/.test(x.textContent.trim()));
    if (!b) return false;
    b.click();
    return true;
  })()`);
  check(continued, 'Continue to Review is available');
  await sleep(900);

  const review = await evaluate(`(() => {
    const t = document.body.innerText;
    const m = t.match(/Table:\\s*([^\\n·]+)/);
    const typeMatch = t.match(/Type\\n?\\s*([a-z ]+)/i);
    // Action buttons actually rendered on the Review step.
    const actions = [...document.querySelectorAll('button')].map(b => b.textContent.trim()).filter(txt => txt.length && txt.length < 60);
    return {
      table: m ? m[1].trim() : null,
      text: t.slice(0, 400),
      type: typeMatch ? typeMatch[1].trim() : null,
      hasPrintKot: actions.some(a => /^Print KOT/.test(a)),
      hasCancel: actions.some(a => /^Cancel Order/.test(a)),
      hasHold: /Hold Order/.test(t),
      hasSaveAndPay: /Save & Pay/.test(t),
    };
  })()`);
  check(review.hasPrintKot, 'Review offers Print KOT (creates the order + its kitchen ticket)');
  check(review.hasCancel, 'Review offers Cancel Order');
  check(!review.hasHold, 'Review offers NO Hold Order action');
  check(!review.hasSaveAndPay, 'Review offers NO Save & Pay action');
  check(!!review.table, `Review shows the order's table (${review.table})`);
  const tappedNumber = (tableInfo.label || '').replace(/[^0-9]/g, '');
  check(!!review.table && tappedNumber !== '' && review.table.replace(/[^0-9]/g, '') === tappedNumber,
    `the table shown is exactly the one tapped (tapped ${tableInfo.label} → review ${review.table})`);
  check(/dine in/i.test(review.text), 'Review reports the Dine In order type');

  // ── 7. Leave the table order → back on the board, scroll lock released ──
  const closed = await evaluate(`(() => {
    const b = document.querySelector('button[aria-label="Exit table order"]');
    if (!b) return false;
    b.click();
    return true;
  })()`);
  check(closed, 'the table order can be left (exit control is wired)');
  await sleep(2200);
  const afterClose = await evaluate(`(() => ({
    onBoard: document.body.innerText.includes('Restaurant Floors & Tables'),
    wizardGone: !document.querySelector('input[placeholder="Search dishes, categories..."]'),
    bodyUnlocked: document.body.style.overflow !== 'hidden' && document.documentElement.style.overflow !== 'hidden',
  }))()`);
  check(afterClose.wizardGone && afterClose.onBoard, 'leaving the order returns to the Floors & Tables board');
  check(afterClose.bodyUnlocked, 'the background scroll lock is released (no stuck page)');
  await sleep(400);

  // ── 8. Kitchen Tickets: no Checkout Desk ──
  let kitNav = await evaluate(NAV_TO('Kitchen Tickets'));
  if (kitNav === 'drawer-open') {
    await sleep(400);
    await evaluate(CLICK_DRAWER_ITEM('Kitchen Tickets'));
  }
  await sleep(2200);
  const kitchen = await evaluate(`(() => ({
    visible: !!document.querySelector('input[placeholder="Search tickets..."]')
      || document.body.innerText.includes('Kitchen Tickets'),
    checkoutDesk: document.body.innerText.includes('Checkout Desk'),
    tabs: ['Active', 'History'].filter(t => document.body.innerText.includes(t)),
    hasOnHoldTab: /On Hold/.test(document.body.innerText),
  }))()`);
  check(kitchen.visible, 'Kitchen Tickets screen is reachable');
  check(!kitchen.checkoutDesk, 'no "Checkout Desk" action is rendered for the kitchen');
  check(kitchen.tabs.length === 2, `Active / History tabs present (${kitchen.tabs.join(', ')})`);
  check(!kitchen.hasOnHoldTab, 'no On Hold tab is rendered (hold orders removed)');
}

// ═══════════════════════════════════════════════════════════════════════
//  BROKEN LOGO SOURCE — block the tenant's logo host and reload: the sidebar
//  must degrade to the initials mark (never a browser broken-image glyph).
// ═══════════════════════════════════════════════════════════════════════
console.log(`\n${'='.repeat(64)}\n  BROKEN LOGO SOURCE (Cloudinary blocked)\n${'='.repeat(64)}`);
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
await send('Network.enable');
await send('Network.setBlockedURLs', { urls: ['*res.cloudinary.com*', '*cloudinary*'] });
await send('Page.reload', { ignoreCache: true });
await sleep(5000);
const brokenLogo = await evaluate(`(() => {
  const aside = document.querySelector('aside');
  if (!aside) return { found: false };
  const img = aside.querySelector('img');
  const mark = [...aside.querySelectorAll('span')].find(s => s.getAttribute('role') === 'img');
  return {
    found: true,
    hasImg: !!img,
    brokenVisible: img ? (img.complete && img.naturalWidth === 0) : false,
    initial: mark ? mark.textContent.trim() : null,
  };
})()`);
check(brokenLogo.found, 'sidebar still renders with the logo host unreachable');
if (brokenLogo.found) {
  check(!brokenLogo.hasImg || !brokenLogo.brokenVisible, 'no broken-image glyph is shown for an unreachable logo');
  check(!!brokenLogo.initial, `the initials fallback replaces the failed logo (${brokenLogo.initial || 'none'})`);
}
await send('Network.setBlockedURLs', { urls: [] });

console.log(`\n${'='.repeat(64)}\n  CONSOLE\n${'='.repeat(64)}`);
const realErrors = consoleErrors.filter((e) => !/favicon|net::ERR_|Failed to load resource/i.test(e));
check(realErrors.length === 0, `no console errors / exceptions (${realErrors.length} found)`);
realErrors.slice(0, 8).forEach((e) => console.log('     ! ' + e));

console.log(`\n  Total: ${pass + fail}   Passed: ${pass} ✅   Failed: ${fail} ${fail ? '❌' : '✅'}`);
ws.close();
chrome.kill();
await sleep(300);
process.exit(fail === 0 ? 0 : 1);
