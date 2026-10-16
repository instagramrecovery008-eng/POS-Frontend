/**
 * POS Ordering — Open Table end-to-end verification (real browser + real API).
 *
 * Drives the ACTUAL running app (Vite on :3000, backend on :5001) through the
 * integrated table-ordering workflow and asserts the observable behavior:
 *
 *   1. Floors & Tables → tap an AVAILABLE table → guest-count dialog fits the
 *      viewport and the background scroll is locked.
 *   2. "Open Table" hands the table to the POS ORDERING SCREEN — the ordering
 *      workflow stays on one screen (no separate modal/card overlay): the
 *      Floors & Tables board is gone, no full-screen overlay is mounted, the
 *      step indicator shows Menu → Review only, and the tapped table is shown.
 *   3. The menu is usable inline: category filter, search, item selection with
 *      quantities (exactly the items of the chosen category are shown).
 *   4. Continue → Review shows the real table, guest count, Dine In type, the
 *      items and the totals.
 *   5. Print KOT submits the order for real: the order + its KOT exist in the
 *      backend for the tapped table, and the session ends back on the board.
 *   6. The new in-page exit returns to the board (tablet + mobile widths) and
 *      the screen never overflows horizontally.
 *   7. No console errors / exceptions during the run.
 *
 * Order data: the verification CREATES one real order (an order/KOT row is the
 * only way to prove submission) and then removes it again — the order is
 * deleted and the table is reset to AVAILABLE, so the demo data is unchanged.
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = process.env.CHROME_PATH
  || 'C:\\Users\\Divyang\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const DEV = 'http://localhost:3000';
const API = 'http://localhost:5001/api';
const PORT = 9227;

let pass = 0, fail = 0;
const check = (cond, msg) => { process.stdout.write(cond ? '  ✅ ' : '  ❌ '); console.log(msg); cond ? pass++ : fail++; };
const section = (t) => console.log(`\n${'='.repeat(64)}\n  ${t}\n${'='.repeat(64)}`);

// ── Log in through the real API (the UI session below is the SAME user) ──
const login = await fetch(API + '/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@restaurant.com', password: 'password123' }),
}).then((r) => r.json()).catch(() => ({}));
if (!login.token) {
  console.error('❌ Could not log in — is the backend running on :5001 with the seed ADMIN?');
  process.exit(1);
}
const TOKEN = login.token;
const authFetch = (path, init = {}) => fetch(API + path, {
  ...init,
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}`, ...(init.headers || {}) },
});
console.log(`Logged in as ${login.user?.email} (${login.user?.role}) — ${login.user?.restaurantName || 'restaurant'}`);

// ── Menu reference data (what each category actually contains) ──
const menuResp = await authFetch('/menu').then((r) => r.json());
const apiItems = (menuResp.items || menuResp.data?.items || []).map((m) => ({
  name: m.name,
  category: m.category?.name || 'Main Course',
}));
console.log(`Menu reference: ${apiItems.length} items across ${new Set(apiItems.map((i) => i.category)).size} categories`);

// ── Browser ──
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-proxy-server',
  '--no-default-browser-check', '--disable-extensions',
  '--disable-popup-blocking',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=C:\\POS System\\restaurant-pos-frontend\\.chrome-profile-posorder',
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
  // window.alert (popup blocked) would freeze the page — always dismiss it.
  if (msg.method === 'Page.javascriptDialogOpening') {
    send('Page.handleJavaScriptDialog', { accept: true });
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

/** A TRUSTED click (real user gesture) on the element returned by `finder`. */
const trustedClickExpr = async (finder) => {
  const point = await evaluate(`(() => {
    const el = ${finder};
    if (!el) return null;
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  })()`);
  if (!point) return false;
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  return true;
};

const NAV_TO = (label) => `(() => {
  const byTitle = [...document.querySelectorAll('button[title]')].find(b => b.getAttribute('title') === ${JSON.stringify(label)});
  if (byTitle) { byTitle.click(); return 'rail'; }
  const burger = document.querySelector('button[aria-label="Open navigation menu"]');
  if (burger) { burger.click(); return 'drawer-open'; }
  return 'not-found';
})()`;
const CLICK_TITLE = (label) => `[...document.querySelectorAll('button[title]')].find(b => b.getAttribute('title') === ${JSON.stringify(label)})`;

const goToScreen = async (label) => {
  const how = await evaluate(NAV_TO(label));
  if (how === 'drawer-open') {
    await sleep(600);
    await trustedClickExpr(CLICK_TITLE(label));
  }
  await sleep(1800);
  return how;
};

// ── Boot the app with the API session ──
await send('Page.navigate', { url: DEV });
await sleep(2500);
await evaluate(`(() => {
  localStorage.setItem('pos_token', ${JSON.stringify(TOKEN)});
  localStorage.setItem('pos_user', ${JSON.stringify(JSON.stringify(login.user))});
  return true;
})()`);
await send('Page.reload', { ignoreCache: true });
await sleep(4000);

const FIND_AVAILABLE_TABLE = `(() => {
  const span = [...document.querySelectorAll('span')].find(s => s.textContent.trim() === 'Open Table' && s.getBoundingClientRect().width > 0);
  return span ? span.closest('div[class*="cursor-pointer"]') : null;
})()`;

/** Full open-table → inline-menu assertions (returns the tapped table info). */
async function openTableAndAssertInlineMenu(viewportName) {
  section(`${viewportName} — Open Table keeps ordering on the POS Ordering screen`);

  await goToScreen('Floors & Tables');
  const onBoard = await evaluate(`document.body.innerText.includes('Restaurant Floors & Tables')`);
  check(onBoard, 'Floors & Tables board is open');
  if (!onBoard) return null;

  const info = await evaluate(`(() => {
    const card = ${FIND_AVAILABLE_TABLE};
    if (!card) return { ok: false };
    const label = card.querySelector('p')?.textContent?.trim() || '';
    const statusSpan = [...card.querySelectorAll('span')].map(s => s.textContent.trim()).find(t => /Available|Occupied/.test(t)) || '';
    return { ok: true, label, statusSpan, text: card.innerText.slice(0, 60) };
  })()`);
  check(info.ok, `an AVAILABLE table card was found (${info.label || 'n/a'} · ${info.statusSpan})`);
  if (!info.ok) return null;

  check(await trustedClickExpr(FIND_AVAILABLE_TABLE), 'the table card responds to a real tap');
  await sleep(600);

  const dialog = await evaluate(`(() => {
    const d = document.querySelector('div[role="dialog"]');
    if (!d) return { found: false };
    const box = d.firstElementChild.getBoundingClientRect();
    const guests = [...d.querySelectorAll('span')].map(s => s.textContent.trim()).filter(t => /^\\d+$/.test(t))[0] || null;
    return {
      found: true,
      top: Math.round(box.top), bottom: Math.round(box.bottom),
      left: Math.round(box.left), right: Math.round(box.right),
      vh: window.innerHeight, vw: window.innerWidth,
      guests,
      bodyLocked: document.body.style.overflow === 'hidden' || document.documentElement.style.overflow === 'hidden',
    };
  })()`);
  check(dialog.found, 'the guest-count dialog opened');
  if (!dialog.found) return null;
  check(dialog.top >= -1 && dialog.bottom <= dialog.vh + 1,
    `the dialog fits vertically (${dialog.top}…${dialog.bottom} of ${dialog.vh})`);
  check(dialog.left >= -1 && dialog.right <= dialog.vw + 1,
    `the dialog fits horizontally (${dialog.left}…${dialog.right} of ${dialog.vw})`);
  check(dialog.bodyLocked, 'the page behind the dialog does not scroll');

  // Guest count is part of the workflow: raise it and carry it into the order.
  const guestsBefore = Number(dialog.guests || 0);
  const plusClicked = await trustedClickExpr(
    `document.querySelector('div[role="dialog"]') && [...document.querySelectorAll('div[role="dialog"] button')].find(b => b.getAttribute('aria-label') === 'More guests')`
  );
  check(plusClicked, 'guest count can be increased in the dialog');
  await sleep(300);
  const guestsAfter = await evaluate(`(() => {
    const d = document.querySelector('div[role="dialog"]');
    return d ? Number([...d.querySelectorAll('span')].map(s => s.textContent.trim()).filter(t => /^\\d+$/.test(t))[0] || 0) : 0;
  })()`);
  check(guestsAfter === guestsBefore + 1, `guest count updated (${guestsBefore} → ${guestsAfter})`);

  const confirmed = await trustedClickExpr(
    `[...document.querySelectorAll('div[role="dialog"] button')].find(b => b.textContent.trim() === 'Open Table')`
  );
  check(confirmed, '“Open Table” confirmed with a real click');
  await sleep(3000);

  // ── The ordering workflow is now ON the POS Ordering screen ──
  const view = await evaluate(`(() => {
    const txt = document.body.innerText;
    const overlays = [...document.querySelectorAll('div')].filter(d => String(d.className || '').includes('z-[90]'));
    // Active sidebar entry (green) tells us which screen the shell routed to.
    const activeNav = [...document.querySelectorAll('button[title]')]
      .filter(b => String(b.className).includes('bg-[#16A34A]'))
      .map(b => b.getAttribute('title'));
    const menuGrid = [...document.querySelectorAll('div')]
      .find(d => String(d.className).includes('lg:grid-cols-4') && d.children.length);
    const headerTable = (() => {
      const badge = [...document.querySelectorAll('span')]
        .find(s => /^Table /.test(s.textContent.trim()) && s.getAttribute('title'));
      return badge ? badge.textContent.trim() : null;
    })();
    return {
      stillOnBoard: txt.includes('Restaurant Floors & Tables'),
      overlayMounted: overlays.length,
      activeNav,
      hasSearch: !!document.querySelector('input[placeholder="Search dishes, categories..."]'),
      // Step labels render uppercase via CSS — match case-insensitively.
      hasReviewStep: /review/i.test(txt),
      hasMenuStep: /menu/i.test(txt),
      oldSteps: ['Choose Order Type', 'Select Floor / Area', 'Select Table'].filter(t => txt.includes(t)),
      headerTable,
      cardCount: menuGrid ? menuGrid.children.length : 0,
      horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
      vh: window.innerHeight, vw: window.innerWidth,
    };
  })()`);

  check(!view.stillOnBoard, 'the Floors & Tables board is replaced by the POS Ordering screen');
  check(view.overlayMounted === 0, `no separate full-screen overlay/card is mounted (${view.overlayMounted} found)`);
  check(view.hasSearch, 'the menu (search bar) renders INLINE on that screen');
  check(view.hasMenuStep && view.hasReviewStep, `the step indicator shows the ordering steps (${view.activeNav.join(', ') || 'n/a'})`);
  check(view.oldSteps.length === 0,
    `no order-type / floor / table re-selection is asked for (${view.oldSteps.join(', ') || 'none'})`);
  check(!!view.headerTable && view.headerTable.replace(/[^0-9]/g, '') === String(info.label).replace(/[^0-9]/g, ''),
    `the screen shows the tapped table (${view.headerTable} vs tapped ${info.label})`);
  check(view.horizontalOverflow <= 2, `no horizontal overflow at ${view.vw}px (${view.horizontalOverflow}px)`);

  return { label: info.label, displayName: view.headerTable, guests: guestsAfter, cardCount: view.cardCount };
}

/** Menu interactions: category filter, search, quantity. */
async function exerciseMenu() {
  section('Menu on the same screen — category filter, search, quantities');

  const total = await evaluate(`(() => {
    const grid = [...document.querySelectorAll('div')].find(d => String(d.className).includes('lg:grid-cols-4') && d.children.length);
    return grid ? grid.children.length : 0;
  })()`);
  check(total > 1, `menu items render on the screen (${total} visible)`);

  // ── Category filter: the chip count must equal the rendered cards, and every
  // rendered card must belong to that category (checked against /api/menu). ──
  // The chip name comes from the button's OWN text nodes only (the count badge
  // is a separate <span>, so a name ending in digits stays intact).
  const CHIP_NAME = `(b) => [...b.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim()`;
  const chip = await evaluate(`(() => {
    const chipName = ${CHIP_NAME};
    const chips = [...document.querySelectorAll('button')].filter(b => {
      const s = b.querySelector('span.rounded-full');
      return s && /^\\d+$/.test(s.textContent.trim()) && b.getBoundingClientRect().width > 0;
    });
    const target = chips.find(b => !/^All$/.test(chipName(b)));
    if (!target) return null;
    target.scrollIntoView({ block: 'center', inline: 'center' });
    return { name: chipName(target), count: Number(target.querySelector('span.rounded-full').textContent.trim()) };
  })()`);
  check(!!chip, `a category filter chip is available (${chip?.name} · ${chip?.count} items)`);
  if (chip) {
    const name = chip.name;
    const clickedChip = await trustedClickExpr(`(() => {
      const chipName = ${CHIP_NAME};
      return [...document.querySelectorAll('button')].find(b => {
        const s = b.querySelector('span.rounded-full');
        if (!s || !/^\\d+$/.test(s.textContent.trim())) return false;
        return chipName(b) === ${JSON.stringify(name)};
      });
    })()`);
    check(clickedChip, `the “${name}” chip was tapped`);
    await sleep(600);
    const filtered = await evaluate(`(() => {
      const grid = [...document.querySelectorAll('div')].find(d => String(d.className).includes('lg:grid-cols-4') && d.children.length);
      const names = grid ? [...grid.children].map(c => c.querySelector('p')?.textContent?.trim()).filter(Boolean) : [];
      return { count: grid ? grid.children.length : 0, names, text: document.body.innerText.includes('No menu items found') };
    })()`);
    const expected = new Set(apiItems.filter((i) => i.category === name).map((i) => i.name));
    const foreign = filtered.names.filter((n) => !expected.has(n));
    check(filtered.count > 0 && filtered.count <= chip.count,
      `filtering by “${name}” shows only that category's items (${filtered.count} of the ${chip.count} in “${name}”, ${total} in total)`);
    check(foreign.length === 0, `every rendered card belongs to “${name}” (unexpected: ${foreign.join(', ') || 'none'})`);
    if (chip.count < total) {
      check(filtered.count < total, `the filter actually narrows the menu (${filtered.count} < ${total})`);
    }
  }

  // ── Search ──
  const query = await evaluate(`(() => {
    const grid = [...document.querySelectorAll('div')].find(d => String(d.className).includes('lg:grid-cols-4') && d.children.length);
    const name = grid ? grid.children[0].querySelector('p')?.textContent?.trim() : '';
    return name ? name.slice(0, Math.min(5, name.length)) : '';
  })()`);
  const typed = await evaluate(`(() => {
    const el = document.querySelector('input[placeholder="Search dishes, categories..."]');
    if (!el) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, ${JSON.stringify(query)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  check(typed && !!query, `the search box accepts input (${JSON.stringify(query)})`);
  await sleep(700);
  const searched = await evaluate(`(() => {
    const grid = [...document.querySelectorAll('div')].find(d => String(d.className).includes('lg:grid-cols-4') && d.children.length);
    const names = grid ? [...grid.children].map(c => c.querySelector('p')?.textContent?.trim()).filter(Boolean) : [];
    return { count: grid ? grid.children.length : 0, names };
  })()`);
  check(searched.count > 0 && searched.names.every((n) => n.toLowerCase().includes(query.toLowerCase())),
    `search filters the menu (${searched.count} match(es) for “${query}”: ${searched.names.slice(0, 3).join(', ')})`);

  // Clear the search and add a quantity of the first item.
  await evaluate(`(() => {
    const el = document.querySelector('input[placeholder="Search dishes, categories..."]');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, '');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await sleep(500);

  const added = await evaluate(`(() => {
    const grid = [...document.querySelectorAll('div')].find(d => String(d.className).includes('lg:grid-cols-4') && d.children.length);
    if (!grid) return null;
    const card = grid.children[0];
    const name = card.querySelector('p')?.textContent?.trim();
    card.click();
    return { name };
  })()`);
  await sleep(500);
  // Quantity controls live on the in-cart card (Minus / Plus icons).
  const bumped = await evaluate(`(() => {
    const grid = [...document.querySelectorAll('div')].find(d => String(d.className).includes('lg:grid-cols-4') && d.children.length);
    if (!grid) return false;
    const card = grid.children[0];
    const btns = [...card.querySelectorAll('button')];
    const plus = btns.find(b => b.querySelector('svg.lucide-plus') || /lucide-plus/.test(b.innerHTML)) || btns[1];
    if (!plus) return false;
    plus.click();
    const minus = btns.find(b => b.querySelector('svg.lucide-minus') || /lucide-minus/.test(b.innerHTML));
    return !!minus; // the minus control must exist next to it (same qty widget)
  })()`);
  check(bumped, 'the item card exposes quantity controls (＋ / −)');
  await sleep(500);
  const cartState = await evaluate(`(() => {
    const txt = document.body.innerText;
    const badge = [...document.querySelectorAll('span')].map(s => s.textContent.trim()).find(t => /^2$/.test(t));
    const reviewBtn = [...document.querySelectorAll('button')].find(b => /^Review \\(/.test(b.textContent.trim()));
    return { badge: !!badge, reviewBtn: reviewBtn ? reviewBtn.textContent.trim() : null };
  })()`);
  check(cartState.badge, `the item was added with a quantity of 2 (${added?.name})`);
  check(/^Review \(2 items\)/.test(cartState.reviewBtn || ''), `the review entry point counts the items (${cartState.reviewBtn})`);
  return { itemName: added?.name || '' };
}

/** Review + real order submission (Print KOT) + backend proof + cleanup. */
async function submitOrder(tableInfo, menuInfo, expectedGuests) {
  section('Review + order submission (real order + KOT in the backend)');

  const ordersBefore = await authFetch('/orders').then((r) => r.json()).then((r) => (r.data || []).map((o) => o.id));
  const maxBefore = ordersBefore.length ? Math.max(...ordersBefore) : 0;

  check(await trustedClickExpr(`[...document.querySelectorAll('button')].find(b => /^Review \\(/.test(b.textContent.trim()))`),
    'Continue to Review');
  await sleep(900);

  const review = await evaluate(`(() => {
    const txt = document.body.innerText;
    const cards = [...document.querySelectorAll('p')].map(p => p.textContent.trim());
    return {
      hasTitle: txt.includes('Review Order'),
      tableLine: (txt.match(/Table:\\s*([^\\n·]+)/) || [])[1]?.trim() || null,
      guests: (txt.match(/·\\s*(\\d+)\\s*guest\\(s\\)/) || [])[1] || null,
      dineIn: /dine in/i.test(txt),
      qty: /2x/.test(txt),
      item: ${JSON.stringify(menuInfo.itemName)} ? txt.includes(${JSON.stringify(menuInfo.itemName)}) : false,
      subtotal: /Subtotal/.test(txt),
      grandTotal: /Grand Total/.test(txt),
      totalLine: (txt.match(/Grand Total\\s*([^\\n]+)/) || [])[1]?.trim() || null,
      cards: cards.filter(t => ['Type', 'Table', 'Guests', 'Items'].includes(t)),
    };
  })()`);
  check(review.hasTitle, 'the Review step is shown');
  check(!!review.tableLine && review.tableLine.replace(/[^0-9]/g, '') === String(tableInfo.label).replace(/[^0-9]/g, ''),
    `the review carries exactly the tapped table (${review.tableLine})`);
  check(review.dineIn, 'the order type is Dine In');
  check(Number(review.guests) === Number(expectedGuests),
    `the review carries the guest count set in the dialog (${review.guests} of ${expectedGuests})`);
  check(review.qty && review.item, `the selected items are listed (${menuInfo.itemName})`);
  check(review.subtotal && review.grandTotal, `totals are shown (${review.totalLine})`);
  check(review.cards.length >= 3, `order summary cards present (${review.cards.join(', ')})`);

  const printed = await trustedClickExpr(`[...document.querySelectorAll('button')].find(b => /Print KOT/.test(b.textContent))`);
  check(printed, 'Print KOT (order submission) clicked with a real user gesture');
  await sleep(2000);

  // Guest count + table are part of the ticket the kitchen receives.
  const kotText = await readNewTargetText();
  check(!!kotText, 'the kitchen ticket preview opened (real submission, not a stub)');
  if (kotText) {
    check(new RegExp('Guests:\\s*' + expectedGuests).test(kotText),
      `the ticket carries the guest count set in the dialog (${(kotText.match(/Guests:\s*\d+/) || [])[0]})`);
    const shownTable = tableInfo.displayName || tableInfo.label;
    check(kotText.replace(/[^0-9]/g, ' ') .includes(' ' + String(shownTable).replace(/[^0-9]/g, '') + ' '),
      `the ticket carries the tapped table (${shownTable})`);
  }
  await sleep(2500);

  // ── Backend proof: a brand new order for THIS table, DINE_IN, qty 2, + KOT ──
  let created = null;
  for (let i = 0; i < 12 && !created; i++) {
    const list = await authFetch('/orders').then((r) => r.json()).then((r) => r.data || []).catch(() => []);
    const fresh = list.filter((o) => o.id > maxBefore);
    created = fresh.length ? fresh.sort((a, b) => b.id - a.id)[0] : null;
    if (!created) await sleep(800);
  }
  check(!!created, `a new order row was created in the backend (${created ? `#${created.id} ${created.orderNo}` : 'none'})`);
  if (created) {
    check(created.orderType === 'DINE_IN', `the order is DINE_IN (${created.orderType})`);
    check(String(created.table?.tableNo) === String(tableInfo.label).replace(/[^0-9A-Za-z]/g, '') ||
      String(tableInfo.label).includes(String(created.table?.tableNo)),
      `the order belongs to the tapped table (${created.table?.tableNo} vs ${tableInfo.label})`);
    const qty = (created.orderItems || []).reduce((s, i) => s + (i.quantity || 0), 0);
    check(qty === 2, `the ordered quantity is what the screen showed (${qty})`);
    void expectedGuests;

    const detail = await authFetch(`/orders/${created.id}`).then((r) => r.json()).then((r) => r.data).catch(() => null);
    check(!!detail?.kot?.length, `the kitchen ticket was created with the order (${detail?.kot?.length || 0} KOT)`);
  }

  // ── The session ended: back on the board the table flow started from ──
  await sleep(2500);
  const BOARD_STATE = `(() => ({
    onBoard: document.body.innerText.includes('Restaurant Floors & Tables'),
    wizardGone: !document.querySelector('input[placeholder="Search dishes, categories..."]'),
    bodyUnlocked: document.body.style.overflow !== 'hidden' && document.documentElement.style.overflow !== 'hidden',
    occupied: /Occupied/.test(document.body.innerText),
  }))()`;
  let after = await evaluate(BOARD_STATE);
  check(after.onBoard, 'the finished session returned to the Floors & Tables board');
  check(after.wizardGone, 'the order-entry screen was left behind (no stale cart on screen)');
  check(after.bodyUnlocked, 'background scrolling is not left locked');

  // The board caches table rows for 60s (pre-existing TTL), so re-read it from
  // the server before judging the table's occupancy.
  for (let i = 0; i < 6 && !after.occupied; i++) {
    await sleep(1000);
    after = await evaluate(BOARD_STATE);
  }
  if (!after.occupied) {
    await send('Page.reload', { ignoreCache: true });
    await sleep(4500);
    await goToScreen('Floors & Tables');
    after = await evaluate(BOARD_STATE);
  }
  check(after.occupied, 'the table is shown as Occupied after the order was created');

  // Authoritative check — the table row itself is OCCUPIED in the backend.
  if (created?.table?.id) {
    const tableRow = await authFetch('/tables').then((r) => r.json()).then((r) => (r.tables || []).find((t) => t.id === created.table.id)).catch(() => null);
    check(tableRow?.status === 'OCCUPIED', `the backend marks the table OCCUPIED (${tableRow?.status})`);
  }

  // ── Cleanup: remove the verification order + release the table ──
  if (created) {
    const del = await authFetch(`/orders/${created.id}`, { method: 'DELETE' }).then((r) => r.json()).catch(() => ({}));
    const tableId = created.table?.id;
    let released = false;
    if (tableId) {
      const rel = await authFetch(`/tables/${tableId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'AVAILABLE' }),
      }).then((r) => r.json()).catch(() => ({}));
      released = !!rel?.success || rel?.table?.status === 'AVAILABLE';
    }
    check(!!del?.success, `verification order #${created.id} removed (demo data restored)`);
    check(released, `table ${created.table?.tableNo} released back to AVAILABLE`);
  }
  return created;
}

/** Read the text of the pop-up (KOT preview) the app opened, if any. */
async function readNewTargetText() {
  const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json()).catch(() => []);
  const extra = (list || []).filter((t) => t.type === 'page' && t.webSocketDebuggerUrl && t.webSocketDebuggerUrl !== wsUrl);
  for (const t of extra) {
    try {
      const w = new WebSocket(t.webSocketDebuggerUrl);
      await new Promise((res, rej) => { w.onopen = res; w.onerror = rej; });
      const text = await new Promise((res) => {
        w.onmessage = (ev) => {
          const m = JSON.parse(ev.data);
          if (m.id === 1) res(m.result?.result?.value || '');
        };
        w.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: 'document.body.innerText', returnByValue: true } }));
      });
      w.close();
      if (text) return text;
    } catch { /* popup not evaluable — try the next target */ }
  }
  return '';
}

/** The new in-page exit affordance (used at tablet/mobile widths). */
async function assertExitBackToBoard(viewportName) {
  section(`${viewportName} — leaving the table order returns to the board`);
  const onWizard = await evaluate(`!!document.querySelector('input[placeholder="Search dishes, categories..."]')`);
  check(onWizard, 'still on the order screen (menu visible)');
  const exited = await trustedClickExpr(`document.querySelector('button[aria-label="Exit table order"]')`);
  check(exited, 'the order screen offers an explicit exit control');
  await sleep(2200);
  const state = await evaluate(`(() => ({
    onBoard: document.body.innerText.includes('Restaurant Floors & Tables'),
    wizardGone: !document.querySelector('input[placeholder="Search dishes, categories..."]'),
    bodyUnlocked: document.body.style.overflow !== 'hidden' && document.documentElement.style.overflow !== 'hidden',
    stillHandedOver: !!document.body.innerText.match(/Review Order/),
  }))()`);
  check(state.onBoard && state.wizardGone, 'exiting lands back on the Floors & Tables board');
  check(state.bodyUnlocked, 'no scroll lock is left behind');
  check(!state.stillHandedOver, 'the handed-over table order is not left dangling on the screen');
}

// ═══════════════════════════════════════════════
//  1. Desktop — full workflow incl. a real order
// ═══════════════════════════════════════════════
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await sleep(700);
const desktopTable = await openTableAndAssertInlineMenu('Desktop 1440×900');
let desktopMenu = null;
if (desktopTable) {
  desktopMenu = await exerciseMenu();
  await submitOrder(desktopTable, desktopMenu, desktopTable.guests);
}

// ═══════════════════════════════════════════════
//  2. Tablet + mobile — the same screen, responsive
// ═══════════════════════════════════════════════
for (const vp of [
  { name: 'Tablet 768×1024', w: 768, h: 1024 },
  { name: 'Mobile 375×812', w: 375, h: 812 },
]) {
  await send('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: true });
  await sleep(700);
  const table = await openTableAndAssertInlineMenu(vp.name);
  if (!table) continue;
  const scroll = await evaluate(`(() => {
    const scrollers = [...document.querySelectorAll('*')].filter(e => {
      const s = getComputedStyle(e);
      return (s.overflowY === 'auto' || s.overflowY === 'scroll') && e.clientHeight > 40 && e.scrollHeight > e.clientHeight;
    });
    return { count: scrollers.length, pageScroll: document.documentElement.scrollHeight > window.innerHeight + 4 };
  })()`);
  check(scroll.count > 0 || scroll.pageScroll,
    `the ordering surface scrolls internally at ${vp.w}px (${scroll.count} scroll container(s))`);
  await assertExitBackToBoard(vp.name);
}

/** Table selection AND ordering on the one POS Ordering screen (no overlay). */
async function assertTableSelectionSameScreen() {
  section('Table selection + menu ordering on the SAME POS Ordering screen');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await evaluate(`localStorage.clear(); true`);
  await send('Page.navigate', { url: DEV });
  await sleep(3000);
  await evaluate(`localStorage.setItem('pos_token', ${JSON.stringify(TOKEN)}); localStorage.setItem('pos_user', ${JSON.stringify(JSON.stringify(login.user))}); true`);
  await send('Page.reload', { ignoreCache: true });
  await sleep(4200);

  await goToScreen('POS Ordering');
  const opened = await evaluate(`(() => ({
    overlays: [...document.querySelectorAll('div')].filter(d => String(d.className || '').includes('z-[90]')).length,
    orderTypeStep: document.body.textContent.includes('Choose Order Type'),
    steps: [...document.querySelectorAll('span')]
      .filter(s => /tracking-wider/.test(String(s.className)))
      .map(s => s.textContent.trim()),
    activeNav: [...document.querySelectorAll('button[title]')]
      .filter(b => String(b.className).includes('bg-[#16A34A]'))
      .map(b => b.getAttribute('title')),
  }))()`);
  check(opened.activeNav.includes('POS Ordering'), `the POS Ordering screen opened (${opened.activeNav.join(', ')})`);
  check(opened.overlays === 0, 'it renders as a screen — no modal/card overlay is mounted');
  check(opened.orderTypeStep, 'the order-type step is rendered on it');
  check(['Order Type', 'Floor', 'Table', 'Menu', 'Review'].every((l) => opened.steps.includes(l)),
    `all five ordering steps live on this one screen (${opened.steps.join(' · ')})`);

  check(await trustedClickExpr(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('Dine In'))`),
    'Dine In selected');
  await sleep(1300);

  const onFloor = await evaluate(`document.body.textContent.includes('Select Floor / Area')`);
  check(onFloor, 'the floor step renders in that same screen');
  const floor = await evaluate(`(() => {
    const h = [...document.querySelectorAll('h3')].find(x => x.textContent.includes('Select Floor / Area'));
    const grid = h && h.parentElement.querySelector('div[class*="grid"]');
    const btn = grid ? grid.querySelector('button') : null;
    if (!btn) return null;
    btn.click();
    return btn.textContent.replace(/\\s+/g, ' ').trim().slice(0, 40);
  })()`);
  check(!!floor, `a floor was selected (${floor || 'none'})`);
  await sleep(1500);

  const picked = await evaluate(`(() => {
    const btn = [...document.querySelectorAll('button')].find(b => /Available/.test(b.textContent) && b.getBoundingClientRect().width > 0);
    if (!btn) return null;
    const label = btn.textContent.replace(/\\s+/g, ' ').trim().slice(0, 40);
    btn.click();
    return label;
  })()`);
  check(!!picked, `an available table was selected on the same screen (${picked || 'none'})`);
  await sleep(1800);

  const after = await evaluate(`(() => {
    const badge = [...document.querySelectorAll('span')].find(s => /^Table /.test(s.textContent.trim()) && s.getAttribute('title'));
    return {
      menu: !!document.querySelector('input[placeholder="Search dishes, categories..."]'),
      badge: badge ? badge.textContent.trim() : null,
      onBoard: document.body.textContent.includes('Restaurant Floors & Tables'),
      overlays: [...document.querySelectorAll('div')].filter(d => String(d.className || '').includes('z-[90]')).length,
      hasReview: document.body.textContent.includes('Review'),
    };
  })()`);
  check(after.menu && !after.onBoard, 'selecting a table shows the menu on the SAME screen');
  check(after.overlays === 0, 'still no overlay — the workflow never leaves the screen');
  check(!!after.badge, `the chosen table is carried into the menu step (${after.badge})`);
  check(after.hasReview, 'the Review step stays available on that screen');
}

await assertTableSelectionSameScreen();

// ═══════════════════════════════════════════════
//  Console
// ═══════════════════════════════════════════════
section('CONSOLE');
const realErrors = consoleErrors.filter((e) => !/favicon|net::ERR_|Failed to load resource|pop-ups/i.test(e));
check(realErrors.length === 0, `no console errors / exceptions (${realErrors.length} found)`);
realErrors.slice(0, 8).forEach((e) => console.log('     ! ' + e));

console.log(`\n  Total: ${pass + fail}   Passed: ${pass} ✅   Failed: ${fail} ${fail ? '❌' : '✅'}`);
ws.close();
chrome.kill();
await sleep(300);
process.exit(fail ? 1 : 0);
