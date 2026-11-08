/**
 * Whole-app page audit — real browser, real API.
 *
 * Opens every main screen of the running app (Vite :3000, API :5001) and
 * reports, per screen:
 *   - whether the ErrorBoundary fallback ("Something went wrong") is showing,
 *   - every uncaught exception / console error,
 *   - every API request that failed (status >= 400 or network error),
 *   - the visible heading, so an empty screen is distinguishable from a crash.
 *
 * Read-only: it never creates, edits or deletes data.
 *
 * Run with the dev servers up: node scripts/page-error-audit.mjs
 */
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH
  || 'C:\\Users\\Divyang\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const APP = process.env.APP_URL || 'http://localhost:3000';
const API = process.env.API_URL || 'http://localhost:5001/api';

const SCREENS = [
  'Dashboard Overview',
  'POS Ordering',
  'Floors & Tables',
  'Menu & Stock',
  'Staff Roster',
  'Active Orders',
  'Kitchen Tickets',
  'Reports & Sales',
  'POS Settings',
  'Discounts & Promotions',
];

// Every screen here must actually open for the seed ADMIN. A screen that is
// silently skipped because its nav item could not be found is NOT a pass —
// that is exactly how a broken page hides from an audit. Kitchen Tickets is
// optional because it is role/module gated for a restaurant ADMIN.
const REQUIRED_SCREENS = SCREENS.filter((s) => s !== 'Kitchen Tickets');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Session: log in through the real API, then seed the browser session ──
const login = await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@restaurant.com', password: 'password123' }),
}).then((r) => r.json()).catch(() => ({}));

if (!login.token) {
  console.error('❌ Could not log in — is the backend running on :5001 with the seed ADMIN?');
  process.exit(1);
}
console.log(`Logged in as ${login.user?.email} (${login.user?.role}) — ${login.user?.restaurantName || 'restaurant'}`);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--no-proxy-server', '--no-first-run'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

await page.goto(APP, { waitUntil: 'domcontentloaded' });
await page.evaluate((token, user) => {
  localStorage.setItem('pos_token', token);
  localStorage.setItem('pos_user', JSON.stringify(user));
}, login.token, login.user);
await page.reload({ waitUntil: 'networkidle2' });
await sleep(3500);

const results = [];

for (const label of SCREENS) {
  const consoleErrors = [];
  const failedRequests = [];
  const pageErrors = [];

  const onConsole = (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); };
  const onPageError = (e) => pageErrors.push(e.message);
  const onResponse = (r) => {
    const status = r.status();
    if (status >= 400 && /\/api\//.test(r.url())) failedRequests.push(`${status} ${r.request().method()} ${r.url()}`);
  };
  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  page.on('response', onResponse);

  const clicked = await page.evaluate((text) => {
    const btn = [...document.querySelectorAll('button[title]')].find((b) => b.getAttribute('title') === text);
    if (!btn) return false;
    btn.click();
    return true;
  }, label);
  await sleep(2500);

  const state = await page.evaluate(() => {
    const body = document.body.innerText || '';
    const main = document.querySelector('main');
    const heading = document.querySelector('h1, h2')?.textContent?.trim() || '';
    return {
      boundary: /Something went wrong/i.test(body),
      heading,
      bodyLength: body.length,
      bodyStart: (main ? main.innerText : body).replace(/\s+/g, ' ').slice(0, 150),
      hasRetry: [...document.querySelectorAll('button')].some((b) => /try again|retry|reload/i.test(b.textContent)),
    };
  });

  page.off('console', onConsole);
  page.off('pageerror', onPageError);
  page.off('response', onResponse);

  results.push({ label, clicked, ...state, consoleErrors, failedRequests, pageErrors });

  const required = REQUIRED_SCREENS.includes(label);
  const notFound = required && !clicked;
  const bad = state.boundary || pageErrors.length > 0 || notFound;
  console.log(`\n${bad ? '❌' : '✅'} ${label}${clicked ? '' : '  (nav item not found — may be hidden for this tenant)'}`);
  if (notFound) console.log('     ✗ required screen could not be opened (nav item missing)');
  console.log(`     heading: ${JSON.stringify(state.heading)}  boundary: ${state.boundary}`);
  console.log(`     content: ${JSON.stringify(state.bodyStart)}`);
  if (pageErrors.length) pageErrors.slice(0, 4).forEach((e) => console.log(`     EXCEPTION: ${e.split('\n')[0]}`));
  consoleErrors.slice(0, 4).forEach((e) => console.log(`     console:   ${e.slice(0, 200)}`));
  failedRequests.slice(0, 6).forEach((e) => console.log(`     request:   ${e}`));
}

await browser.close();

const broken = results.filter(
  (r) => r.boundary || r.pageErrors.length > 0 || (REQUIRED_SCREENS.includes(r.label) && !r.clicked)
);
console.log(`\n${'='.repeat(64)}`);
console.log(`Screens audited: ${results.length}   Broken: ${broken.length}`);
if (broken.length) {
  console.log('Broken screens: ' + broken.map((b) => b.label).join(', '));
  process.exit(1);
}
