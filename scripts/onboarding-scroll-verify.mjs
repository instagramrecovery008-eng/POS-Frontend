/**
 * Real-browser verification that the onboarding wizard scrolls on ALL devices.
 *
 * Launches headless Chrome, opens the Create New Account wizard (Account step),
 * and for each required viewport:
 *   - identifies the actual scroll owner (document vs a nested container),
 *   - drives a synthetic TOUCH swipe (finger drag) starting over the form card
 *     (not window.scrollTo),
 *   - scrolls to the bottom and checks the password fields and the
 *     "Create New Account" button are fully reachable,
 *   - checks for horizontal overflow and console errors.
 *
 * It also injects tall content into the shared wizard shell to prove the scroll
 * owner handles arbitrarily long steps (Documents / Plan / Review).
 *
 * Run (with the dev server up): node scripts/onboarding-scroll-verify.mjs
 */
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH
  || 'C:\\Users\\Divyang\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const DEV = process.env.DEV_URL || 'http://localhost:3000';

const VIEWPORTS = [
  { w: 320, h: 640 },
  { w: 375, h: 812 },
  { w: 390, h: 844 },
  { w: 768, h: 1024 },
  { w: 1366, h: 768 },
];

let pass = 0, fail = 0;
const check = (cond, msg) => { process.stdout.write(cond ? '  ✅ ' : '  ❌ '); console.log(msg); cond ? pass++ : fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-proxy-server', '--disable-extensions'],
});
const page = await browser.newPage();
const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(String(e.message)));
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

const cdp = await page.createCDPSession();

async function openAccountStep(vp) {
  await page.setViewport({ width: vp.w, height: vp.h, isMobile: vp.w < 768, hasTouch: true, deviceScaleFactor: 1 });
  await page.goto(DEV, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('Create New Account')),
    { timeout: 20000 },
  );
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Create New Account')).click();
  });
  await page.waitForFunction(() => document.body.innerText.includes('Create Your Account'), { timeout: 20000 });
  await sleep(500);
}

/** Simulate a native touch swipe (finger drag) upward at x, from y0 to y1. */
async function touchSwipeUp(x, y0, y1) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
  const step = Math.max(8, Math.round((y0 - y1) / 12));
  for (let y = y0; y >= y1; y -= step) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
    await sleep(8);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(450);
}

const readState = () => page.evaluate(() => {
  const scroller = document.scrollingElement || document.documentElement;
  const bodyCS = getComputedStyle(document.body);
  const card = document.querySelector('main section');
  const cta = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Create New Account'));
  const rect = cta ? cta.getBoundingClientRect() : null;
  const cardRect = card ? card.getBoundingClientRect() : null;
  return {
    maxScroll: scroller.scrollHeight - scroller.clientHeight,
    scrollTop: scroller.scrollTop,
    scrollerIsHtml: scroller === document.documentElement,
    bodyOverflowY: bodyCS.overflowY,
    bodyIsScrollContainer: bodyCS.overflowY !== 'visible' && document.body.scrollHeight > document.body.clientHeight + 1,
    docScrollWidth: document.documentElement.scrollWidth,
    docClientWidth: document.documentElement.clientWidth,
    ctaBottom: rect ? Math.round(rect.bottom) : null,
    viewportH: window.innerHeight,
    cardMidY: cardRect ? Math.round(cardRect.top + cardRect.height / 2) : null,
  };
});

async function scrollToBottom(vp) {
  // A gesture must START inside the viewport. Anchor every swipe near the bottom
  // of the visible area (the card may already have scrolled off-screen), so the
  // loop keeps scrolling until the real bottom is reached.
  const from = Math.max(140, vp.h - 120);
  for (let i = 0; i < 12; i++) {
    const s = await readState();
    if (s.scrollTop >= s.maxScroll - 5) break;
    await touchSwipeUp(Math.round(vp.w / 2), from, 70);
  }
  return readState();
}

console.log(`\n${'='.repeat(66)}\n  ONBOARDING WIZARD SCROLL — REAL-BROWSER VERIFICATION\n${'='.repeat(66)}`);

for (const vp of VIEWPORTS) {
  console.log(`\n── ${vp.w}×${vp.h} ──`);
  await openAccountStep(vp);
  const before = await readState();
  const scrollable = before.maxScroll > 4;
  console.log(`  (maxScroll=${before.maxScroll}px → ${scrollable ? 'content overflows; scrolling required' : 'content fits the viewport'})`);

  // The document (<html>) must be the single scroll owner; <body> must NOT be
  // a phantom scroll container (that is the bug that swallowed touch gestures).
  check(before.scrollerIsHtml, 'the documentElement is the scroll owner');
  check(!before.bodyIsScrollContainer, `body is not a scroll container (overflow-y: ${before.bodyOverflowY})`);

  if (scrollable) {
    // Touch swipe starting over the empty part of the form card must move the page.
    const midY = Math.min(before.cardMidY || 300, vp.h - 70);
    await touchSwipeUp(Math.round(vp.w / 2), midY, 70);
    const afterSwipe = await readState();
    check(afterSwipe.scrollTop > before.scrollTop,
      `touch swipe over the card scrolls the page (${before.scrollTop} → ${afterSwipe.scrollTop})`);

    const bottom = await scrollToBottom(vp);
    check(bottom.scrollTop >= bottom.maxScroll - 5,
      `swiping reaches the bottom (scrollTop=${bottom.scrollTop}, max=${bottom.maxScroll})`);
    check(bottom.ctaBottom !== null && bottom.ctaBottom <= bottom.viewportH + 1,
      `"Create New Account" button fully visible at the bottom (bottom=${bottom.ctaBottom} ≤ ${bottom.viewportH})`);
    const pwVisible = await page.evaluate(() => [...document.querySelectorAll('input[type="password"]')].every((i) => {
      const r = i.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= window.innerHeight + 1;
    }));
    check(pwVisible, 'both password fields are fully within the viewport at the bottom');
  } else {
    check(before.ctaBottom !== null && before.ctaBottom <= before.viewportH + 1,
      `nothing to scroll and no clipping — CTA visible (bottom=${before.ctaBottom} ≤ ${before.viewportH})`);
  }

  check(before.docScrollWidth <= before.docClientWidth + 1,
    `no horizontal overflow (scrollWidth=${before.docScrollWidth} ≤ clientWidth=${before.docClientWidth})`);

  await page.evaluate(() => { (document.scrollingElement || document.documentElement).scrollTop = 0; });
  await sleep(150);
  check((await readState()).scrollTop === 0, 'can scroll back to the top');
}

// ── Shared shell with arbitrarily long step content (Documents/Plan/Review) ──
console.log(`\n── Long-content step on the shared shell (375×812) ──`);
await openAccountStep({ w: 375, h: 812 });
const hostName = await page.evaluate(() => {
  const main = document.querySelector('main');
  const filler = document.createElement('div');
  filler.id = 'scroll-verify-filler';
  filler.style.height = '2200px';
  filler.style.background = 'repeating-linear-gradient(0deg,#e2e8f0,#e2e8f0 40px,#f8fafc 40px,#f8fafc 80px)';
  main.appendChild(filler);
  return main.tagName;
});
await sleep(150);
const tallBefore = await readState();
check(tallBefore.maxScroll > 1500, `shell grows with long step content (maxScroll=${tallBefore.maxScroll}px on <${hostName.toLowerCase()}>)`);
await touchSwipeUp(187, Math.min(tallBefore.cardMidY || 400, 700), 80);
const tallAfter = await readState();
check(tallAfter.scrollTop > tallBefore.scrollTop + 150, `a single swipe scrolls a meaningful distance into long content (${tallBefore.scrollTop} → ${tallAfter.scrollTop})`);
const reached = await scrollToBottom({ w: 375, h: 812, });
check(reached.scrollTop >= reached.maxScroll - 5, `swipe reaches the very bottom of long content (scrollTop=${reached.scrollTop}, max=${reached.maxScroll})`);

// ── Regression: other root-level screens keep a single scroll owner ──
console.log(`\n── Regression: login + password-setup screens (320×640) ──`);
await page.setViewport({ width: 320, height: 640, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
try {
  await page.goto(`${DEV}/?check=login`, { waitUntil: 'domcontentloaded' });
  // textContent (not innerText) — the login button is CSS-uppercased.
  await page.waitForFunction(() => document.body.textContent.includes('Create New Account'), { timeout: 20000 });
  await sleep(300);
  const loginState = await readState();
  check(loginState.scrollerIsHtml && !loginState.bodyIsScrollContainer, 'login screen: documentElement is the scroll owner, body is not a scroller');
  check(loginState.docScrollWidth <= loginState.docClientWidth + 1, `login screen: no horizontal overflow (${loginState.docScrollWidth} ≤ ${loginState.docClientWidth})`);

  await page.goto(`${DEV}/?page=set-password&email=owner%40example.com&token=invalid-token`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.textContent.includes('This link is no longer valid'), { timeout: 20000 });
  await sleep(300);
  const spState = await readState();
  check(spState.scrollerIsHtml && !spState.bodyIsScrollContainer, 'set-password screen: documentElement is the scroll owner, body is not a scroller');
  check(spState.docScrollWidth <= spState.docClientWidth + 1, `set-password screen: no horizontal overflow (${spState.docScrollWidth} ≤ ${spState.docClientWidth})`);
} catch (e) {
  check(false, `root-screen regression check failed: ${e.message}`);
  console.log('   URL:', page.url());
  try { console.log('   VISIBLE TEXT:', (await page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 220)))); } catch (_) { /* ignore */ }
}

console.log(`\n── Console errors ──`);
// Ignore backend-connectivity noise (the API may not be running / CORS-blocked
// while the layout is what is under test) — but surface every real app error.
const INFRA_NOISE = /CORS|ERR_FAILED|Failed to load resource|net::|Access to fetch|ERR_CONNECTION/i;
const appErrors = consoleErrors.filter((e) => !INFRA_NOISE.test(e));
const ignored = consoleErrors.length - appErrors.length;
check(appErrors.length === 0, `no application console errors (${appErrors.length}; ${ignored} backend/network noise ignored)`);
if (appErrors.length) console.log('   ' + appErrors.slice(0, 5).join('\n   '));

console.log(`\n${'='.repeat(66)}\n  RESULTS: ${pass} passed, ${fail} failed\n${'='.repeat(66)}\n`);
await browser.close();
process.exit(fail ? 1 : 0);
