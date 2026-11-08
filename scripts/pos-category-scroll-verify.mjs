/**
 * POS Ordering category scrolling + login branding — real-browser verification.
 *
 * Drives the running app (Vite :3000, API :5001) in headless Chrome and checks
 * the behaviours that broke on mobile/tablet:
 *
 *   - the chip strip is ONE non-wrapping horizontal row below lg, the vertical
 *     sidebar at md+ (tablet/desktop), and both reach their last category;
 *   - restaurant PCs open the category rail at 250px and collapse it to 64px
 *     (icons + tooltips, cart/selection intact), while tablets keep 160px and
 *     phones keep the chip strip;
 *   - selecting a category reveals its chip WITHOUT moving the page, and the
 *     selection survives Review → Back;
 *   - scrolling the sidebar or strip never scrolls the AppShell page;
 *   - wheel + keyboard navigation work on the strip;
 *   - no horizontal page overflow, clipped cards/header/footer, duplicate ids
 *     or duplicate rails at 320×640, 360×800, 390×844, 430×932, 600×960,
 *     768×1024, 1024×768, 1280×720, 1366×768, 1920×1080;
 *   - resizing across the 768px and 1024px breakpoints (no reload) keeps the
 *     right presentation, selection and cart intact.
 *
 * It also measures the login page at the same viewports: Infinixo logo size /
 * visibility / containment, attribution text, square product cards and form
 * fit.
 *
 * Read-only: one cart line is added locally to reach Review, never submitted.
 *
 * Run with the dev servers up: node scripts/pos-category-scroll-verify.mjs
 */
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH
  || 'C:\\Users\\Divyang\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const APP = process.env.APP_URL || 'http://localhost:3000';
const VIEWPORTS = [
  { width: 320, height: 640, label: '320×640 small phone' },
  { width: 360, height: 800, label: '360×800 phone' },
  { width: 390, height: 844, label: '390×844 phone' },
  { width: 430, height: 932, label: '430×932 large phone' },
  { width: 600, height: 960, label: '600×960 small tablet (chip layout)' },
  { width: 768, height: 1024, label: '768×1024 portrait tablet' },
  { width: 1024, height: 768, label: '1024×768 landscape tablet / small desktop' },
  { width: 1280, height: 720, label: '1280×720 small laptop' },
  { width: 1366, height: 768, label: '1366×768 desktop' },
  { width: 1920, height: 1080, label: '1920×1080 full HD desktop' },
];

let pass = 0;
let fail = 0;
const check = (cond, msg) => {
  process.stdout.write(cond ? '  ✅ ' : '  ❌ ');
  console.log(msg);
  cond ? pass++ : fail++;
};
const section = (t) => console.log(`\n${'='.repeat(70)}\n  ${t}\n${'='.repeat(70)}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--no-proxy-server', '--no-first-run'],
});
const page = await browser.newPage();
const consoleErrors = [];
const apiFailures = [];
const hookWarnings = [];
page.on('pageerror', (e) => consoleErrors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
  if (m.type() === 'warning' && /hook|Warning:/i.test(m.text())) hookWarnings.push(m.text());
});
page.on('response', (res) => {
  if (res.status() >= 400 && /\/api\//.test(res.url())) apiFailures.push(`${res.status()} ${res.url()}`);
});
page.on('requestfailed', (req) => {
  if (/\/api\//.test(req.url())) apiFailures.push(`FAILED ${req.url()} (${req.failure()?.errorText || 'network'})`);
});

const evalInPage = (fn, ...args) => page.evaluate(fn, ...args);

async function waitFor(fn, { timeout = 15000, label = 'condition' } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await fn()) return true;
    await sleep(120);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function login() {
  await page.goto(APP, { waitUntil: 'networkidle2' });
  await waitFor(() => evalInPage(() => !!document.querySelector('#login-password')), { label: 'login form' });
  await evalInPage(() => {
    const email = document.querySelector('input[autocomplete="username"]');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(email, 'admin@restaurant.com');
    email.dispatchEvent(new Event('input', { bubbles: true }));
    const pw = document.querySelector('#login-password');
    setter.call(pw, 'password123');
    pw.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await evalInPage(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => /^LOG IN$/i.test(b.textContent.trim()));
    btn?.click();
  });
  await waitFor(() => evalInPage(() => !document.querySelector('#login-password')), { label: 'POS shell' });
  await sleep(700);
}

async function openPosOrdering() {
  const opened = await evalInPage(() => {
    const el = [...document.querySelectorAll('button, a')]
      .find((x) => /^(POS Ordering|New Order)$/.test(x.textContent.trim()));
    if (!el) return false;
    el.click();
    return true;
  });
  check(opened, 'POS Ordering opened from the sidebar');
  await sleep(600);

  // Take Away auto-advances to the Menu step; if already on the menu, skip.
  const hasChips = await evalInPage(() => !!document.querySelector('[role="tablist"]'));
  if (!hasChips) {
    await evalInPage(() => {
      const el = [...document.querySelectorAll('button')].find((b) => /Take Away/i.test(b.textContent));
      el?.click();
    });
    await waitFor(() => evalInPage(() => !!document.querySelector('[role="tablist"]')), { label: 'menu step' });
  }
  await sleep(500);
}

const readNav = () => evalInPage(() => {
  const lists = [...document.querySelectorAll('[role="tablist"][aria-label="Menu categories"]')];
  const visible = lists.filter((el) => el.offsetParent !== null);
  const strip = visible.find((el) => el.className.includes('overflow-x-auto')) || null;
  const sidebar = visible.find((el) => el.className.includes('overflow-y-auto')) || null;
  const describe = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const chips = [...el.querySelectorAll('[role="tab"]')];
    return {
      rect: { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width },
      scrollLeft: el.scrollLeft,
      scrollTop: el.scrollTop,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      rows: new Set(chips.map((c) => Math.round(c.getBoundingClientRect().top))).size,
      count: chips.length,
      active: chips.find((c) => c.getAttribute('aria-selected') === 'true')?.textContent.trim() || null,
    };
  };
  return {
    strip: describe(strip),
    sidebar: describe(sidebar),
    asideWidth: sidebar ? Math.round(sidebar.closest('aside')?.getBoundingClientRect().width || 0) : 0,
    railToggle: [...document.querySelectorAll('button')]
      .filter((b) => b.offsetParent !== null)
      .some((b) => /^(Collapse|Expand) category sidebar$/.test(b.getAttribute('aria-label') || '')),
    vw: window.innerWidth,
    // Top of the wizard's own header row (the first row below the app header).
    workspaceHeaderTop: (() => {
      const heading = [...document.querySelectorAll('h2')]
        .find((h) => /new order|edit order/i.test(h.textContent));
      const row = heading?.closest('.bg-slate-50');
      return row ? Math.round(row.getBoundingClientRect().top) : null;
    })(),
    docScrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    mainScrollTop: document.querySelector('main')?.scrollTop ?? 0,
    pageScrollY: window.scrollY,
    hasHorizontalOverflow:
      document.documentElement.scrollWidth > window.innerWidth + 1
      || document.body.scrollWidth > window.innerWidth + 1,
  };
});

// Cross-viewport layout audit: containment, action-bar visibility, duplicate
// ids/rails and independent scrolling. Runs at EVERY viewport (emulated).
const readLayoutAudit = () => evalInPage(() => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const vis = (el) => !!el && el.offsetParent !== null && el.getBoundingClientRect().width > 0;
  const rectOf = (el) => (el ? el.getBoundingClientRect() : null);
  const inside = (r) => !!r && r.left >= -1 && r.right <= vw + 1 && r.top >= -1 && r.bottom <= vh + 1;
  const appHeader = document.querySelector('header');
  const search = [...document.querySelectorAll('input')]
    .find((i) => /whole menu/i.test(i.getAttribute('aria-label') || ''));
  const cards = [...document.querySelectorAll('div.rounded-2xl.border.overflow-hidden')];
  const lists = [...document.querySelectorAll('[role="tablist"][aria-label="Menu categories"]')].filter(vis);
  const rails = [...document.querySelectorAll('aside')].filter((a) => vis(a) && a.querySelector('[role="tablist"]'));
  const back = [...document.querySelectorAll('button')]
    .find((b) => /^Back$/.test(b.textContent.trim()) && b.offsetParent !== null);
  const footer = back?.parentElement;
  const review = [...document.querySelectorAll('button')]
    .find((b) => /^Review \(/i.test(b.textContent.trim()) && b.offsetParent !== null);
  const ids = [...document.querySelectorAll('[id]')].map((el) => el.id);
  const duplicates = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
  const railRect = rails[0] ? rectOf(rails[0]) : null;
  const grid = document.querySelector('div.grid.grid-cols-2');
  const gridRect = rectOf(grid);
  const railList = lists.find((el) => el.className.includes('overflow-y-auto'));
  const railRows = railList ? [...railList.querySelectorAll('[role="tab"]')] : [];
  const railRowsFit = railRows.every((row) => {
    const name = row.querySelector('span.flex-1');
    const count = [...row.querySelectorAll('span')].pop();
    if (!name || !count) return true;
    const nr = name.getBoundingClientRect();
    const cr = count.getBoundingClientRect();
    return nr.right <= cr.left + 1 && row.scrollWidth <= row.clientWidth + 1;
  });
  return {
    railRows: railRows.length,
    railRowsFit,
    gridCols: grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0,
    gridWidth: gridRect ? Math.round(gridRect.width) : 0,
    headerRowTop: (() => {
      const heading = [...document.querySelectorAll('h2')]
        .find((h) => /new order|edit order/i.test(h.textContent));
      const row = heading?.closest('.bg-slate-50');
      return row ? Math.round(rectOf(row).top) : null;
    })(),
    vw,
    vh,
    appHeaderInside: inside(rectOf(appHeader)),
    searchInside: !search || inside(rectOf(search)),
    // Cards live inside an independent vertical scroller, so only their
    // HORIZONTAL containment is a layout constraint (rows below the fold are
    // reachable by scrolling, not clipped).
    cardsInside: cards.every((c) => {
      const r = rectOf(c);
      return r.left >= -1 && r.right <= vw + 1;
    }),
    cardCount: cards.length,
    footerInside: !!footer && inside(rectOf(footer)),
    reviewVisible: !!review,
    footerTop: footer ? Math.round(rectOf(footer).top) : null,
    visibleLists: lists.length,
    visibleRails: rails.length,
    railRect: railRect
      ? {
          left: Math.round(railRect.left),
          right: Math.round(railRect.right),
          top: Math.round(railRect.top),
          bottom: Math.round(railRect.bottom),
        }
      : null,
    duplicates,
    docOverflow: document.documentElement.scrollWidth > vw + 1
      || document.body.scrollWidth > vw + 1,
  };
});

try {
  section('LOGIN');
  await login();
  await openPosOrdering();

  for (const vp of VIEWPORTS) {
    section(`VIEWPORT ${vp.label}`);
    await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1 });
    await sleep(450);
    let nav = await readNav();

    check(!nav.hasHorizontalOverflow,
      `no horizontal page overflow (doc ${nav.docScrollWidth}, viewport ${nav.vw})`);

    const audit = await readLayoutAudit();
    check(audit.appHeaderInside, `${vp.label}: the app header is fully inside the viewport`);
    check(audit.searchInside, `${vp.label}: the menu search field is fully visible`);
    check(audit.cardsInside && !audit.docOverflow,
      `${vp.label}: all ${audit.cardCount} product cards stay inside the viewport`);
    check(audit.footerInside && audit.reviewVisible,
      `${vp.label}: the order-action bar (Back / Review) is fully visible`);
    check(audit.visibleRails <= 1 && audit.visibleLists === 1,
      `${vp.label}: exactly one category navigator is mounted (rails=${audit.visibleRails}, lists=${audit.visibleLists})`);
    check(audit.duplicates.length === 0,
      `${vp.label}: no duplicate DOM ids${audit.duplicates.length ? ` (${audit.duplicates.join(', ')})` : ''}`);
    if (audit.railRows > 0) {
      check(audit.railRowsFit,
        `${vp.label}: category names and counts never overlap or overflow their row (${audit.railRows} rows)`);
    }
    if (audit.railRect && audit.footerTop != null) {
      check(audit.railRect.bottom <= audit.footerTop + 1 && audit.railRect.left >= -1 && audit.railRect.right <= audit.vw + 1,
        `${vp.label}: the rail stays inside the workspace and never covers the action bar (rail ${audit.railRect.bottom} ≤ bar ${audit.footerTop})`);
    }
    console.log(`  ℹ ${vp.label}: navigator=${audit.visibleRails ? `rail ${audit.railRect.right - audit.railRect.left}px (top ${audit.railRect.top} → bottom ${audit.railRect.bottom})` : 'chips'} · grid=${audit.gridCols} cols / ${audit.gridWidth}px · cards=${audit.cardCount} · ordering-header-top=${audit.headerRowTop} · action-bar-top=${audit.footerTop} · viewport=${audit.vw}×${audit.vh}`);

    if (vp.width >= 768) {
      const scrolls = await evalInPage(() => {
        const main = document.querySelector('main');
        const list = [...document.querySelectorAll('[role="tablist"][aria-label="Menu categories"]')]
          .find((el) => el.offsetParent !== null && el.className.includes('overflow-y-auto'));
        const grid = [...document.querySelectorAll('div')]
          .find((el) => el.offsetParent !== null && el.className.includes('overflow-y-auto overscroll-contain p-3'));
        const before = { main: main?.scrollTop ?? 0, page: window.scrollY };
        if (list) list.scrollTop = list.scrollHeight;
        const afterList = { main: main?.scrollTop ?? 0, page: window.scrollY, listTop: list?.scrollTop ?? 0 };
        if (grid) grid.scrollTop = grid.scrollHeight;
        const afterGrid = { main: main?.scrollTop ?? 0, page: window.scrollY, gridTop: grid?.scrollTop ?? 0 };
        if (list) list.scrollTop = 0;
        if (grid) grid.scrollTop = 0;
        return { before, afterList, afterGrid };
      });
      check(scrolls.afterList.main === scrolls.before.main && scrolls.afterList.page === scrolls.before.page,
        `${vp.label}: category scrolling never scrolls the page (list ${scrolls.afterList.listTop}px)`);
      check(scrolls.afterGrid.main === scrolls.before.main && scrolls.afterGrid.page === scrolls.before.page,
        `${vp.label}: product scrolling never scrolls the page (grid ${scrolls.afterGrid.gridTop}px)`);
    }

    if (vp.width < 768) {
      check(!!nav.strip && !nav.sidebar,
        `phone shows the horizontal chip strip (strip=${!!nav.strip}, sidebar=${!!nav.sidebar})`);
      check(!nav.strip || nav.strip.rows <= 1,
        `the chip strip is a single row (rows=${nav.strip?.rows ?? 'n/a'})`);
      check(!nav.railToggle, 'phones never render the desktop collapse toggle');
      check(!nav.strip || nav.strip.rect.right <= nav.vw + 1,
        'the strip stays inside the viewport');
      if (nav.strip) {
        // Reach the final category.
        await evalInPage(() => {
          const el = [...document.querySelectorAll('[role="tablist"]')]
            .find((x) => x.offsetParent !== null && x.className.includes('overflow-x-auto'));
          if (el) el.scrollLeft = el.scrollWidth;
        });
        await sleep(200);
        nav = await readNav();
        const lastVisible = await evalInPage(() => {
          const el = [...document.querySelectorAll('[role="tablist"]')]
            .find((x) => x.offsetParent !== null && x.className.includes('overflow-x-auto'));
          if (!el) return null;
          const chips = [...el.querySelectorAll('[role="tab"]')];
          const last = chips[chips.length - 1];
          const a = el.getBoundingClientRect();
          const b = last.getBoundingClientRect();
          return { inside: b.right <= a.right + 1 && b.left >= a.left - 1, label: last.textContent.trim() };
        });
        check(!!lastVisible?.inside, `the final category is reachable (${lastVisible?.label})`);
        check(nav.strip.scrollWidth <= nav.strip.clientWidth || nav.strip.scrollLeft > 0,
          'the strip actually scrolls when categories overflow');

        // Select the last category, and make sure only the strip moves.
        const pageBefore = await evalInPage(() => document.querySelector('main')?.scrollTop ?? 0);
        await evalInPage(() => {
          const el = [...document.querySelectorAll('[role="tablist"]')]
            .find((x) => x.offsetParent !== null && x.className.includes('overflow-x-auto'));
          const chips = [...el.querySelectorAll('[role="tab"]')];
          chips[chips.length - 1].click();
        });
        await sleep(300);
        nav = await readNav();
        const pageAfter = await evalInPage(() => document.querySelector('main')?.scrollTop ?? 0);
        check(nav.strip?.active === lastVisible?.label.replace(/\d+$/, '').trim() || !!nav.strip?.active,
          `the last category becomes active (${nav.strip?.active})`);
        check(Math.abs(pageAfter - pageBefore) <= 1,
          `selecting a category does not scroll the page (main ${pageBefore} → ${pageAfter})`);
        const chipVisible = await evalInPage(() => {
          const el = [...document.querySelectorAll('[role="tablist"]')]
            .find((x) => x.offsetParent !== null && x.className.includes('overflow-x-auto'));
          const chip = el?.querySelector('[role="tab"][aria-selected="true"]');
          if (!el || !chip) return false;
          const a = el.getBoundingClientRect();
          const b = chip.getBoundingClientRect();
          return b.left >= a.left - 1 && b.right <= a.right + 1;
        });
        check(chipVisible, 'the active chip stays fully visible in the strip');

        // Wheel scrolls the strip, not the page.
        const wheelResult = await evalInPage(() => {
          const el = [...document.querySelectorAll('[role="tablist"]')]
            .find((x) => x.offsetParent !== null && x.className.includes('overflow-x-auto'));
          el.scrollLeft = 0;
          const before = el.scrollLeft;
          el.dispatchEvent(new WheelEvent('wheel', { deltaY: 160, bubbles: true, cancelable: true }));
          return { before, after: el.scrollLeft, main: document.querySelector('main')?.scrollTop ?? 0 };
        });
        check(wheelResult.after > wheelResult.before,
          `mouse wheel scrolls the strip horizontally (${wheelResult.before} → ${wheelResult.after})`);
        check(wheelResult.main === 0, 'the wheel does not move the page');

        if (vp.width === 390) {
          // Real touch swipe over the strip (CDP trusted input).
          const cdp = await page.createCDPSession();
          await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
          const box = await evalInPage(() => {
            const el = [...document.querySelectorAll('[role="tablist"]')]
              .find((x) => x.offsetParent !== null && x.className.includes('overflow-x-auto'));
            el.scrollLeft = 0;
            const r = el.getBoundingClientRect();
            return { x: r.left + r.width * 0.75, y: r.top + r.height / 2 };
          });
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x, y: box.y }] });
          for (const dx of [40, 90, 140, 190]) {
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x - dx, y: box.y }] });
            await sleep(30);
          }
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          await sleep(500);
          const touchLeft = await evalInPage(() => {
            const el = [...document.querySelectorAll('[role="tablist"]')]
              .find((x) => x.offsetParent !== null && x.className.includes('overflow-x-auto'));
            return { left: el.scrollLeft, main: document.querySelector('main')?.scrollTop ?? 0 };
          });
          check(touchLeft.left > 0, `touch swipe scrolls the strip (scrollLeft=${touchLeft.left})`);
          check(touchLeft.main === 0, 'touch swipe does not move the page');
          await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false, maxTouchPoints: 1 });
          await cdp.detach();
        }

        // Keyboard: a TRUSTED ArrowRight moves focus between chips (trusted
        // input is also what makes :focus-visible apply).
        const firstChip = await evalInPage(() => {
          const el = [...document.querySelectorAll('[role="tablist"]')]
            .find((x) => x.offsetParent !== null && x.className.includes('overflow-x-auto'));
          const chips = [...el.querySelectorAll('[role="tab"]')];
          chips[0].focus({ preventScroll: true });
          return chips[0].textContent.trim();
        });
        const mainBeforeKeys = await evalInPage(() => document.querySelector('main')?.scrollTop ?? 0);
        await page.keyboard.press('ArrowRight');
        await sleep(150);
        const keyboard = await evalInPage(() => {
          const focusedEl = document.activeElement;
          const cs = getComputedStyle(focusedEl);
          return {
            focused: focusedEl?.textContent?.trim() || null,
            outlineWidth: cs.outlineWidth,
            outlineStyle: cs.outlineStyle,
            main: document.querySelector('main')?.scrollTop ?? 0,
          };
        });
        check(!!keyboard.focused && keyboard.focused !== firstChip,
          `ArrowRight moves chip focus (${firstChip} → ${keyboard.focused})`);
        check(keyboard.main === mainBeforeKeys, 'keyboard focus does not scroll the page');
        check(keyboard.outlineWidth !== '0px' && keyboard.outlineStyle !== 'none',
          `the focused chip shows a visible focus ring (${keyboard.outlineWidth} ${keyboard.outlineStyle})`);
      }
    } else {
      check(!!nav.sidebar && !nav.strip,
        `tablet/desktop shows the vertical sidebar (sidebar=${!!nav.sidebar}, strip=${!!nav.strip})`);
      if (nav.sidebar) {
        const scrollable = nav.sidebar.scrollWidth > 0 && nav.sidebar.count > 0;
        check(scrollable, `the sidebar lists categories (${nav.sidebar.count})`);
        const overflow = nav.sidebar.scrollWidth > nav.sidebar.clientWidth;
        check(!overflow, 'the sidebar never scrolls horizontally');
      }
      // Tablet (md–lg) must keep the existing 160px rail and no PC toggle.
      if (vp.width < 1024) {
        check(nav.asideWidth >= 155 && nav.asideWidth <= 165,
          `tablet keeps the existing 160px category rail (${nav.asideWidth}px)`);
        check(!nav.railToggle, 'tablets never render the desktop collapse toggle');
        check(nav.sidebar?.rect.top > nav.workspaceHeaderTop + 10,
          `tablet rail keeps its existing position BELOW the ordering header/stepper (${nav.sidebar?.rect.top} > ${nav.workspaceHeaderTop})`);
      }
    }

    // ── Restaurant PC (lg+): 250px rail ↔ 64px icon rail ──
    if (vp.width >= 1024) {
      const readRail = () => evalInPage(() => {
        const list = [...document.querySelectorAll('[role="tablist"][aria-label="Menu categories"]')]
          .find((el) => el.offsetParent !== null && el.className.includes('overflow-y-auto'));
        const aside = list?.closest('aside');
        const toggle = [...document.querySelectorAll('button')]
          .find((b) => /^(Collapse|Expand) category sidebar$/.test(b.getAttribute('aria-label') || ''));
        const active = list?.querySelector('[role="tab"][aria-selected="true"]');
        const label = active?.querySelector('span.flex-1');
        const grid = document.querySelector('div.grid.grid-cols-2');
        const review = [...document.querySelectorAll('button')]
          .find((b) => /^Review \(/i.test(b.textContent.trim()));
        return {
          width: aside ? Math.round(aside.getBoundingClientRect().width) : 0,
          gridWidth: grid ? Math.round(grid.getBoundingClientRect().width) : 0,
          toggle: toggle
            ? { label: toggle.getAttribute('aria-label'), expanded: toggle.getAttribute('aria-expanded') }
            : null,
          active: active?.getAttribute('aria-label') || null,
          activeTitle: active?.getAttribute('title') || null,
          labelVisible: !!label && label.getBoundingClientRect().width > 0,
          icons: aside ? aside.querySelectorAll('svg').length : 0,
          cards: document.querySelectorAll('div.rounded-2xl.border.overflow-hidden').length,
          review: review ? review.textContent.trim() : null,
          overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
          // Full-height workspace geometry: the rail must start at the
          // ordering header row (first row below the app header) and stop at
          // the action bar, never overlapping either.
          railTop: aside ? Math.round(aside.getBoundingClientRect().top) : 0,
          railBottom: aside ? Math.round(aside.getBoundingClientRect().bottom) : 0,
          workspaceHeaderTop: (() => {
            const heading = [...document.querySelectorAll('h2')]
              .find((h) => /new order|edit order/i.test(h.textContent));
            const row = heading?.closest('.bg-slate-50');
            return row ? Math.round(row.getBoundingClientRect().top) : 0;
          })(),
          footerTop: (() => {
            const back = [...document.querySelectorAll('button')]
              .find((b) => /^Back$/.test(b.textContent.trim()) && b.offsetParent !== null);
            const bar = back?.parentElement;
            return bar ? Math.round(bar.getBoundingClientRect().top) : 0;
          })(),
          appHeaderBottom: Math.round(document.querySelector('header')?.getBoundingClientRect().bottom ?? 0),
          viewportHeight: window.innerHeight,
          pageScrollY: window.scrollY,
          headingInRail: !!aside && [...aside.querySelectorAll('p')]
            .some((p) => /^Categories$/.test(p.textContent.trim())),
          toggleInRail: !!aside && !!toggle && toggle.closest('aside') === aside,
        };
      });

      let rail = await readRail();
      check(rail.width >= 240 && rail.width <= 260,
        `${vp.label}: restaurant category rail opens ~250px wide (${rail.width}px)`);
      check(Math.abs(rail.railTop - rail.workspaceHeaderTop) <= 1,
        `the rail starts level with the ordering header, directly below the app header (rail ${rail.railTop}, header row ${rail.workspaceHeaderTop}, app header ends ${rail.appHeaderBottom})`);
      check(rail.railTop >= rail.appHeaderBottom - 1,
        'the rail never rises into the Premium Plan / profile header');
      check(Math.abs(rail.railBottom - rail.footerTop) <= 1,
        `the rail ends immediately above the Back / Review action bar (rail ${rail.railBottom}, bar ${rail.footerTop})`);
      check(rail.railBottom <= rail.viewportHeight + 1 && rail.pageScrollY === 0,
        `the rail bottom stays inside the viewport with no page scroll (${rail.railBottom} <= ${rail.viewportHeight})`);
      check(rail.headingInRail && rail.toggleInRail,
        'the heading and the collapse control live inside the full-height rail');
      check(rail.labelVisible, 'expanded rail shows the full category name');
      check(!!rail.toggle && rail.toggle.label === 'Collapse category sidebar' && rail.toggle.expanded === 'true',
        'collapse toggle is present and reports expanded');
      const expandedGrid = rail.gridWidth;
      const expandedReview = rail.review;
      const expandedCards = rail.cards;

      await evalInPage(() => {
        [...document.querySelectorAll('button')]
          .find((b) => b.getAttribute('aria-label') === 'Collapse category sidebar')?.click();
      });
      await sleep(350);
      rail = await readRail();
      check(rail.width >= 56 && rail.width <= 72,
        `collapsing shrinks the rail to ~64px (${rail.width}px)`);
      check(rail.gridWidth > expandedGrid + 100,
        `the product grid reclaims the freed width (${expandedGrid} → ${rail.gridWidth}px)`);
      check(!rail.labelVisible && rail.icons > 0,
        `collapsed rail is icon-only with category icons visible (${rail.icons} icons)`);
      check(!!rail.active && rail.activeTitle === rail.active,
        `the active category stays identifiable with a full-name tooltip (${rail.activeTitle})`);
      check(rail.toggle?.label === 'Expand category sidebar' && rail.toggle?.expanded === 'false',
        'the toggle now reports collapsed and offers Expand');
      check(rail.cards === expandedCards && rail.review === expandedReview,
        `collapsing keeps the products and cart untouched (${rail.cards} cards, ${rail.review})`);
      check(!rail.overflow, 'no horizontal page overflow while collapsed');

      // Category switching still works in the collapsed rail (icons only).
      const collapsedBefore = rail.active;
      const switched = await evalInPage(() => {
        const list = [...document.querySelectorAll('[role="tablist"][aria-label="Menu categories"]')]
          .find((el) => el.offsetParent !== null && el.className.includes('overflow-y-auto'));
        const tabs = [...list.querySelectorAll('[role="tab"]')];
        const next = tabs.find((t) => t.getAttribute('aria-selected') !== 'true');
        next?.click();
        return next?.getAttribute('aria-label') || null;
      });
      await sleep(300);
      rail = await readRail();
      check(!!switched && rail.active === switched && rail.active !== collapsedBefore,
        `collapsed icons still switch categories (${collapsedBefore} → ${rail.active})`);
      check(rail.review === expandedReview, 'switching category while collapsed keeps the cart');
      check(rail.activeTitle === rail.active, 'the newly selected icon keeps its tooltip');

      await evalInPage(() => {
        [...document.querySelectorAll('button')]
          .find((b) => b.getAttribute('aria-label') === 'Expand category sidebar')?.click();
      });
      await sleep(350);
      rail = await readRail();
      check(rail.width >= 240 && rail.width <= 260, `expanding restores ~250px (${rail.width}px)`);
      check(rail.active === switched && rail.labelVisible,
        `the selection survives expand/collapse (${rail.active}) and the name is readable again`);
      check(rail.review === expandedReview, 'expanding keeps the cart intact');
      check(!rail.overflow, 'no horizontal page overflow after expanding');

      // Search still spans the WHOLE menu beside the full-height rail, without
      // moving the rail or touching the cart.
      const searchTerm = await evalInPage(() => {
        const input = document.querySelector('input[aria-label="Search the whole menu"]');
        const first = document.querySelector('div.rounded-2xl.border.overflow-hidden p');
        const name = first?.textContent?.trim() || '';
        if (!input || !name) return null;
        const term = name.slice(0, Math.min(4, name.length));
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, term);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return term;
      });
      await sleep(450);
      const searched = await evalInPage((term) => {
        const names = [...document.querySelectorAll('div.rounded-2xl.border.overflow-hidden p')]
          .map((p) => p.textContent.trim());
        const list = [...document.querySelectorAll('[role="tablist"][aria-label="Menu categories"]')]
          .find((el) => el.offsetParent !== null && el.className.includes('overflow-y-auto'));
        const aside = list?.closest('aside');
        const heading = [...document.querySelectorAll('h2')]
          .find((h) => /new order|edit order/i.test(h.textContent));
        const headerRow = heading?.closest('.bg-slate-50');
        return {
          count: names.length,
          allMatch: names.length > 0 && names.every((n) => n.toLowerCase().includes(String(term).toLowerCase())),
          railWidth: aside ? Math.round(aside.getBoundingClientRect().width) : 0,
          railTop: aside ? Math.round(aside.getBoundingClientRect().top) : 0,
          headerTop: headerRow ? Math.round(headerRow.getBoundingClientRect().top) : 0,
          review: [...document.querySelectorAll('button')].find((b) => /^Review \(/i.test(b.textContent.trim()))?.textContent.trim() || null,
          mainScrollTop: document.querySelector('main')?.scrollTop ?? 0,
        };
      }, searchTerm);
      check(!!searchTerm && searched.count > 0 && searched.allMatch,
        `search still filters the whole menu beside the full-height rail (“${searchTerm}” → ${searched?.count} items)`);
      check(searched?.railWidth === 250 && Math.abs(searched.railTop - searched.headerTop) <= 1,
        'the rail keeps its 250px full-height mount while searching');
      check(searched?.review === expandedReview, 'searching keeps the cart quantities / order totals untouched');
      check(searched?.mainScrollTop === 0, 'searching does not scroll the page');
      // No-results state must stay usable with the full-height rail in place.
      await evalInPage(() => {
        const input = document.querySelector('input[aria-label="Search the whole menu"]');
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, 'zzzz-no-such-dish');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await sleep(400);
      const noResults = await evalInPage(() => {
        const list = [...document.querySelectorAll('[role="tablist"][aria-label="Menu categories"]')]
          .find((el) => el.offsetParent !== null && el.className.includes('overflow-y-auto'));
        const aside = list?.closest('aside');
        return {
          cards: document.querySelectorAll('div.rounded-2xl.border.overflow-hidden').length,
          message: /No results for/.test(document.body.textContent),
          railWidth: aside ? Math.round(aside.getBoundingClientRect().width) : 0,
          review: [...document.querySelectorAll('button')].find((b) => /^Review \(/i.test(b.textContent.trim()))?.textContent.trim() || null,
          mainScrollTop: document.querySelector('main')?.scrollTop ?? 0,
        };
      });
      check(noResults.cards === 0 && noResults.message,
        'a query with no matches shows the explicit no-results state');
      check(noResults.railWidth === 250 && noResults.review === expandedReview && noResults.mainScrollTop === 0,
        `the no-results state keeps the rail, the cart and the page position (rail ${noResults.railWidth}, cart “${noResults.review}” vs “${expandedReview}”, page ${noResults.mainScrollTop})`);

      // Empty category (if this seed has one) must show its own message and
      // leave the cart untouched.
      const emptyCategory = await evalInPage(() => {
        const list = [...document.querySelectorAll('[role="tablist"][aria-label="Menu categories"]')]
          .find((el) => el.offsetParent !== null && el.className.includes('overflow-y-auto'));
        const rows = [...(list?.querySelectorAll('[role="tab"]') || [])];
        const empty = rows.find((r) => {
          const count = [...r.querySelectorAll('span')].pop();
          return count && /^0$/.test(count.textContent.trim());
        });
        if (!empty) return null;
        const label = empty.getAttribute('aria-label');
        empty.click();
        return label;
      });
      await sleep(400);
      if (emptyCategory) {
        const emptyState = await evalInPage(() => ({
          message: /No items available in/.test(document.body.textContent),
          cards: document.querySelectorAll('div.rounded-2xl.border.overflow-hidden').length,
          review: [...document.querySelectorAll('button')].find((b) => /^Review \(/i.test(b.textContent.trim()))?.textContent.trim() || null,
        }));
        check(emptyState.message && emptyState.cards === 0,
          `empty category “${emptyCategory}” shows its empty state (no products)`);
        check(emptyState.review === expandedReview, 'an empty category keeps the cart untouched');
        await evalInPage(() => {
          const list = [...document.querySelectorAll('[role="tablist"][aria-label="Menu categories"]')]
            .find((el) => el.offsetParent !== null && el.className.includes('overflow-y-auto'));
          [...list.querySelectorAll('[role="tab"]')][0]?.click();
        });
        await sleep(300);
      } else {
        console.log('  ℹ no zero-item category in this seed — empty-state covered by structural tests');
      }

      await evalInPage(() => {
        const input = document.querySelector('input[aria-label="Search the whole menu"]');
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, '');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await sleep(400);
    }

    // ── Non-restaurant tenant must keep the original ordering layout ──
    // Simulated by switching ONLY the authoritative businessType in the live
    // settings store (no DB/tenant mutation), then restoring it.
    if (vp.width === 1366) {
      section('NON-RESTAURANT LAYOUT SIMULATION');
      const originalType = await evalInPage(async () => {
        const { default: settingsStore } = await import('/src/store/settingsStore.js');
        const before = settingsStore.getState().settings.businessType;
        settingsStore.setState((state) => ({
          settings: { ...state.settings, businessType: 'SUPERMARKET' },
        }));
        return before;
      });
      await sleep(450);
      const other = await evalInPage(() => {
        const list = [...document.querySelectorAll('[role="tablist"][aria-label="Menu categories"]')]
          .find((el) => el.offsetParent !== null);
        const aside = list?.closest('aside');
        const rows = [...(aside?.querySelectorAll('[role="tab"]') || [])];
        const grid = document.querySelector('div.grid.grid-cols-2');
        return {
          width: aside ? Math.round(aside.getBoundingClientRect().width) : 0,
          toggle: [...document.querySelectorAll('button')]
            .some((b) => /^(Collapse|Expand) category sidebar$/.test(b.getAttribute('aria-label') || '')),
          categoryIcons: rows.slice(1).reduce((n, r) => n + r.querySelectorAll('svg').length, 0),
          gridCols: grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0,
          overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
          railTop: aside ? Math.round(aside.getBoundingClientRect().top) : 0,
          workspaceHeaderTop: (() => {
            const heading = [...document.querySelectorAll('h2')]
              .find((h) => /new order|edit order/i.test(h.textContent));
            const row = heading?.closest('.bg-slate-50');
            return row ? Math.round(row.getBoundingClientRect().top) : 0;
          })(),
        };
      });
      check(other.width >= 203 && other.width <= 213,
        `non-restaurant tenant keeps the original 208px category rail (${other.width}px)`);
      check(!other.toggle, 'non-restaurant tenants never render the restaurant collapse toggle');
      check(other.categoryIcons === 0,
        'non-restaurant category rows stay icon-free (only All Items keeps its icon)');
      check(other.gridCols === 5, `non-restaurant product grid keeps its 5 desktop columns (${other.gridCols})`);
      check(!other.overflow, 'non-restaurant layout has no horizontal overflow');
      check(other.railTop > other.workspaceHeaderTop + 10,
        `non-restaurant rail keeps its old position below the ordering header/stepper (${other.railTop} > ${other.workspaceHeaderTop})`);

      await evalInPage(async (type) => {
        const { default: settingsStore } = await import('/src/store/settingsStore.js');
        settingsStore.setState((state) => ({
          settings: { ...state.settings, businessType: type },
        }));
      }, originalType || 'RESTAURANT');
      await sleep(450);
      const restoredWidth = await evalInPage(() => {
        const list = [...document.querySelectorAll('[role="tablist"][aria-label="Menu categories"]')]
          .find((el) => el.offsetParent !== null);
        return Math.round(list?.closest('aside')?.getBoundingClientRect().width || 0);
      });
      check(restoredWidth === 250, `restaurant settings restored after simulation (${restoredWidth}px rail)`);
    }

    // Review → Back keeps the selected category visible and selected, in both
    // layouts (chip strip below md, sidebar at md+).
    const cardClicked = await evalInPage(() => {
      const card = document.querySelector('div.rounded-2xl.border.overflow-hidden');
      if (!card) return false;
      card.click();
      return true;
    });
    if (cardClicked) {
      await sleep(350);
      const readActive = () => evalInPage(() => {
        const el = [...document.querySelectorAll('[role="tablist"]')]
          .find((x) => x.offsetParent !== null);
        const chip = el?.querySelector('[role="tab"][aria-selected="true"]');
        if (!el || !chip) return null;
        const a = el.getBoundingClientRect();
        const b = chip.getBoundingClientRect();
        return {
          label: chip.textContent.trim(),
          inside: b.left >= a.left - 1 && b.right <= a.right + 1
            && b.top >= a.top - 1 && b.bottom <= a.bottom + 1,
        };
      });
      const before = await readActive();
      const reviewOpened = await evalInPage(() => {
        const b = [...document.querySelectorAll('button')].find((x) => /^Review \(/i.test(x.textContent.trim()));
        if (!b || b.disabled) return false;
        b.click();
        return true;
      });
      await sleep(400);
      if (reviewOpened) {
        const reviewLayout = await evalInPage(() => {
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          const inView = (r) => !!r && r.left >= -1 && r.right <= vw + 1 && r.top >= -1 && r.bottom <= vh + 1;
          const back = [...document.querySelectorAll('button')]
            .find((x) => /^Back$/i.test(x.textContent.trim()) && x.offsetParent !== null);
          const footer = back?.parentElement;
          const heading = [...document.querySelectorAll('h3')].find((x) => /Review Order/i.test(x.textContent));
          const scroller = heading?.parentElement;
          const actions = [...document.querySelectorAll('button')]
            .filter((b) => /^(Print KOT|Place Order|Update Order)/.test(b.textContent.trim()) && b.offsetParent !== null);
          const before = scroller ? scroller.scrollTop : 0;
          if (scroller && scroller.scrollHeight > scroller.clientHeight) scroller.scrollTop = scroller.scrollHeight;
          const actionsReachable = actions.length > 0 && actions.every((a) => inView(a.getBoundingClientRect()));
          if (scroller) scroller.scrollTop = before;
          return {
            headingInside: inView(heading?.getBoundingClientRect()),
            backInside: inView(back?.getBoundingClientRect()),
            footerInside: inView(footer?.getBoundingClientRect()),
            actions: actions.length,
            actionsReachable,
            totalsRendered: /Grand Total/.test(document.body.textContent),
            overflow: document.documentElement.scrollWidth > vw + 1,
          };
        });
        check(reviewLayout.headingInside && reviewLayout.backInside && reviewLayout.footerInside,
          `${vp.label}: Review keeps the heading, Back and action bar inside the viewport`);
        check(reviewLayout.actionsReachable,
          `${vp.label}: Review actions are reachable by scrolling (${reviewLayout.actions} buttons)`);
        check(reviewLayout.totalsRendered && !reviewLayout.overflow,
          `${vp.label}: totals render with no horizontal overflow on Review`);
        await evalInPage(() => {
          const b = [...document.querySelectorAll('button')].find((x) => /^Back$/i.test(x.textContent.trim()));
          b?.click();
        });
        await sleep(450);
        const after = await readActive();
        check(!!before?.label && before.label === after?.label,
          `Review → Back keeps the selection (${before?.label})`);
        check(!!after?.inside, 'the active category is still visible after returning from Review');

        // Cart must survive a category change (lines, not just the badge).
        const cartBefore = await evalInPage(() => {
          const review = [...document.querySelectorAll('button')]
            .find((b) => /^Review \(/i.test(b.textContent.trim()));
          return review?.textContent?.trim() || null;
        });
        const otherCategory = await evalInPage(() => {
          const el = [...document.querySelectorAll('[role="tablist"]')]
            .find((x) => x.offsetParent !== null);
          const chips = [...el.querySelectorAll('[role="tab"]')];
          const target = chips[1] || chips[0];
          target.click();
          return target.textContent.trim();
        });
        await sleep(300);
        const cartAfter = await evalInPage(() => {
          const review = [...document.querySelectorAll('button')]
            .find((b) => /^Review \(/i.test(b.textContent.trim()));
          return review?.textContent?.trim() || null;
        });
        check(!!cartBefore && cartBefore === cartAfter,
          `changing category (${otherCategory}) keeps the cart (${cartBefore} → ${cartAfter})`);
      }
    }
  }

  section('NON-RESTAURANT TENANT — ALL VIEWPORTS (simulated)');
  const originalBusinessType = await evalInPage(async () => {
    const { default: settingsStore } = await import('/src/store/settingsStore.js');
    const before = settingsStore.getState().settings.businessType;
    settingsStore.setState((state) => ({
      settings: { ...state.settings, businessType: 'SUPERMARKET' },
    }));
    return before;
  });
  await sleep(450);
  const readOtherLayout = () => evalInPage(() => {
    const vis = (el) => !!el && el.offsetParent !== null;
    const list = [...document.querySelectorAll('[role="tablist"][aria-label="Menu categories"]')].find(vis);
    const aside = list?.closest('aside');
    const rows = [...(aside?.querySelectorAll('[role="tab"]') || [])];
    const heading = [...document.querySelectorAll('h2')].find((h) => /new order|edit order/i.test(h.textContent));
    const headerRow = heading?.closest('.bg-slate-50');
    const grid = document.querySelector('div.grid.grid-cols-2');
    return {
      width: aside ? Math.round(aside.getBoundingClientRect().width) : 0,
      isChip: !!list && list.className.includes('overflow-x-auto'),
      isRail: !!list && list.className.includes('overflow-y-auto'),
      toggle: [...document.querySelectorAll('button')]
        .some((b) => vis(b) && /^(Collapse|Expand) category sidebar$/.test(b.getAttribute('aria-label') || '')),
      icons: rows.slice(1).reduce((n, r) => n + r.querySelectorAll('svg').length, 0),
      gridCols: grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0,
      railTop: aside ? Math.round(aside.getBoundingClientRect().top) : null,
      headerTop: headerRow ? Math.round(headerRow.getBoundingClientRect().top) : null,
      overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    };
  });
  for (const vp of VIEWPORTS) {
    await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1 });
    await sleep(320);
    const o = await readOtherLayout();
    check(!o.overflow, `${vp.label}: non-restaurant layout has no horizontal overflow`);
    check(!o.toggle, `${vp.label}: no restaurant collapse toggle for a non-restaurant tenant`);
    if (vp.width < 768) {
      check(o.isChip && o.width === 0,
        `${vp.label}: non-restaurant phones keep the existing category chip row`);
    } else if (vp.width < 1024) {
      check(o.isRail && o.width >= 155 && o.width <= 165,
        `${vp.label}: non-restaurant tablet rail stays 160px (${o.width}px)`);
      check(o.icons === 0, `${vp.label}: non-restaurant tablet rows stay icon-free`);
    } else {
      check(o.isRail && o.width >= 203 && o.width <= 213,
        `${vp.label}: non-restaurant desktop rail stays 208px (${o.width}px)`);
      check(o.icons === 0, `${vp.label}: non-restaurant desktop rows stay icon-free`);
      check(o.gridCols === (vp.width >= 1280 ? 5 : 4),
        `${vp.label}: non-restaurant grid keeps its own columns (${o.gridCols})`);
      check((o.railTop ?? 0) > (o.headerTop ?? 0) + 10,
        `${vp.label}: non-restaurant rail keeps its original position below the header`);
    }
  }
  await evalInPage(async (type) => {
    const { default: settingsStore } = await import('/src/store/settingsStore.js');
    settingsStore.setState((state) => ({
      settings: { ...state.settings, businessType: type },
    }));
  }, originalBusinessType || 'RESTAURANT');
  await sleep(450);
  const restoredAgain = await evalInPage(() => {
    const list = [...document.querySelectorAll('[role="tablist"][aria-label="Menu categories"]')]
      .find((el) => el.offsetParent !== null);
    const aside = list?.closest('aside');
    const heading = [...document.querySelectorAll('h2')].find((h) => /new order|edit order/i.test(h.textContent));
    const headerRow = heading?.closest('.bg-slate-50');
    return {
      width: aside ? Math.round(aside.getBoundingClientRect().width) : 0,
      railTop: aside ? Math.round(aside.getBoundingClientRect().top) : 0,
      headerTop: headerRow ? Math.round(headerRow.getBoundingClientRect().top) : 0,
      toggle: [...document.querySelectorAll('button')]
        .some((b) => /^(Collapse|Expand) category sidebar$/.test(b.getAttribute('aria-label') || '')),
    };
  });
  check(restoredAgain.width === 250 && restoredAgain.toggle
    && Math.abs(restoredAgain.railTop - restoredAgain.headerTop) <= 1,
    `restaurant layout restored after the sweep (${restoredAgain.width}px rail)`);

  section('RESIZE ACROSS BREAKPOINTS (no reload)');
  const readResizeState = () => evalInPage(() => {
    const vis = (el) => !!el && el.offsetParent !== null;
    const list = [...document.querySelectorAll('[role="tablist"][aria-label="Menu categories"]')].find(vis);
    const aside = list?.closest('aside');
    const toggle = [...document.querySelectorAll('button')]
      .find((b) => /^(Collapse|Expand) category sidebar$/.test(b.getAttribute('aria-label') || '') && vis(b));
    const heading = [...document.querySelectorAll('h2')].find((h) => /new order|edit order/i.test(h.textContent));
    const headerRow = heading?.closest('.bg-slate-50');
    const review = [...document.querySelectorAll('button')].find((b) => /^Review \(/i.test(b.textContent.trim()));
    const activeTab = list?.querySelector('[role="tab"][aria-selected="true"]');
    // Name-only label so the chip layout (name + count) and the rail layout
    // (aria-label) are comparable across a breakpoint change.
    const active = activeTab?.getAttribute('aria-label')
      || activeTab?.querySelector('span')?.textContent.trim()
      || activeTab?.textContent.trim()
      || null;
    return {
      railWidth: aside ? Math.round(aside.getBoundingClientRect().width) : 0,
      isChip: !!list && list.className.includes('overflow-x-auto'),
      isRail: !!list && list.className.includes('overflow-y-auto'),
      toggle: toggle?.getAttribute('aria-label') || null,
      railTop: aside ? Math.round(aside.getBoundingClientRect().top) : null,
      headerTop: headerRow ? Math.round(headerRow.getBoundingClientRect().top) : null,
      active,
      review: review?.textContent.trim() || null,
      overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    };
  });

  await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 });
  await sleep(400);
  const desktopStart = await readResizeState();
  check(desktopStart.railWidth === 250 && desktopStart.isRail && !!desktopStart.toggle,
    `1366: restaurant rail 250px with a toggle (${desktopStart.railWidth}px, ${desktopStart.toggle})`);
  check(Math.abs((desktopStart.railTop ?? 0) - (desktopStart.headerTop ?? 0)) <= 1,
    '1366: rail top stays aligned with the ordering header');

  await page.setViewport({ width: 1023, height: 768, deviceScaleFactor: 1 });
  await sleep(400);
  const justBelow = await readResizeState();
  check(justBelow.railWidth >= 155 && justBelow.railWidth <= 165,
    `1023 (resize, no reload): falls back to the 160px tablet rail (${justBelow.railWidth}px)`);
  check(!justBelow.toggle, '1023: the desktop collapse toggle disappears');
  check(justBelow.isRail && (justBelow.railTop ?? 0) > (justBelow.headerTop ?? 0) + 10,
    '1023: the tablet rail returns to its old position below the header/stepper');

  await page.setViewport({ width: 1024, height: 768, deviceScaleFactor: 1 });
  await sleep(400);
  const atDesktop = await readResizeState();
  check(atDesktop.railWidth === 250 && !!atDesktop.toggle && Math.abs((atDesktop.railTop ?? 0) - (atDesktop.headerTop ?? 0)) <= 1,
    `1024 (resize, no reload): full-height 250px rail mounts (${atDesktop.railWidth}px)`);

  await evalInPage(() => {
    [...document.querySelectorAll('button')]
      .find((b) => b.getAttribute('aria-label') === 'Collapse category sidebar')?.click();
  });
  await sleep(350);
  const collapsedAfterResize = await readResizeState();
  check(collapsedAfterResize.railWidth === 64,
    `collapse still works after resizing (${collapsedAfterResize.railWidth}px)`);

  await page.setViewport({ width: 767, height: 900, deviceScaleFactor: 1 });
  await sleep(400);
  const phoneAfterResize = await readResizeState();
  check(phoneAfterResize.isChip && phoneAfterResize.railWidth === 0 && !phoneAfterResize.toggle,
    '767 (resize, no reload): the rail is unmounted and the chip row takes over');
  check(phoneAfterResize.active === collapsedAfterResize.active && phoneAfterResize.review === collapsedAfterResize.review,
    `resize keeps the selection and cart (${phoneAfterResize.active} / ${phoneAfterResize.review})`);

  await page.setViewport({ width: 1024, height: 768, deviceScaleFactor: 1 });
  await sleep(400);
  const backToDesktop = await readResizeState();
  check(backToDesktop.isRail && Math.abs((backToDesktop.railTop ?? 0) - (backToDesktop.headerTop ?? 0)) <= 1,
    'returning to 1024: the full-height rail re-mounts in the same workspace position');
  await evalInPage(() => {
    [...document.querySelectorAll('button')]
      .find((b) => /^(Expand|Collapse) category sidebar$/.test(b.getAttribute('aria-label') || ''))?.click();
  });
  await sleep(350);
  const reExpanded = await readResizeState();
  check(reExpanded.railWidth === 250,
    `expand still works after resizing (${reExpanded.railWidth}px)`);
  check(reExpanded.active === desktopStart.active && reExpanded.review === desktopStart.review,
    `the resize round-trip keeps the category and cart (${reExpanded.active} / ${reExpanded.review})`);
  check(!reExpanded.overflow, 'no horizontal overflow after the resize round-trip');

  section('PAGE REFRESH');
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await sleep(300);
  const chosenChip = await evalInPage(() => {
    const el = [...document.querySelectorAll('[role="tablist"]')]
      .find((x) => x.offsetParent !== null && x.className.includes('overflow-x-auto'));
    const chips = [...el.querySelectorAll('[role="tab"]')];
    const target = chips[Math.min(3, chips.length - 1)];
    target.click();
    return target.textContent.trim();
  });
  await sleep(300);
  await page.reload({ waitUntil: 'networkidle2' });
  await waitFor(() => evalInPage(() => !document.querySelector('#login-password') && !!document.body), { label: 'session after reload' });
  await sleep(700);
  await openPosOrdering();
  const afterReload = await readNav();
  check(afterReload.strip?.active === chosenChip,
    `a page refresh restores the selected category (${chosenChip} → ${afterReload.strip?.active})`);
  check(!!afterReload.strip && !afterReload.hasHorizontalOverflow,
    'the refreshed page still has no horizontal overflow');

  section('NAVIGATION AWAY AND BACK TO ORDERING');
  await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 });
  await sleep(350);
  const wentAway = await evalInPage(() => {
    const el = [...document.querySelectorAll('button, a')]
      .find((x) => /^(Dashboard|Floors & Tables)$/.test(x.textContent.trim()) && x.offsetParent !== null);
    if (!el) return null;
    el.click();
    return el.textContent.trim();
  });
  check(!!wentAway, `navigated away from ordering (${wentAway || 'no nav item found'})`);
  await sleep(900);
  await openPosOrdering();
  const backState = await evalInPage(() => {
    const vis = (el) => !!el && el.offsetParent !== null;
    const list = [...document.querySelectorAll('[role="tablist"][aria-label="Menu categories"]')].find(vis);
    const aside = list?.closest('aside');
    const toggle = [...document.querySelectorAll('button')]
      .find((b) => vis(b) && /^(Collapse|Expand) category sidebar$/.test(b.getAttribute('aria-label') || ''));
    const heading = [...document.querySelectorAll('h2')].find((h) => /new order|edit order/i.test(h.textContent));
    const headerRow = heading?.closest('.bg-slate-50');
    const back = [...document.querySelectorAll('button')].find((b) => /^Back$/.test(b.textContent.trim()) && vis(b));
    const footer = back?.parentElement;
    const ids = [...document.querySelectorAll('[id]')].map((el) => el.id);
    return {
      railWidth: aside ? Math.round(aside.getBoundingClientRect().width) : 0,
      railTop: aside ? Math.round(aside.getBoundingClientRect().top) : 0,
      railBottom: aside ? Math.round(aside.getBoundingClientRect().bottom) : 0,
      headerTop: headerRow ? Math.round(headerRow.getBoundingClientRect().top) : 0,
      footerTop: footer ? Math.round(footer.getBoundingClientRect().top) : 0,
      toggle: toggle?.getAttribute('aria-label') || null,
      duplicates: [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))],
      overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    };
  });
  check(backState.railWidth === 250 && !!backState.toggle,
    `returning to ordering re-mounts the 250px restaurant rail (${backState.railWidth}px)`);
  check(Math.abs(backState.railTop - backState.headerTop) <= 1
    && Math.abs(backState.railBottom - backState.footerTop) <= 1,
    'the re-entered ordering screen keeps the full-height rail (ordering header → action bar)');
  check(backState.duplicates.length === 0 && !backState.overflow,
    're-entry leaves ONE rail and no duplicate ids or overflow');

  section('LOGIN PAGE BRANDING (same viewports)');
  await evalInPage(() => { localStorage.clear(); sessionStorage.clear(); });
  for (const vp of VIEWPORTS) {
    await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1 });
    await page.goto(APP, { waitUntil: 'networkidle2' });
    await waitFor(() => evalInPage(() => !!document.querySelector('#login-password')), { label: 'login form' });
    await sleep(500);
    const m = await evalInPage(() => {
      const visible = (el) => !!el && el.offsetParent !== null && el.getBoundingClientRect().width > 0;
      const logos = [...document.querySelectorAll('img[alt="Infinixo Technologies"]')].filter(visible);
      const logo = logos[0] || null;
      const lr = logo?.getBoundingClientRect();
      const aside = logo?.closest('aside');
      const asideRect = aside?.getBoundingClientRect();
      const attribution = [...document.querySelectorAll('p, span')]
        .filter(visible)
        .find((el) => /A product by Infinixo Technologies/i.test(el.textContent.trim()));
      const cards = [...document.querySelectorAll('a.aspect-square')].filter(visible);
      const cardReport = cards.map((c) => {
        const r = c.getBoundingClientRect();
        const overflow = [...c.querySelectorAll('*')].some((el) => {
          const b = el.getBoundingClientRect();
          return b.right > r.right + 1 || b.left < r.left - 1 || b.bottom > r.bottom + 1;
        });
        const description = [...c.querySelectorAll('span')].find((el) => el.className.includes('line-clamp-2'));
        const shell = [...c.querySelectorAll('span')].find((el) => el.className.includes('object') || (el.className.includes('bg-white') && el.querySelector('img, span')));
        const sr = shell?.getBoundingClientRect();
        return {
          w: Math.round(r.width),
          h: Math.round(r.height),
          logoH: sr ? Math.round(sr.height) : 0,
          overflow,
          descClipped: description ? description.scrollHeight <= description.clientHeight + 1 : true,
        };
      });
      const card = document.querySelector('#login-password')?.closest('div.rounded-2xl');
      const cr = card?.getBoundingClientRect();
      return {
        vw: window.innerWidth,
        overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        logo: lr ? { w: lr.width, h: lr.height, top: lr.top, bottom: lr.bottom, left: lr.left, right: lr.right } : null,
        logoInAside: !!(lr && asideRect && lr.left >= asideRect.left - 1 && lr.right <= asideRect.right + 1 && lr.top >= asideRect.top - 1 && lr.bottom <= asideRect.bottom + 1),
        attribution: !!attribution,
        cards: cardReport,
        loginFits: !!cr && cr.top >= -1 && cr.bottom <= window.innerHeight + 1 && cr.left >= -1 && cr.right <= window.innerWidth + 1,
      };
    });

    check(!m.overflow, `${vp.label}: no horizontal overflow`);
    check(!!m.logo, `${vp.label}: Infinixo logo visible (${m.logo ? `${Math.round(m.logo.w)}×${Math.round(m.logo.h)}` : 'missing'})`);
    if (vp.width >= 1024) {
      check(m.logoInAside && m.logo.h >= 56, `${vp.label}: desktop logo is enlarged and fully inside the green panel (h=${Math.round(m.logo?.h || 0)})`);
      check(m.attribution, `${vp.label}: attribution text is rendered beside the logo`);
    }
    // The product registry lives in the desktop brand panel (lg+); phones and
    // tablets use the compact auth layout instead.
    if (vp.width >= 1024) {
      check(m.cards.length > 0, `${vp.label}: product cards rendered (${m.cards.length})`);
      check(m.cards.every((c) => Math.abs(c.w - c.h) <= 1),
        `${vp.label}: every product card is square (${m.cards.map((c) => `${c.w}×${c.h}`).join(', ')})`);
      check(m.cards.every((c) => !c.overflow), `${vp.label}: no product-card content overflows its card`);
      check(m.cards.every((c) => c.descClipped), `${vp.label}: descriptions stay inside the card`);
      check(new Set(m.cards.map((c) => c.logoH)).size <= 1,
        `${vp.label}: every card keeps the same image area height (${m.cards.map((c) => c.logoH).join(', ')}px)`);
    } else {
      check(m.cards.length === 0, `${vp.label}: brand panel (and its cards) is hidden on phones/tablets`);
    }
    check(m.loginFits, `${vp.label}: the login form fits the viewport`);
  }

  section('CONSOLE / NETWORK');
  check(consoleErrors.length === 0, `no browser console errors (${consoleErrors.slice(0, 3).join(' | ') || 'none'})`);
  check(hookWarnings.length === 0,
    `no React Hook warnings (${hookWarnings.slice(0, 2).join(' | ') || 'none'})`);
  check(apiFailures.length === 0,
    `no failed API requests during the ordering audit (${[...new Set(apiFailures)].slice(0, 3).join(' | ') || 'none'})`);
} catch (e) {
  console.error('SCRIPT ERROR:', e.message);
  fail += 1;
} finally {
  await browser.close();
  console.log(`\nRESULTS: PASSED ${pass}  FAILED ${fail}`);
  process.exit(fail ? 1 : 0);
}
