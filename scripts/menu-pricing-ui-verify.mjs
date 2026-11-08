/**
 * Restaurant menu pricing — real-browser verification.
 *
 * Asserts the DELIVERED behaviour for a RESTAURANT tenant:
 *   - the Add/Edit item form shows Non-AC Price + AC Price and NO Base Price;
 *   - both prices are submitted from the form, saved and reloaded;
 *   - re-opening the item shows the saved values (edit prefill).
 *
 * It creates ONE uniquely named item through the UI and deletes it again via
 * the API afterwards, so the demo data is unchanged.
 *
 * Run with the dev servers up: node scripts/menu-pricing-ui-verify.mjs
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
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${login.token}` };
const api = (p, init = {}) => fetch(API + p, { ...init, headers: { ...H, ...(init.headers || {}) } });
console.log(`Logged in as ${login.user?.email} (${login.user?.role})`);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--no-proxy-server', '--no-first-run'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

await page.goto(APP, { waitUntil: 'domcontentloaded' });
await page.evaluate((token, user) => {
  localStorage.setItem('pos_token', token);
  localStorage.setItem('pos_user', JSON.stringify(user));
}, login.token, login.user);
await page.reload({ waitUntil: 'networkidle2' });
await sleep(3500);

// ── Open Menu & Stock ──
await page.evaluate(() => {
  [...document.querySelectorAll('button[title]')]
    .find((b) => b.getAttribute('title') === 'Menu & Stock')?.click();
});
await sleep(2500);

const itemName = `QA Pricing UI ${Date.now()}`;
let createdId = null;

try {
  // ── Add Item: the price fields a restaurant must see ──
  await page.evaluate(() => {
    [...document.querySelectorAll('button')]
      .find((b) => /ADD ITEM/i.test(b.textContent))?.click();
  });
  await sleep(900);

  const form = await page.evaluate(() => {
    const form = [...document.querySelectorAll('form')]
      .find((f) => /Save Item/i.test(f.textContent));
    if (!form) return null;
    const labels = [...form.querySelectorAll('label')].map((l) => l.textContent.trim());
    return {
      labels,
      numberFields: [...form.querySelectorAll('input[type="number"]')].length,
      hasBasePrice: labels.some((l) => /^Base Price/i.test(l)),
      nonAc: labels.find((l) => /Non-AC Price/i.test(l)) || null,
      ac: labels.find((l) => /^AC Price/i.test(l)) || null,
      plainPrice: labels.some((l) => /^Price\s*\(/i.test(l)),
      vegToggle: !!form.textContent.match(/Veg/),
    };
  });

  check(!!form, 'the Add Item form opened');
  check(!!form?.nonAc, `the form shows a Non-AC Price field (${form?.nonAc})`);
  check(!!form?.ac, `the form shows an AC Price field (${form?.ac})`);
  check(form?.hasBasePrice === false, 'the form does NOT show a Base Price field');
  check(form?.plainPrice === false, 'the form does NOT show a generic single Price field');

  // ── Fill and save through the real form ──
  const filled = await page.evaluate((name) => {
    const form = [...document.querySelectorAll('form')].find((f) => /Save Item/i.test(f.textContent));
    if (!form) return false;
    const setVal = (el, v) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const fieldFor = (re) => {
      const label = [...form.querySelectorAll('label')].find((l) => re.test(l.textContent.trim()));
      return label ? label.parentElement.querySelector('input') : null;
    };
    const nameInput = [...form.querySelectorAll('input[type="text"]')][0];
    const nonAc = fieldFor(/Non-AC Price/i);
    const ac = fieldFor(/^AC Price/i);
    if (!nameInput || !nonAc || !ac) return false;
    setVal(nameInput, name);
    setVal(nonAc, '111');
    setVal(ac, '222');
    return true;
  }, itemName);
  check(filled, 'form fields accept the name and both prices');

  await page.evaluate(() => {
    const form = [...document.querySelectorAll('form')].find((f) => /Save Item/i.test(f.textContent));
    form?.querySelector('button[type="submit"]')?.click();
  });
  await sleep(3000);

  const listed = await page.evaluate((name) => document.body.innerText.includes(name), itemName);
  check(listed, `the new item appears in the Menu & Stock list (${itemName})`);

  const menu = await (await api('/menu')).json();
  const saved = (menu.items || []).find((m) => m.name === itemName);
  createdId = saved?.id ?? null;
  check(!!saved, 'the item exists in the backend');
  check(saved?.nonAcPrice === 111, `Non-AC price persisted (${saved?.nonAcPrice})`);
  check(saved?.acPrice === 222, `AC price persisted (${saved?.acPrice})`);
  check(saved?.price === 111, `stored base price derived from Non-AC (${saved?.price})`);

  // ── Re-open the item: both prices must prefill ──
  const opened = await page.evaluate((name) => {
    // The item's OWN card: start at the name element and walk up to the nearest
    // ancestor that has an Edit Item button (the list container also matches a
    // bare `textContent.includes(name)` check and would open a different item).
    const nameEl = [...document.querySelectorAll('p')]
      .find((e) => e.textContent.trim() === name);
    if (!nameEl) return false;
    let el = nameEl;
    for (let i = 0; i < 8 && el; i++, el = el.parentElement) {
      const btn = el.querySelector('button[title="Edit Item"]');
      if (btn) { btn.click(); return true; }
    }
    return false;
  }, itemName);
  await sleep(900);

  const prefill = await page.evaluate(() => {
    const form = [...document.querySelectorAll('form')].find((f) => /Update Item/i.test(f.textContent));
    if (!form) return null;
    const fieldFor = (re) => {
      const label = [...form.querySelectorAll('label')].find((l) => re.test(l.textContent.trim()));
      return label ? label.parentElement.querySelector('input') : null;
    };
    return {
      nonAc: fieldFor(/Non-AC Price/i)?.value ?? null,
      ac: fieldFor(/^AC Price/i)?.value ?? null,
      hasBasePrice: [...form.querySelectorAll('label')].some((l) => /^Base Price/i.test(l.textContent)),
    };
  });
  check(opened && !!prefill, 'the Edit Item form opened');
  check(prefill?.nonAc === '111', `Non-AC price prefills on edit (${prefill?.nonAc})`);
  check(prefill?.ac === '222', `AC price prefills on edit (${prefill?.ac})`);
  check(prefill?.hasBasePrice === false, 'the edit form has no Base Price field either');
} finally {
  // ── Cleanup ──
  if (!createdId) {
    const menu = await (await api('/menu')).json().catch(() => ({}));
    createdId = (menu.items || []).find((m) => m.name === itemName)?.id ?? null;
  }
  if (createdId) {
    const del = await api(`/menu/${createdId}`, { method: 'DELETE' }).then((r) => r.json()).catch(() => ({}));
    check(del?.success === true, `verification item #${createdId} deleted (demo data restored)`);
  }
  const realErrors = consoleErrors.filter((e) => !/favicon|net::ERR_|Failed to load resource/i.test(e));
  check(realErrors.length === 0, `no console errors / exceptions (${realErrors.length} found)`);
  realErrors.slice(0, 5).forEach((e) => console.log('     ! ' + e.slice(0, 200)));

  await browser.close();
  console.log(`\n  Total: ${pass + fail}   Passed: ${pass} ✅   Failed: ${fail} ${fail ? '❌' : '✅'}`);
  process.exit(fail ? 1 : 0);
}
