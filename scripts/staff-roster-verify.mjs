/**
 * Staff Roster vs Dashboard "Active Staff" — real-browser verification.
 *
 * Asserts:
 *   1. the roster renders EVERY staff member the API reports (pagination is
 *      followed, so a tenant with more than one page is fully listed);
 *   2. the dashboard's ACTIVE STAFF number equals the roster's active rows
 *      (no platform-admin inflation, no soft-deleted rows);
 *   3. a failing /users request shows an ERROR with Retry — never "No staff
 *      members found."
 *
 * Read-only.
 *
 * Run with the dev servers up: node scripts/staff-roster-verify.mjs
 */
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH
  || 'C:\\Users\\Divyang\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const APP = process.env.APP_URL || 'http://localhost:3000';
const API = process.env.API_URL || 'http://localhost:5001/api';

let pass = 0;
let fail = 0;
const check = (cond, msg, extra) => {
  process.stdout.write(cond ? '  ✅ ' : '  ❌ ');
  console.log(msg + (extra !== undefined ? `  ${JSON.stringify(extra)}` : ''));
  cond ? pass++ : fail++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const login = await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@restaurant.com', password: 'password123' }),
}).then((r) => r.json()).catch(() => ({}));
if (!login.token) { console.error('❌ backend not reachable on :5001'); process.exit(1); }
const H = { Authorization: `Bearer ${login.token}` };

const apiStaff = await fetch(`${API}/users?page=1&limit=100`, { headers: H }).then((r) => r.json());
const staffRows = apiStaff.data?.users || [];
const activeFromApi = staffRows.filter((u) => u.isActive).length;
const dashboard = await fetch(`${API}/dashboard`, { headers: H }).then((r) => r.json());
const activeFromDashboard = dashboard.data?.staff?.total;
console.log(`API staff: ${staffRows.length} rows (${activeFromApi} active) · dashboard ACTIVE STAFF: ${activeFromDashboard}`);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--no-proxy-server', '--no-first-run'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(e.message));

await page.goto(APP, { waitUntil: 'domcontentloaded' });
await page.evaluate((token, user) => {
  localStorage.setItem('pos_token', token);
  localStorage.setItem('pos_user', JSON.stringify(user));
}, login.token, login.user);
await page.reload({ waitUntil: 'networkidle2' });
await sleep(3500);

// ── 1. Dashboard metric ──
const dashMetric = await page.evaluate(() => {
  const text = document.body.innerText.replace(/\s+/g, ' ');
  const m = text.match(/ACTIVE STAFF\s+(\d+)/i);
  return m ? Number(m[1]) : null;
});
check(dashMetric === activeFromDashboard, `the dashboard shows the API's active staff (${dashMetric})`);
check(activeFromDashboard === activeFromApi,
  `the dashboard count equals the roster's active rows (${activeFromDashboard} vs ${activeFromApi})`);

// ── 2. Roster renders every staff member ──
await page.evaluate(() => {
  [...document.querySelectorAll('button[title]')]
    .find((b) => b.getAttribute('title') === 'Staff Roster')?.click();
});
await sleep(3500);

const roster = await page.evaluate(() => {
  const main = document.querySelector('main');
  const text = main ? main.innerText : document.body.innerText;
  return {
    emptyMessage: /No staff members found/i.test(text),
    errorState: /Failed to load staff|Invalid response format/i.test(text),
    retry: [...document.querySelectorAll('button')].some((b) => /^Retry$/i.test(b.textContent.trim())),
    // One member card owns exactly one "Edit" action.
    rows: [...document.querySelectorAll('button[title="Edit"]')].length,
    textStart: text.replace(/\s+/g, ' ').slice(0, 140),
  };
});
check(!roster.emptyMessage, 'the roster is not showing "No staff members found"');
check(!roster.errorState, 'the roster loaded without an error state');
check(roster.rows >= staffRows.length, `every staff member is listed (${roster.rows} rows for ${staffRows.length} API records)`);

// ── 3. A failing /users request must surface an error, never an empty roster ──
await page.setRequestInterception(true);
const blockUsers = (req) => {
  if (/\/api\/users(\?|$)/.test(req.url())) req.respond({ status: 500, contentType: 'application/json', body: '{"success":false,"message":"Simulated failure"}' });
  else req.continue();
};
page.on('request', blockUsers);
await page.reload({ waitUntil: 'domcontentloaded' });
await sleep(4000);
await page.evaluate(() => {
  [...document.querySelectorAll('button[title]')]
    .find((b) => b.getAttribute('title') === 'Staff Roster')?.click();
});
await sleep(3000);

const failure = await page.evaluate(() => {
  const main = document.querySelector('main');
  const text = main ? main.innerText : document.body.innerText;
  return {
    emptyMessage: /No staff members found/i.test(text),
    errorVisible: /failed|error|invalid|retry/i.test(text),
    retry: [...document.querySelectorAll('button')].some((b) => /^Retry$/i.test(b.textContent.trim())),
    textStart: text.replace(/\s+/g, ' ').slice(0, 160),
  };
});
check(!failure.emptyMessage, 'a failed staff request does NOT pretend the roster is empty');
check(failure.errorVisible && failure.retry, `a failed staff request shows the error with Retry (${failure.textStart})`);
page.off('request', blockUsers);

const realErrors = consoleErrors.filter((e) => !/favicon|net::ERR_|Failed to load resource/i.test(e));
check(realErrors.length === 0, `no uncaught exceptions (${realErrors.length} found)`);
realErrors.slice(0, 5).forEach((e) => console.log('     ! ' + e.slice(0, 200)));

await browser.close();
console.log(`\n  Total: ${pass + fail}   Passed: ${pass} ✅   Failed: ${fail} ${fail ? '❌' : '✅'}`);
process.exit(fail ? 1 : 0);
