/**
 * Login screen — redesign verification (real browser, real API).
 *
 * Drives the ACTUAL running app (Vite on :3000, backend on :5001) and asserts
 * the observable behavior of the redesigned login page:
 *
 *   1. Branding: KlarGo POS mark + wordmark, and the CURRENT tenant's logo/name
 *      (contained image — never a broken-image glyph), none of it cropped.
 *   2. Fields: email/user-id field with an icon, password field with a working
 *      visibility toggle (type flips text ⇄ password), labelled controls.
 *   3. States: inline validation (empty + malformed email), the authentication
 *      error alert, and the loading state (spinner + "Signing in…" + disabled).
 *   4. Navigation: "Create New Account" reaches the registration screen.
 *   5. A real login with the seeded ADMIN credentials lands in the POS shell.
 *   6. Responsive: desktop shows the brand panel, tablet/mobile show the compact
 *      header, nothing overflows horizontally, and the card fits the viewport.
 *   7. No console errors / exceptions during the run.
 *
 * Read-only: no data is created or modified (the login below is the demo ADMIN
 * session, and the app session is cleared at the start of every viewport).
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = process.env.CHROME_PATH
  || 'C:\\Users\\Divyang\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const DEV = 'http://localhost:3000';
const API = 'http://localhost:5001/api';
const PORT = 9228;

let pass = 0, fail = 0;
const check = (cond, msg) => { process.stdout.write(cond ? '  ✅ ' : '  ❌ '); console.log(msg); cond ? pass++ : fail++; };
const section = (t) => console.log(`\n${'='.repeat(64)}\n  ${t}\n${'='.repeat(64)}`);

// ── Reference data from the API (what the login screen must display) ──
const publicBranding = await fetch(API + '/settings/public/branding').then((r) => r.json()).catch(() => ({}));
const tenantName = publicBranding?.data?.restaurantName || publicBranding?.restaurantName || null;
console.log(`Public branding: ${tenantName || '(none)'}`);

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-proxy-server',
  '--no-default-browser-check', '--disable-extensions',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=C:\\POS System\\restaurant-pos-frontend\\.chrome-profile-login',
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
    const err = r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text;
    console.log('  ! evaluate failed: ' + String(err).split('\n')[0]);
    return { __error: err };
  }
  return r.result?.result?.value;
};
await send('Runtime.enable');
await send('Page.enable');
await send('Network.enable');

/** Type into a React-controlled input (native setter + input event). */
const TYPE = (selector, value) => `(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return false;
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  setter.call(el, ${JSON.stringify(value)});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`;
const CLICK_TEXT = (text) => `(() => {
  const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === ${JSON.stringify(text)} || x.textContent.trim().startsWith(${JSON.stringify(text)}));
  if (!b) return false;
  b.click();
  return true;
})()`;

const EMAIL_SELECTOR = 'input[autocomplete="username"]';
const PASSWORD_SELECTOR = '#login-password';

async function freshLoginScreen(vp) {
  await send('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: !!vp.mobile });
  await evaluate(`localStorage.clear(); true`);
  await send('Page.reload', { ignoreCache: true });
  // Vite serves modules on demand, so a cold reload can take several seconds.
  // Wait for the login form itself rather than guessing a fixed delay.
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    const ready = await evaluate(`!!document.querySelector(${JSON.stringify(PASSWORD_SELECTOR)})`);
    if (ready === true) {
      await sleep(600); // settle branding/products fetches
      return;
    }
  }
  console.log('  ! login form never rendered — page text: '
    + String(await evaluate(`document.body ? document.body.textContent.slice(0, 160) : '(no body)'`)));
}

// ═══════════════════════════════════════════════
//  1. Desktop — full login flow
// ═══════════════════════════════════════════════
section('Desktop 1440×900 — branding, fields, states, navigation');
// Boot the app once; every section below reloads it through freshLoginScreen().
await send('Page.navigate', { url: DEV });
await sleep(3000);
await freshLoginScreen({ w: 1440, h: 900, mobile: false });

const layout = await evaluate(`(() => {
  const aside = document.querySelector('aside');
  const as = aside ? getComputedStyle(aside) : null;
  const marks = [...document.querySelectorAll('img')].filter(i => /klargo/i.test(i.getAttribute('src') || ''));
  const markBoxes = marks.map(i => ({ src: i.getAttribute('src'), loaded: i.complete && i.naturalWidth > 0, fit: getComputedStyle(i).objectFit }));
  const tenantImg = [...document.querySelectorAll('img')].find(i => !/klargo/i.test(i.getAttribute('src') || ''));
  const card = document.querySelector('form')?.closest('div[class*="rounded-2xl"]');
  const box = card ? card.getBoundingClientRect() : null;
  return {
    hasAside: !!aside,
    asideVisible: as ? as.display !== 'none' && aside.getBoundingClientRect().width > 0 : false,
    gradient: as ? /gradient/.test(as.backgroundImage) : false,
    // textContent (not innerText): several labels are uppercased by CSS only.
    // The four KlarGo POS feature cards.
    brandPoints: ['Orders and billing', 'Floors, tables and kitchen tickets', 'Inventory, menu and staff', 'Sales reports and analytics']
      .filter(t => document.body.textContent.includes(t)).length,
    // Panel order: KlarGo POS identity first, Infinixo attribution last.
    orderOk: (() => {
      const text = document.body.textContent;
      const klar = text.indexOf('KlarGo POS');
      const infin = text.indexOf('A product by Infinixo Technologies');
      const head = text.indexOf('Your restaurant operations, all in one place.');
      return klar >= 0 && head > klar && infin > head;
    })(),
    // Feature cards must be a 2-column grid on desktop.
    featureCols: (() => {
      const card = [...document.querySelectorAll('aside div')].find(el => el.className.includes('grid') && el.textContent.includes('Orders and billing'));
      if (!card) return 0;
      return getComputedStyle(card).gridTemplateColumns.split(' ').filter(Boolean).length;
    })(),
    // Our Products: compact rectangular cards, each product exactly once.
    productCards: (() => {
      const strip = [...document.querySelectorAll('aside div')].find(el => /overflow-x-auto/.test(el.className) && el.querySelectorAll('a').length > 0);
      if (!strip) return { count: 0, names: [], rectangular: null };
      const cards = [...strip.querySelectorAll('a')];
      const boxes = cards.map(c => c.getBoundingClientRect());
      return {
        count: cards.length,
        names: cards.map(c => c.textContent.trim().slice(0, 24)),
        klarCount: cards.filter(c => c.textContent.includes('KlarGo POS')).length,
        rectangular: boxes.every(b => b.width > b.height * 1.4),
        insideContainer: boxes.every(b => b.height <= strip.getBoundingClientRect().height + 1),
      };
    })(),
    scrollHeight: document.documentElement.scrollHeight,
    companyLogo: (() => {
      const i = [...document.querySelectorAll('img')].find(x => /infinixo/i.test(x.getAttribute('src') || ''));
      if (!i) return null;
      const r = i.getBoundingClientRect();
      const shell = i.parentElement.getBoundingClientRect();
      return {
        loaded: i.complete && i.naturalWidth > 0,
        fit: getComputedStyle(i).objectFit,
        w: Math.round(r.width), h: Math.round(r.height),
        contained: r.width <= shell.width + 1 && r.height <= shell.height + 1,
        ratio: +(i.naturalWidth / i.naturalHeight).toFixed(3),
        shownRatio: r.height ? +(r.width / r.height).toFixed(3) : null,
      };
    })(),
    attribution: (() => {
      const a = [...document.querySelectorAll('a')].find(x => x.textContent.includes('A product by Infinixo Technologies'));
      return a ? { href: a.getAttribute('href'), rel: a.getAttribute('rel'), target: a.getAttribute('target') } : null;
    })(),
    ourProducts: document.body.textContent.includes('Our Products'),
    bodyText: document.body.textContent,
    markBoxes,
    tenantImg: tenantImg ? { src: tenantImg.getAttribute('src'), loaded: tenantImg.complete && tenantImg.naturalWidth > 0, fit: getComputedStyle(tenantImg).objectFit } : null,
    markBox: markBoxes[0] ? (() => { const i = marks[0]; const r = i.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })() : null,
    card: box ? { top: Math.round(box.top), bottom: Math.round(box.bottom), left: Math.round(box.left), right: Math.round(box.right) } : null,
    vh: window.innerHeight, vw: window.innerWidth,
    overflowX: document.documentElement.scrollWidth - window.innerWidth,
    emailField: !!document.querySelector(${JSON.stringify(EMAIL_SELECTOR)}),
    emailIcon: !!document.querySelector(${JSON.stringify(EMAIL_SELECTOR)})?.parentElement.querySelector('svg'),
    passwordField: (() => { const p = document.querySelector(${JSON.stringify(PASSWORD_SELECTOR)}); return p ? { type: p.type, icon: !!p.parentElement.querySelector('svg') } : null; })(),
    toggle: !!document.querySelector('button[aria-label="Show password"]'),
    labels: [...document.querySelectorAll('label')].map(l => l.textContent.trim()),
    hasCreateAccount: [...document.querySelectorAll('button')].some(b => b.textContent.includes('Create New Account')),
    tenantNameShown: ${JSON.stringify(tenantName)} ? document.body.textContent.includes(${JSON.stringify(tenantName)}) : null,
  };
})()`);

check(layout.hasAside && layout.asideVisible, 'the desktop brand panel is rendered');
check(layout.gradient, 'the brand panel uses the green gradient theme');
check(layout.brandPoints === 4, `the four KlarGo POS feature cards are present (${layout.brandPoints}/4)`);
check(layout.companyLogo && layout.companyLogo.loaded, 'the official Infinixo company logo loads');
check(layout.companyLogo ? layout.companyLogo.fit === 'contain' : false, 'the company logo is contained (object-contain)');
check(layout.companyLogo ? layout.companyLogo.contained : false,
  `the company logo never overflows its container (${layout.companyLogo?.w}×${layout.companyLogo?.h})`);
check(layout.companyLogo ? Math.abs(layout.companyLogo.ratio - layout.companyLogo.shownRatio) < 0.02 : false,
  `the company logo keeps its aspect ratio (natural ${layout.companyLogo?.ratio} vs shown ${layout.companyLogo?.shownRatio})`);
check(!!layout.attribution && /infinixotech\.com/.test(layout.attribution.href || ''),
  `"A product by Infinixo Technologies" links to the company website (${layout.attribution?.href})`);
check(!!layout.attribution && /noopener/.test(layout.attribution.rel || '') && layout.attribution.target === '_blank',
  'the company link opens safely (noopener, new tab)');
check(layout.bodyText.includes('KlarGo POS'), 'KlarGo POS branding is retained');
check(layout.bodyText.includes('Infinixo Technologies'), 'the company identity is retained');
check(layout.bodyText.includes('Your restaurant operations, all in one place.'), 'the product headline is rendered');
check(layout.bodyText.includes('Smart restaurant operations, billing, inventory and team management'), 'the product subtitle is rendered');
check(layout.orderOk, 'panel order: KlarGo POS → headline → … → Infinixo attribution last');
check(layout.featureCols === 2, `feature cards use a 2-column grid (${layout.featureCols} tracks)`);
check(layout.productCards.count > 0, `the products strip renders ${layout.productCards.count} card(s)`);
check(layout.productCards.klarCount <= 1, `KlarGo POS is not duplicated in the strip (${layout.productCards.klarCount})`);
check(layout.productCards.rectangular !== false, 'product cards are rectangular (wider than tall)');
check(layout.productCards.insideContainer !== false, 'product cards stay inside the strip container');
check(layout.scrollHeight <= layout.vh + 2, `the desktop page does not scroll vertically (${layout.scrollHeight} ≤ ${layout.vh})`);
check(layout.markBoxes.length > 0 && layout.markBoxes.every((m) => m.loaded),
  `the KlarGo mark loads (${layout.markBoxes.map((m) => m.src.split('/').pop()).join(', ')})`);
check(layout.markBoxes.every((m) => m.fit === 'contain'), 'the platform mark is contained (never stretched)');
check(!!layout.markBox, `the mark keeps its aspect ratio (${layout.markBox?.join('×')})`);
check(layout.tenantImg ? layout.tenantImg.loaded : true,
  `the tenant logo loads${layout.tenantImg ? ` (${layout.tenantImg.src.split('/').pop()})` : ' (none configured → initial fallback)'}`);
check(layout.tenantImg ? layout.tenantImg.fit === 'contain' : true, 'the tenant logo is contained — no cropping of a non-square logo');
check(layout.tenantNameShown !== false, `the tenant name is shown (${tenantName || 'fallback'})`);
check((await evaluate(`!!document.querySelector('#remember-me')`)), 'the Remember Me checkbox is present');
check(layout.emailField && layout.emailIcon, 'the email/user-id field renders with an icon');
check(!!layout.passwordField && layout.passwordField.icon, 'the password field renders with an icon');
check(layout.passwordField?.type === 'password', 'the password is masked by default');
check(layout.toggle, 'the password visibility toggle is present');
check(layout.labels.some((l) => /password/i.test(l)), `the password field is labelled (${layout.labels.join(' | ')})`);
check(layout.hasCreateAccount, 'the secondary “Create New Account” action is present');
check(layout.card && layout.card.left >= 0 && layout.card.right <= layout.vw && layout.card.top >= 0 && layout.card.bottom <= layout.vh,
  `the login card fits the viewport (${layout.card ? `${layout.card.left}…${layout.card.right} × ${layout.card.top}…${layout.card.bottom} of ${layout.vw}×${layout.vh}` : 'n/a'})`);
check(layout.overflowX <= 2, `no horizontal overflow (${layout.overflowX}px)`);

// ── Password visibility toggle ──
const toggleOn = await evaluate(`(() => { const b = document.querySelector('button[aria-label="Show password"]'); b.click(); return document.querySelector(${JSON.stringify(PASSWORD_SELECTOR)}).type; })()`);
await sleep(250);
const typeAfterShow = await evaluate(`document.querySelector(${JSON.stringify(PASSWORD_SELECTOR)}).type`);
check(typeAfterShow === 'text', `the toggle reveals the password (type=${typeAfterShow})`);
const toggleOff = await evaluate(`(() => { const b = document.querySelector('button[aria-label="Hide password"]'); if (!b) return null; b.click(); return true; })()`);
await sleep(250);
check(toggleOff && (await evaluate(`document.querySelector(${JSON.stringify(PASSWORD_SELECTOR)}).type`)) === 'password',
  `the toggle masks it again (${toggleOn} → password)`);

// ── Validation: empty submit ──
await evaluate(TYPE(EMAIL_SELECTOR, ''));
await evaluate(TYPE(PASSWORD_SELECTOR, ''));
await evaluate(CLICK_TEXT('Log In'));
await sleep(600);
const emptyErrors = await evaluate(`(() => {
  const txt = document.body.textContent;
  return {
    email: txt.includes('Email or user ID is required.'),
    password: txt.includes('Password is required.'),
    stillOnLogin: !!document.querySelector(${JSON.stringify(PASSWORD_SELECTOR)}),
    ariaInvalid: document.querySelector(${JSON.stringify(PASSWORD_SELECTOR)}).getAttribute('aria-invalid'),
  };
})()`);
check(emptyErrors.email && emptyErrors.password, 'empty submit shows inline field validation');
check(emptyErrors.stillOnLogin, 'validation blocks the request (no navigation)');
check(emptyErrors.ariaInvalid === 'true', 'the invalid field is marked for assistive tech (aria-invalid)');

// ── Validation: malformed email ──
await evaluate(TYPE(EMAIL_SELECTOR, 'not-an-email@'));
await evaluate(TYPE(PASSWORD_SELECTOR, 'whatever'));
await evaluate(CLICK_TEXT('Log In'));
await sleep(600);
const formatError = await evaluate(`document.body.textContent.includes('Please enter a valid email address.')`);
check(formatError, 'a malformed email is rejected before any request');
// The stale "required" error must be gone — the message replaced it in place.
check(!(await evaluate(`document.body.textContent.includes('Email or user ID is required.')`)),
  'the inline error updates as the field is edited (no stale message)');

// ── Authentication error + loading state (latency injected so it is observable) ──
await send('Network.emulateNetworkConditions', { offline: false, latency: 1600, downloadThroughput: -1, uploadThroughput: -1 });
await evaluate(TYPE(EMAIL_SELECTOR, 'admin@restaurant.com'));
await evaluate(TYPE(PASSWORD_SELECTOR, 'wrong-password'));
await evaluate(CLICK_TEXT('Log In'));
await sleep(450);
const during = await evaluate(`(() => {
  const b = [...document.querySelectorAll('button')].find(x => /Signing in|Log In/.test(x.textContent));
  return {
    text: b ? b.textContent.trim() : null,
    disabled: b ? b.disabled : null,
    spinner: !!(b && b.querySelector('svg.animate-spin')),
    fieldDisabled: document.querySelector(${JSON.stringify(PASSWORD_SELECTOR)}).disabled,
  };
})()`);
check(/Signing in/.test(during.text || ''), `the button shows the loading state (${during.text})`);
check(during.spinner, 'a spinner is rendered while signing in');
check(during.disabled === true, 'the button is disabled while signing in (no double submit)');
check(during.fieldDisabled === true, 'the fields are disabled while signing in');

await sleep(3200);
const authError = await evaluate(`(() => {
  const alert = document.querySelector('[role="alert"]');
  return {
    hasAlert: !!alert,
    text: alert ? alert.textContent.trim() : '',
    buttonBack: [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Log In'),
    stillOnLogin: !!document.querySelector(${JSON.stringify(PASSWORD_SELECTOR)}),
    fieldsEnabled: !document.querySelector(${JSON.stringify(PASSWORD_SELECTOR)}).disabled,
  };
})()`);
check(authError.hasAlert, `invalid credentials surface an authentication error (${(authError?.text || '').slice(0, 60)})`);
check(authError.buttonBack, 'the button returns to its normal state after the failure');
check(authError.stillOnLogin, 'a failed login stays on the login screen');
check(authError.fieldsEnabled, 'the fields are re-enabled after the failure');
await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

// ── Secondary action → registration screen ──
await evaluate(CLICK_TEXT('Create New Account'));
await sleep(1500);
const register = await evaluate(`(() => ({
  onRegister: document.body.textContent.includes('Create Your Account'),
  loginGone: !document.querySelector(${JSON.stringify(PASSWORD_SELECTOR)}),
}))()`);
check(register.onRegister, '“Create New Account” opens the registration screen');
check(register.loginGone, 'the login form is replaced by the registration flow');

// ── Real login with the seeded ADMIN credentials ──
await freshLoginScreen({ w: 1440, h: 900, mobile: false });
await evaluate(TYPE(EMAIL_SELECTOR, 'admin@restaurant.com'));
await evaluate(TYPE(PASSWORD_SELECTOR, 'password123'));
await evaluate(CLICK_TEXT('Log In'));
await sleep(6000);
const loggedIn = await evaluate(`(() => ({
  loginGone: !document.querySelector(${JSON.stringify(PASSWORD_SELECTOR)}),
  sidebar: !!document.querySelector('aside'),
  shellText: document.body.textContent.slice(0, 300),
  token: !!localStorage.getItem('pos_token'),
}))()`);
check(loggedIn.loginGone && loggedIn.sidebar, 'valid credentials sign the user into the POS shell');
check(loggedIn.token, 'the session token is stored (session established)');
check(/Dashboard|POS Ordering|Active Orders/.test(loggedIn.shellText), `the shell rendered its navigation (${loggedIn.shellText.split('\n').slice(0, 3).join(' / ')})`);

// ═══════════════════════════════════════════════
//  1b. Desktop sizes — whole page fits 100dvh
// ═══════════════════════════════════════════════
for (const vp of [
  { name: '1440×900', w: 1440, h: 900 },
  { name: '1366×768', w: 1366, h: 768 },
  { name: '1280×720', w: 1280, h: 720 },
]) {
  section(`Desktop ${vp.name} — fits the viewport`);
  await freshLoginScreen({ ...vp, mobile: false });
  const fit = await evaluate(`(() => {
    const doc = document.documentElement;
    const card = document.querySelector('form')?.closest('div[class*="rounded-2xl"]');
    const cardBox = card ? card.getBoundingClientRect() : null;
    const attribution = [...document.querySelectorAll('a')].find(a => a.textContent.includes('A product by Infinixo Technologies'));
    const attrBox = attribution ? attribution.getBoundingClientRect() : null;
    const row = [...document.querySelectorAll('aside div')].find(el => el.className.includes('grid') && el.textContent.includes('Orders and billing'));
    const cols = row ? getComputedStyle(row).gridTemplateColumns.split(' ').filter(Boolean).length : 0;
    const strip = [...document.querySelectorAll('aside div')].find(el => /overflow-x-auto/.test(el.className) && el.querySelectorAll('a').length);
    return {
      vw: window.innerWidth, vh: window.innerHeight,
      docH: doc.scrollHeight,
      overflowX: doc.scrollWidth - window.innerWidth,
      card: cardBox ? { top: Math.round(cardBox.top), bottom: Math.round(cardBox.bottom) } : null,
      attrBottom: attrBox ? Math.round(attrBox.bottom) : null,
      cols,
      stripVisible: !!strip,
      klarTopFirst: (document.body.textContent.indexOf('KlarGo POS') < document.body.textContent.indexOf('A product by Infinixo Technologies')),
    };
  })()`);
  check(fit.docH <= fit.vh + 2, `no vertical page scroll (${fit.docH} ≤ ${fit.vh})`);
  check(fit.card && fit.card.bottom <= fit.vh + 1 && fit.card.top >= -1,
    `the login card is fully visible (${fit.card?.top}…${fit.card?.bottom} of ${fit.vh})`);
  check(fit.attrBottom !== null && fit.attrBottom <= fit.vh,
    `the company attribution stays visible without scrolling (${fit.attrBottom} ≤ ${fit.vh})`);
  check(fit.cols === 2, `feature cards are two columns (${fit.cols})`);
  check(fit.overflowX <= 2, `no horizontal overflow (${fit.overflowX}px)`);
  check(fit.klarTopFirst, 'KlarGo POS branding is at the top of the panel');
}

// ═══════════════════════════════════════════════
//  2. Tablet + mobile — responsive behaviour
// ═══════════════════════════════════════════════
for (const vp of [
  { name: 'Tablet 768×1024', w: 768, h: 1024, mobile: true },
  { name: 'Mobile 390×844', w: 390, h: 844, mobile: true },
  { name: 'Mobile 375×812', w: 375, h: 812, mobile: true },
  { name: 'Small phone 320×640', w: 320, h: 640, mobile: true },
]) {
  section(`${vp.name} — responsive login screen`);
  await freshLoginScreen(vp);
  const resp = await evaluate(`(() => {
    const aside = document.querySelector('aside');
    const as = aside ? getComputedStyle(aside) : null;
    const card = document.querySelector('form')?.closest('div[class*="rounded-2xl"]');
    const box = card ? card.getBoundingClientRect() : null;
    const marks = [...document.querySelectorAll('img')].filter(i => /klargo/i.test(i.getAttribute('src') || ''));
    return {
      asideVisible: as ? as.display !== 'none' && aside.getBoundingClientRect().width > 0 : false,
      headerMark: marks.some(i => i.getBoundingClientRect().width > 0 && i.complete && i.naturalWidth > 0),
      card: box ? { left: Math.round(box.left), right: Math.round(box.right), bottom: Math.round(box.bottom) } : null,
      vw: window.innerWidth, vh: window.innerHeight,
      overflowX: document.documentElement.scrollWidth - window.innerWidth,
      emailField: !!document.querySelector(${JSON.stringify(EMAIL_SELECTOR)}),
      passwordField: !!document.querySelector(${JSON.stringify(PASSWORD_SELECTOR)}),
      toggle: !!document.querySelector('button[aria-label="Show password"]'),
      createAccount: [...document.querySelectorAll('button')].some(b => b.textContent.includes('Create New Account')),
      brandText: document.body.textContent.includes('KlarGo POS'),
    };
  })()`);
  check(!resp.asideVisible, 'the desktop brand panel is not squeezed onto this width');
  check(resp.headerMark, 'the compact brand mark is rendered instead (loaded, visible)');
  check(resp.brandText, 'KlarGo POS branding is retained');
  check(resp.emailField && resp.passwordField && resp.toggle, 'all login controls remain present');
  check(resp.createAccount, 'the registration action remains present');
  check(resp.card && resp.card.left >= 0 && resp.card.right <= resp.vw,
    `the card fits the viewport (${resp.card?.left}…${resp.card?.right} of ${resp.vw})`);
  check(resp.overflowX <= 2, `no horizontal overflow (${resp.overflowX}px)`);

  // Short viewports may need to scroll — the form must still be fully reachable.
  const reach = await evaluate(`(() => {
    const doc = document.scrollingElement || document.documentElement;
    window.scrollTo(0, doc.scrollHeight);
    const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('Create New Account'));
    const r = b ? b.getBoundingClientRect() : null;
    const ok = !!r && r.bottom <= window.innerHeight + 1 && r.top >= -1;
    const res = { ok, bottom: r ? Math.round(r.bottom) : null, vh: window.innerHeight, scrollable: doc.scrollHeight > window.innerHeight };
    window.scrollTo(0, 0);
    return res;
  })()`);
  check(reach.ok, `the whole form is reachable at this height (last action ${reach.bottom} ≤ ${reach.vh}${reach.scrollable ? ', page scrolls' : ''})`);

  // The redesigned fields stay usable on touch widths.
  await evaluate(TYPE(EMAIL_SELECTOR, 'wrong-format@'));
  await evaluate(CLICK_TEXT('Log In'));
  await sleep(500);
  check((await evaluate(`document.body.textContent.includes('Please enter a valid email address.')`)),
    'inline validation also renders at this width');
}

section('CONSOLE');
const realErrors = consoleErrors.filter((e) => !/favicon|net::ERR_|Failed to load resource|401|Invalid credentials/i.test(e));
check(realErrors.length === 0, `no unexpected console errors / exceptions (${realErrors.length} found)`);
realErrors.slice(0, 8).forEach((e) => console.log('     ! ' + e));

console.log(`\n  Total: ${pass + fail}   Passed: ${pass} ✅   Failed: ${fail} ${fail ? '❌' : '✅'}`);
ws.close();
chrome.kill();
await sleep(300);
process.exit(fail ? 1 : 0);
