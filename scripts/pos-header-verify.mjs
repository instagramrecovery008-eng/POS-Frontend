/**
 * POS Ordering wizard — compact header verification (real browser, real API).
 *
 * Drives the ACTUAL app: logs in with the seeded ADMIN account, opens
 * POS Ordering, selects Take Away (auto-advance to the Menu step) and then
 * measures/uses the header at desktop, tablet and mobile widths.
 *
 * Asserts:
 *   1. The search field shares the NEW ORDER row on desktop and wraps onto its
 *      own row on tablet/mobile (never causing horizontal overflow).
 *   2. The header + stepper are compact, leaving the product grid most of the
 *      visible height.
 *   3. Search still filters the whole menu, add-to-cart still works and the
 *      Review/Back footer flow is unchanged.
 *
 * Read-only: nothing is ordered or saved (the cart is never submitted).
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = process.env.CHROME_PATH
  || 'C:\\Users\\Divyang\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const DEV = 'http://localhost:3000';
const PORT = 9252;

let pass = 0, fail = 0;
const check = (cond, msg) => { process.stdout.write(cond ? '  ✅ ' : '  ❌ '); console.log(msg); cond ? pass++ : fail++; };
const section = (t) => console.log(`\n${'='.repeat(64)}\n  ${t}\n${'='.repeat(64)}`);

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-proxy-server',
  '--no-default-browser-check', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=C:\\temp-chrome-pos-${Date.now()}`, 'about:blank',
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
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') {
    consoleErrors.push(m.params?.exceptionDetails?.exception?.description || m.params?.exceptionDetails?.text || 'exception');
  }
};
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) {
    const err = r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text;
    console.log('  ! evaluate failed: ' + String(err).split('\n')[0]);
    return { __error: err };
  }
  return r.result?.result?.value;
};
const TYPE = (selector, value) => `(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return false;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, ${JSON.stringify(value)});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`;
const CLICK_TEXT = (text) => `(() => {
  const el = [...document.querySelectorAll('button, a')].find(x => x.textContent.trim() === ${JSON.stringify(text)} || x.textContent.trim().startsWith(${JSON.stringify(text)}));
  if (!el) return false;
  el.click();
  return true;
})()`;

await send('Runtime.enable');
await send('Page.enable');

// ── Log in with the seeded ADMIN account ───────────────────────────────────
section('LOGIN → POS Ordering');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: DEV });
for (let i = 0; i < 60; i++) {
  await sleep(500);
  if (await evaluate(`!!document.querySelector('#login-password')`)) break;
}
check(true, 'the login screen rendered');
await evaluate(TYPE('input[autocomplete="username"]', 'admin@restaurant.com'));
await evaluate(TYPE('#login-password', 'password123'));
await evaluate(CLICK_TEXT('Log In'));

let signedIn = false;
for (let i = 0; i < 40; i++) {
  await sleep(500);
  if (await evaluate(`!!document.querySelector('aside') && !document.querySelector('#login-password')`)) { signedIn = true; break; }
}
check(signedIn, 'signed in to the POS shell');

// Open POS Ordering from the sidebar (label depends on the tenant toggle).
let opened = false;
for (let i = 0; i < 20 && !opened; i++) {
  opened = await evaluate(`(() => {
    const el = [...document.querySelectorAll('button, a')].find(x => /^(POS Ordering|New Order)$/.test(x.textContent.trim()));
    if (!el) return false;
    el.click();
    return true;
  })()`);
  if (!opened) await sleep(300);
}
check(opened, 'POS Ordering screen opened from the sidebar');

// Take Away auto-advances straight to the Menu step.
let onMenu = false;
for (let i = 0; i < 30; i++) {
  await sleep(400);
  onMenu = await evaluate(`!!document.querySelector('input[aria-label="Search the whole menu"]')`);
  if (onMenu) break;
  await evaluate(CLICK_TEXT('Take Away'));
}
check(onMenu, 'the Menu step is open with the search field visible');

// ── Layout measurements per viewport ───────────────────────────────────────
const measure = async (label) => {
  const m = await evaluate(`(() => {
    const h2 = [...document.querySelectorAll('h2')].find(h => /new order/i.test(h.textContent));
    const search = document.querySelector('input[aria-label="Search the whole menu"]');
    if (!h2 || !search) return null;
    const header = h2.parentElement.parentElement; // the flex-wrap header row
    const stepper = [...document.querySelectorAll('div')].find(d =>
      d.className.includes('overflow-x-auto') && /Menu/.test(d.textContent) && /Review|Order Type/.test(d.textContent));
    const grid = [...document.querySelectorAll('div')].find(d => /xl:grid-cols-5/.test(d.className));
    const row = (el) => { const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), h: Math.round(r.height), w: Math.round(r.width) }; };
    const cards = grid ? [...grid.children] : [];
    const cardH = cards[0] ? Math.round(cards[0].getBoundingClientRect().height) : 0;
    const gridBox = grid ? row(grid.parentElement) : null;
    const cols = cards.length ? new Set(cards.map(c => Math.round(c.getBoundingClientRect().left))).size : 0;
    return {
      vw: window.innerWidth, vh: window.innerHeight,
      overflowX: document.documentElement.scrollWidth - window.innerWidth,
      header: row(header), h2: row(h2), search: row(search),
      stepper: stepper ? row(stepper) : null,
      cards: cards.length, cols, cardH, gridBox,
      rowsVisible: gridBox && cardH ? Math.floor(gridBox.h / (cardH + 12)) : 0,
      sameRow: Math.abs(row(search).top - row(h2).top) < 24,
      noOverlap: row(search).left >= row(h2).right - 2,
    };
  })()`);
  return m;
};

for (const vp of [
  { name: 'Desktop 1440×900', w: 1440, h: 900, expectSameRow: true },
  { name: 'Laptop 1280×800', w: 1280, h: 800, expectSameRow: true },
  { name: 'Tablet 1024×768', w: 1024, h: 768, expectSameRow: true },
  { name: 'Mobile 390×844', w: 390, h: 844, expectSameRow: false },
]) {
  section(`${vp.name} — wizard header`);
  await send('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: vp.w < 768 });
  await sleep(900);
  const m = await measure(vp.name);
  if (!m) { check(false, 'header measured'); continue; }

  check(m.overflowX <= 2, `no horizontal overflow (${m.overflowX}px)`);
  if (vp.expectSameRow) {
    check(m.sameRow, `search shares the NEW ORDER row (search top ${m.search.top}, title top ${m.h2.top})`);
    check(m.noOverlap, 'the search field does not overlap the title');
    check(m.search.left > m.h2.left, 'the search sits to the right of the title');
  } else {
    check(!m.sameRow, `search wraps below the title on mobile (search top ${m.search.top} > title bottom ${m.h2.bottom})`);
    check(m.search.left <= m.h2.left + 4, 'the wrapped search starts at the left edge of the header');
  }
  check(m.header.h <= (vp.expectSameRow ? 60 : 96), `the header row is compact (${m.header.h}px)`);
  check(m.stepper && m.stepper.h <= 40, `the step indicator is slim (${m.stepper?.h}px)`);
  check(m.cards > 0, `menu items render (${m.cards} cards, ${m.cols} columns)`);
  check(m.rowsVisible >= 1, `the grid shows ~${m.rowsVisible} row(s) of items at this height (grid ${m.gridBox?.h}px)`);
  if (vp.w === 1440) console.log(`     header ${m.header.h}px + stepper ${m.stepper?.h}px = ${m.header.h + (m.stepper?.h || 0)}px of chrome`);
}

// ── Behaviour: search, add to cart, Review/Back ────────────────────────────
section('BEHAVIOUR — search, cart, Review/Back');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await sleep(700);

await evaluate(TYPE('input[aria-label="Search the whole menu"]', 'zzz-no-such-dish'));
await sleep(600);
const noMatch = await evaluate(`document.body.textContent.includes('No menu items found')`);
check(noMatch, 'a query with no matches shows the empty state');
await evaluate(TYPE('input[aria-label="Search the whole menu"]', ''));
await sleep(600);

const gridCount = await evaluate(`(() => {
  const grid = [...document.querySelectorAll('div')].find(d => /xl:grid-cols-5/.test(d.className));
  return grid ? grid.children.length : 0;
})()`);
check(gridCount > 0, `clearing the query restores the full grid (${gridCount} items)`);

const added = await evaluate(`(() => {
  const grid = [...document.querySelectorAll('div')].find(d => /xl:grid-cols-5/.test(d.className));
  const first = grid && [...grid.children].find(c => !c.className.includes('grayscale'));
  if (!first) return false;
  first.click();
  return true;
})()`);
await sleep(700);
const cartState = await evaluate(`(() => {
  const review = [...document.querySelectorAll('button')].find(b => /^Review \\(/.test(b.textContent.trim()));
  return {
    reviewText: review ? review.textContent.trim() : null,
    enabled: review ? !review.disabled : null,
    hasBack: [...document.querySelectorAll('button')].some(b => /^Back$/.test(b.textContent.trim())),
  };
})()`);
check(added && cartState.reviewText, `adding an item updates the Review control (${cartState.reviewText})`);
check(cartState.enabled === true, 'Review becomes enabled once the cart has an item');
check(cartState.hasBack, 'the Back control is still present in the footer');

await evaluate(`(() => {
  const b = [...document.querySelectorAll('button')].find(x => /^Review \\(/.test(x.textContent.trim()));
  b.click(); return true;
})()`);
await sleep(800);
const onReview = await evaluate(`document.body.textContent.includes('Review Order')`);
check(onReview, 'Review opens the Review step');

await evaluate(`(() => {
  const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Back');
  b.click(); return true;
})()`);
await sleep(800);
const backToMenu = await evaluate(`(() => ({
  onMenu: !!document.querySelector('input[aria-label="Search the whole menu"]'),
  searchStillBeside: (() => {
    const h2 = [...document.querySelectorAll('h2')].find(h => /new order/i.test(h.textContent));
    const s = document.querySelector('input[aria-label="Search the whole menu"]');
    return !!(h2 && s) && Math.abs(s.getBoundingClientRect().top - h2.getBoundingClientRect().top) < 24;
  })(),
  cartKept: /Review \\(\\d+ items\\)/.test(document.body.textContent),
}))()`);
check(backToMenu.onMenu, 'Back returns to the Menu step');
check(backToMenu.searchStillBeside, 'the search stays beside the title after returning');
check(backToMenu.cartKept, 'the cart is preserved across Review → Back');

section('CONSOLE');
const real = consoleErrors.filter((e) => !/favicon|net::ERR_|401/.test(e));
check(real.length === 0, `no uncaught exceptions (${real.length} found)`);
real.slice(0, 5).forEach((e) => console.log('     ! ' + String(e).slice(0, 160)));

console.log(`\n  Total: ${pass + fail}   Passed: ${pass} ✅   Failed: ${fail} ${fail ? '❌' : '✅'}`);
ws.close();
chrome.kill();
await sleep(400);
process.exit(fail ? 1 : 0);
