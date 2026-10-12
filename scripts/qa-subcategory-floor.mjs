/**
 * REAL-BROWSER QA — (1) Subcategory Edit / Delete in the Manage Subcategories
 * modal and (2) the floor-assignment filtering rule.
 *
 * Drives the REAL running app over CDP (headless Chrome):
 *   frontend dev server  http://localhost:3000
 *   backend              http://localhost:5001/api
 *
 * Target tenant: restaurant 1 (The Golden Grill) — it has a category with three
 * real subcategories (Pasta → Long & Thin / Long & Flat / Short & Tubular) and
 * five active floors, one of which is referenced by a menu item.
 *
 * Part 1 — Manage Subcategories (Menu & Stock)
 *   The modal lists every subcategory of the SELECTED category with an Edit and
 *   a Delete control. The previous defect: the Category <select> carries the UI
 *   token `cat-<id>` while each row carries the numeric `categoryId`, so the
 *   list filter matched nothing and only the empty-state message rendered.
 *   Here we assert real rows, an edit round-trip (create → rename → save),
 *   duplicate/empty rejection, the delete confirmation dialog, and that a
 *   referenced subcategory cannot be deleted without an explicit destination.
 *
 * Part 2 — Floor assignment rule
 *   No assignments configured → ALL active floors; assignments → only those.
 *   Checked at the API level AND in the real POS floor selector, including the
 *   "assignments removed restores all floors" case and inactive-floor exclusion.
 *
 * Requires BOTH dev servers already running (the harness does not start them):
 *   backend:  cd backend  && npm run dev
 *   frontend: cd frontend && npm run dev
 *
 * Run:      node scripts/qa-subcategory-floor.mjs
 * Cleanup:  the harness removes what it created (QA admin, QA waiter, QA
 *           subcategory) and re-activates the floor it temporarily deactivated.
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// A fresh Chrome profile per run: a reused profile keeps the previous run's
// localStorage (pos_token / pos_user) so the app restores a stale session and
// the login form never renders. Kept OUTSIDE the project — a Chrome profile
// inside frontend/ makes Vite's file watcher crash (EBUSY on locked files).
const CHROME_PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-subcat-chrome-'));
const CHROME = 'C:\\Users\\Divyang\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const DEV = 'http://localhost:3000';
const API = 'http://localhost:5001/api';
const CDP_PORT = 9334;

const RESTAURANT_ID = 1;
const MANAGER = { email: 'manager@restaurant.com', password: 'password123' };
const SA = { email: 'superadmin@pos.com', password: 'SuperAdmin@123' };
const QA_PASS = 'QaFloor#12345';

// Pasta — the category with three real subcategories.
const CATEGORY_WITH_SUBS = 'Pasta';
const REAL_SUBS = ['Long & Thin Pasta', 'Long & Flat Pasta', 'Short & Tubular Pasta'];
const REFERENCED_SUB = 'Long & Thin Pasta'; // 1 menu item references it
const ALL_FLOORS = ['Ground Floor', 'First Floor', 'Family Section', 'Outdoor', 'VIP Lounge'];

let pass = 0, fail = 0;
const check = (cond, msg, detail) => {
  process.stdout.write(cond ? '  ✅ ' : '  ❌ ');
  console.log(msg + (detail === undefined ? '' : ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`));
  cond ? pass++ : fail++;
};
const section = (t) => console.log(`\n${'='.repeat(64)}\n  ${t}\n${'='.repeat(64)}`);
const sameSet = (a, b) => Array.isArray(a) && a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');

const api = async (method, p, body, token) => {
  const res = await fetch(API + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let data = null;
  try { data = await res.json(); } catch (_) {}
  return { status: res.status, data };
};

let chrome = null, ws = null;
const stamp = Date.now().toString().slice(-8);
const qaWaiterEmail = `qa-floor-waiter-${stamp}@example.com`;
const qaSubName = `QA Sub ${stamp}`;
const qaAdminEmail = `qa-floor-admin-${stamp}@example.com`;
let qaWaiterId = null, qaAdminId = null, managerToken = null, saToken = null, waiterToken = null, adminToken = null;

(async () => {
  // ───────────────────────────────────────────────────────────────────────
  // 0. Fixtures: a MANAGER token, plus a throwaway WAITER for Part 2
  // ───────────────────────────────────────────────────────────────────────
  section('0. Fixtures (real APIs)');
  const sa = await api('POST', '/auth/login', SA);
  check(sa.status === 200 && !!sa.data?.token, 'Super Admin login', sa.status);
  saToken = sa.data?.token;

  const lg = await api('POST', '/auth/login', MANAGER);
  check(lg.status === 200 && !!lg.data?.token, `Manager login (${MANAGER.email})`, lg.status);
  managerToken = lg.data?.token;

  // An ADMIN is needed for two things this tenant does not have: PUT
  // /users/:id/floors (ADMIN only) and removing the temp staff rows afterwards
  // (tenant DELETE /users/:id is ADMIN only). Created through the platform API
  // and deleted again in the cleanup block.
  const ca = await api('POST', '/super-admin/users', {
    restaurantId: RESTAURANT_ID, name: `QA Floor Admin ${stamp}`,
    email: qaAdminEmail, password: QA_PASS, role: 'ADMIN',
  }, saToken);
  qaAdminId = ca.data?.user?.id ?? ca.data?.data?.id ?? ca.data?.id;
  check(ca.status === 200 || ca.status === 201, 'QA ADMIN created (floor assignment is ADMIN-only)', ca.status);
  // Throwing (not process.exit) keeps the finally-block cleanup running.
  if (!qaAdminId) throw new Error('QA admin creation failed: ' + JSON.stringify(ca.data).slice(0, 200));

  const firstLogin = await api('POST', '/auth/login', { email: qaAdminEmail, password: QA_PASS });
  adminToken = firstLogin.data?.token;
  if (firstLogin.data?.mustChangePassword) {
    const newPass = QA_PASS + 'X';
    const cp = await api('POST', '/auth/change-password', { currentPassword: QA_PASS, newPassword: newPass }, adminToken);
    check(cp.status === 200, 'QA ADMIN completed the forced password change', cp.status);
    const relogin = await api('POST', '/auth/login', { email: qaAdminEmail, password: newPass });
    adminToken = relogin.data?.token;
  }
  check(!!adminToken, 'QA ADMIN can log in (needed for ADMIN-only floor assignment)');

  const cu = await api('POST', '/users', {
    name: `QA Floor Waiter ${stamp}`, email: qaWaiterEmail, password: QA_PASS, role: 'WAITER',
  }, adminToken);
  qaWaiterId = cu.data?.user?.id ?? cu.data?.data?.id ?? cu.data?.id;
  check(cu.status === 200 || cu.status === 201, 'QA WAITER created for the floor checks', cu.status);
  if (!qaWaiterId) throw new Error('QA waiter creation failed: ' + JSON.stringify(cu.data).slice(0, 200));

  const wl = await api('POST', '/auth/login', { email: qaWaiterEmail, password: QA_PASS });
  waiterToken = wl.data?.token;
  check(wl.status === 200 && !!waiterToken, 'QA WAITER can log in', wl.status);

  const assignFloors = async (floorIds) => {
    const out = await api('PUT', `/users/${qaWaiterId}/floors`, { floorIds }, adminToken);
    check(out.status === 200, `floor assignment saved (${floorIds.length} floor(s))`, out.status);
    return out;
  };

  const floorsResp = await api('GET', '/floors', undefined, managerToken);
  const floorIds = {};
  for (const f of floorsResp.data?.floors || []) floorIds[f.name] = f.id;
  check(ALL_FLOORS.every((n) => floorIds[n]), 'the target tenant has the expected floors', Object.keys(floorIds));

  // ───────────────────────────────────────────────────────────────────────
  // 1. Floor rule at the API level
  // ───────────────────────────────────────────────────────────────────────
  section('1. Floor assignment rule — API (Case A / Case B)');
  const myFloors = (t) => api('GET', '/users/me/floors', undefined, t);

  let r = await myFloors(waiterToken);
  check(r.status === 200 && r.data?.restricted === false, 'no assignments → restricted=false (Case A)', r.data?.restricted);
  check(sameSet((r.data?.floors || []).map((f) => f.name), ALL_FLOORS),
    'no assignments → ALL active floors are returned', (r.data?.floors || []).map((f) => f.name));

  r = await api('GET', '/floors', undefined, waiterToken);
  check(sameSet((r.data?.floors || []).map((f) => f.name), ALL_FLOORS),
    'no assignments → the Floors & Tables list is unrestricted too');
  r = await api('GET', `/floors/${floorIds.Outdoor}`, undefined, waiterToken);
  check(r.status === 200, 'no assignments → any floor can be fetched (not a permissions error)', r.status);

  await assignFloors([floorIds['Ground Floor'], floorIds['Outdoor']]);
  r = await myFloors(waiterToken);
  check(r.data?.restricted === true, 'assignments exist → restricted=true (Case B)', r.data?.restricted);
  check(sameSet((r.data?.floors || []).map((f) => f.name), ['Ground Floor', 'Outdoor']),
    'two assignments → exactly those two floors', (r.data?.floors || []).map((f) => f.name));

  await assignFloors([floorIds['Ground Floor']]);
  r = await myFloors(waiterToken);
  check(sameSet((r.data?.floors || []).map((f) => f.name), ['Ground Floor']),
    'one assignment → only that floor', (r.data?.floors || []).map((f) => f.name));
  check((await api('GET', `/floors/${floorIds.Outdoor}`, undefined, waiterToken)).status === 403,
    'an unassigned floor is REJECTED by the backend (403)');
  check((await api('GET', `/floors/${floorIds['Ground Floor']}`, undefined, waiterToken)).status === 200,
    'the assigned floor is still served (200)');

  await assignFloors([]);
  r = await myFloors(waiterToken);
  check(r.data?.restricted === false && sameSet((r.data?.floors || []).map((f) => f.name), ALL_FLOORS),
    'assignments removed → all active floors again', (r.data?.floors || []).map((f) => f.name));
  check((await api('GET', `/floors/${floorIds.Outdoor}`, undefined, waiterToken)).status === 200,
    'assignments removed → the previously unassigned floor is served again');

  // Inactive floors stay excluded (temporarily deactivated, then restored).
  await api('PUT', `/floors/${floorIds.Outdoor}`, { isActive: false }, managerToken);
  r = await myFloors(waiterToken);
  const withoutOutdoor = ALL_FLOORS.filter((n) => n !== 'Outdoor');
  check(!(r.data?.floors || []).some((f) => f.name === 'Outdoor'),
    'an INACTIVE floor is excluded from the selector', (r.data?.floors || []).map((f) => f.name));
  check(sameSet((r.data?.floors || []).map((f) => f.name), withoutOutdoor),
    'the remaining active floors are all still offered');
  const mgmt = await api('GET', '/floors', undefined, managerToken);
  check((mgmt.data?.floors || []).some((f) => f.name === 'Outdoor'),
    '…but Floors & Tables still lists it so it can be re-activated');
  await api('PUT', `/floors/${floorIds.Outdoor}`, { isActive: true }, managerToken);
  r = await myFloors(waiterToken);
  check(sameSet((r.data?.floors || []).map((f) => f.name), ALL_FLOORS),
    're-activating the floor restores it to the selector');

  // ───────────────────────────────────────────────────────────────────────
  // 2. Chrome over CDP
  // ───────────────────────────────────────────────────────────────────────
  section('2. Launching headless Chrome');
  let msgId = 0;
  const pending = new Map();
  const pageErrors = [];
  const send = (method, params = {}) => new Promise((res) => {
    const id = ++msgId;
    pending.set(id, res);
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expr) => {
    const res = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (res.result?.exceptionDetails) {
      throw new Error('eval failed: ' + (res.result.exceptionDetails.exception?.description || res.result.exceptionDetails.text || ''));
    }
    return res.result?.result?.value;
  };
  const waitFor = async (expr, timeoutMs = 30000, stepMs = 250, label = '') => {
    const deadline = Date.now() + timeoutMs;
    let last = null;
    while (Date.now() < deadline) {
      try { last = await evaluate(expr); if (last) return last; } catch (e) { last = 'eval-error: ' + e.message; }
      await sleep(stepMs);
    }
    if (label) {
      console.log(`    [timeout] ${label} → ${JSON.stringify(last)}`);
      try {
        const href = await evaluate('location.href');
        const ready = await evaluate('document.readyState');
        const hasQa = await evaluate('typeof window.__qa');
        const text = await evaluate('document.body ? document.body.innerText.slice(0, 300) : "(no body)"');
        console.log(`    [page] ${href} ready=${ready} qa=${hasQa} :: ${text}`);
      } catch (_) {}
    }
    return false;
  };
  // The on-new-document injection is the primary path; re-evaluating the source
  // is an idempotent safety net (a reload that raced the injection otherwise
  // leaves window.__qa undefined and every later step throws).
  const installHelpers = async () => {
    try { await evaluate(HELPERS); } catch (e) { console.log('  [helpers] injection failed: ' + e.message); throw e; }
  };
  // Wait for the DEV document to actually be the current one, THEN (re)install
  // the helpers and confirm they are live.
  const ensureHelpers = async (label) => {
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline) {
      try {
        const ready = await evaluate(`location.href.startsWith(${JSON.stringify(DEV)}) && document.readyState !== 'loading'`);
        if (ready) {
          await installHelpers();
          if (await evaluate('typeof window.__qa')) return true;
        }
      } catch (_) { /* execution context destroyed mid-navigation */ }
      await sleep(300);
    }
    throw new Error('page never became ready: ' + label);
  };
  const waitText = (t, ms = 25000, label = t) =>
    waitFor(`document.body.innerText.toLowerCase().includes(${JSON.stringify(String(t).toLowerCase())})`, ms, 250, `text: ${label}`);
  const waitShell = () => waitFor(`!!window.__qa && window.__qa.sidebarText().length > 0`, 45000, 400, 'app shell');

  // The page-side helpers live in their own file: template-literal escaping
  // silently mangled regex literals inside the injected source.
  const HELPERS = fs.readFileSync(new URL('./qa-helpers/page-helpers.js', import.meta.url), 'utf8');

  chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-proxy-server',
    '--no-default-browser-check', '--disable-extensions',
    // Vite binds IPv4 only; keep the host as localhost (backend CORS allow-list).
    '--host-resolver-rules=MAP localhost 127.0.0.1',
    `--remote-debugging-port=${CDP_PORT}`,
    '--window-size=1440,900',
    '--user-data-dir=' + CHROME_PROFILE,
    'about:blank',
  ], { stdio: 'ignore' });

  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    try {
      const list = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`).then((x) => x.json());
      const page = (list || []).find((t) => t.type === 'page');
      if (page?.webSocketDebuggerUrl) wsUrl = page.webSocketDebuggerUrl;
    } catch (_) {}
    if (!wsUrl) await sleep(300);
  }
  if (!wsUrl) throw new Error('Chrome CDP did not start');
  ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    if (msg.method === 'Runtime.exceptionThrown') {
      pageErrors.push(msg.params?.exceptionDetails?.exception?.description || msg.params?.exceptionDetails?.text || 'exception');
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error') {
      pageErrors.push(msg.params?.args?.map((a) => a.value || a.description || '').join(' '));
    }
  };
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: HELPERS });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  const loginAs = async (email, password, label) => {
    await ensureHelpers(`login (${label})`);
    await waitFor(`!!window.__qa && window.__qa.loginVisible()`, 60000, 300, `login form (${label})`);
    const out = await evaluate(`window.__qa.login(${JSON.stringify(email)}, ${JSON.stringify(password)})`);
    check(out === 'submitted', `real login form submitted (${label})`, out);
    check(!!(await waitShell()), `app shell rendered (${label})`);
  };
  const logout = async () => {
    await ensureHelpers('logout');
    await evaluate(`(() => { const b = document.querySelector('[aria-haspopup="menu"]'); if (b) b.click(); return 'x'; })()`);
    await waitFor(`!!document.querySelector('[role="menu"]')`, 8000, 200, 'profile menu');
    await evaluate(`window.__qa.clickText('Sign Out')`);
    await waitFor(`window.__qa.loginVisible()`, 15000, 300, 'login screen after logout');
  };

  // ─── Part 1: Manage Subcategories ──────────────────────────────────────
  section('3. Part 1 — Manage Subcategories modal (real UI)');
  await send('Page.navigate', { url: DEV });
  await loginAs(MANAGER.email, MANAGER.password, 'manager');
  await evaluate(`window.__qa.clickText('Menu & Stock')`);
  await waitText('Manage Subcategories', 30000, 'Menu & Stock screen');
  const opened = await evaluate('window.__qa.openSubcatModal()');
  check(opened === 'clicked', 'Manage Subcategories button opens the modal', opened);
  await waitFor(`window.__qa.subcatModal().present`, 8000, 200, 'subcategories modal');

  let m = await evaluate('window.__qa.subcatModal()');
  check(m.present === true, 'modal rendered');
  check(m.options.some((o) => o.text === CATEGORY_WITH_SUBS),
    `the category selector offers "${CATEGORY_WITH_SUBS}"`, m.options.map((o) => o.text));
  check(m.options.every((o) => /^cat-\d+$/.test(o.value) || o.value === ''),
    'category option values carry the `cat-<id>` token (the mismatch that hid the rows)', m.options.slice(0, 3));

  const sel = await evaluate(`window.__qa.selectCategory(${JSON.stringify(CATEGORY_WITH_SUBS)})`);
  check(String(sel).startsWith('selected:'), `selected the "${CATEGORY_WITH_SUBS}" category`, sel);
  await sleep(500);
  m = await evaluate('window.__qa.subcatModal()');
  check(m.rows.length === REAL_SUBS.length,
    `every existing subcategory is listed (${REAL_SUBS.length} rows)`, m.rows.map((x) => x.name));
  check(sameSet(m.rows.map((x) => x.name), REAL_SUBS), 'the listed names are the real subcategories', m.rows.map((x) => x.name));
  check(m.rows.every((x) => x.hasEdit), 'every row has an Edit control');
  check(m.rows.every((x) => x.hasDelete && x.deleteLabel),
    'every row has a Delete control', m.rows.map((x) => x.deleteLabel));
  check(m.emptyMessage === false, 'the empty-state message is NOT shown when subcategories exist');

  // Edit → the form switches to editing with Save + Cancel
  check((await evaluate(`window.__qa.rowAction('Long & Flat Pasta', 'edit')`)) === 'clicked', 'clicked Edit on "Long & Flat Pasta"');
  await sleep(300);
  m = await evaluate('window.__qa.subcatModal()');
  check(/Edit Subcategory/.test(m.formLabel || ''), 'the form switches to "Edit Subcategory"', m.formLabel);
  check(m.inputValue === 'Long & Flat Pasta', 'the form is prefilled with the current name', m.inputValue);
  check(m.buttons.includes('Save') && m.buttons.includes('Cancel'), 'Save and Cancel are available', m.buttons);

  // Duplicate + empty-name rejection
  await evaluate(`window.__qa.setSubcatName('Short & Tubular Pasta')`);
  await sleep(200);
  await evaluate(`window.__qa.clickModalButton('Save')`);
  await sleep(900);
  const dupText = await evaluate('window.__qa.bodyText()');
  check(/already exists in this category/i.test(dupText), 'a duplicate name inside the same category is rejected');
  m = await evaluate('window.__qa.subcatModal()');
  check(sameSet(m.rows.map((x) => x.name), REAL_SUBS), 'no duplicate row was created');
  await evaluate(`window.__qa.setSubcatName('')`);
  await sleep(200);
  m = await evaluate('window.__qa.subcatModal()');
  check(m.saveDisabled === true, 'an empty name cannot be saved (button disabled)', m.saveDisabled);
  check((await evaluate(`window.__qa.clickModalButton('Cancel')`)) === 'clicked', 'Cancel exits edit mode');
  await sleep(300);
  m = await evaluate('window.__qa.subcatModal()');
  check(/Add Subcategory/.test(m.formLabel || ''), 'the form returns to "Add Subcategory"', m.formLabel);

  // Create → rename → delete a throwaway subcategory, entirely through the UI
  await evaluate(`window.__qa.setSubcatName(${JSON.stringify(qaSubName)})`);
  await sleep(200);
  check((await evaluate(`window.__qa.clickModalButton('Add')`)) === 'clicked', `created "${qaSubName}" from the modal`);
  await waitFor(`window.__qa.subcatModal().rows.some((r) => r.name === ${JSON.stringify(qaSubName)})`, 10000, 300, 'new subcategory row');
  m = await evaluate('window.__qa.subcatModal()');
  check(m.rows.length === REAL_SUBS.length + 1, 'the new subcategory appears immediately (list refreshed)');
  const fresh = m.rows.find((x) => x.name === qaSubName);
  check(!!fresh && fresh.hasEdit && fresh.hasDelete, 'the new row has Edit + Delete controls', fresh);

  const renamed = `${qaSubName} Renamed`;
  check((await evaluate(`window.__qa.rowAction(${JSON.stringify(qaSubName)}, 'edit')`)) === 'clicked', 'clicked Edit on the new row');
  await sleep(300);
  await evaluate(`window.__qa.setSubcatName(${JSON.stringify(renamed)})`);
  await sleep(200);
  await evaluate(`window.__qa.clickModalButton('Save')`);
  await waitFor(`window.__qa.subcatModal().rows.some((r) => r.name === ${JSON.stringify(renamed)})`, 10000, 300, 'renamed row');
  m = await evaluate('window.__qa.subcatModal()');
  check(m.rows.some((x) => x.name === renamed), 'the edited name is persisted and the list refreshed', m.rows.map((x) => x.name));
  check(!m.rows.some((x) => x.name === qaSubName), 'the old name is gone');
  const apiAfterEdit = await api('GET', '/menu/subcategories?categoryId=9', undefined, managerToken);
  check((apiAfterEdit.data?.data?.subcategories || []).some((s) => s.name === renamed),
    'the rename is persisted in the database (API confirm)');

  // Referenced subcategory → deletion is blocked and demands a destination
  check((await evaluate(`window.__qa.rowAction(${JSON.stringify(REFERENCED_SUB)}, 'delete')`)) === 'clicked', 'clicked Delete on a REFERENCED subcategory');
  await waitFor(`window.__qa.deleteDialog().present`, 8000, 200, 'delete confirmation');
  let dlg = await evaluate('window.__qa.deleteDialog()');
  check(dlg.present === true, 'a confirmation dialog is shown before deletion');
  check(/1 menu item\(s\) use this subcategory/.test(dlg.text), 'the dialog explains that menu items use it', dlg.text.slice(0, 140));
  check(/They will NOT be deleted/.test(dlg.text), 'the dialog states the items will NOT be deleted');
  check(dlg.options.includes('None (no subcategory)'), 'the dialog offers the supported reassignment targets', dlg.options);
  check(!dlg.options.includes(REFERENCED_SUB), 'the subcategory being deleted is not a reassignment target');
  check((await evaluate('window.__qa.closeDeleteDialog()')) === 'clicked', 'deletion was cancelled — nothing was deleted');
  await sleep(400);
  const afterCancel = await api('GET', '/menu/subcategories?categoryId=9', undefined, managerToken);
  check((afterCancel.data?.data?.subcategories || []).some((s) => s.name === REFERENCED_SUB),
    'cancelling leaves the subcategory (and its items) untouched');

  // Delete the throwaway subcategory (unreferenced) through the UI
  check((await evaluate(`window.__qa.rowAction(${JSON.stringify(renamed)}, 'delete')`)) === 'clicked', 'clicked Delete on the unreferenced row');
  await waitFor(`window.__qa.deleteDialog().present`, 8000, 200, 'delete confirmation');
  dlg = await evaluate('window.__qa.deleteDialog()');
  check(/No menu items use this subcategory/.test(dlg.text), 'the dialog confirms nothing references it', dlg.text.slice(0, 120));
  await evaluate(`window.__qa.clickText('Delete', true)`);
  await waitFor(`!window.__qa.subcatModal().rows.some((r) => r.name === ${JSON.stringify(renamed)})`, 10000, 300, 'row removed');
  m = await evaluate('window.__qa.subcatModal()');
  check(sameSet(m.rows.map((x) => x.name), REAL_SUBS), 'the deleted row is gone and the real rows remain', m.rows.map((x) => x.name));
  const apiAfterDelete = await api('GET', '/menu/subcategories?categoryId=9', undefined, managerToken);
  check(!(apiAfterDelete.data?.data?.subcategories || []).some((s) => s.name === renamed),
    'the deletion is persisted in the database (API confirm)');
  await evaluate('window.__qa.closeModal()');
  await sleep(300);

  // ─── Part 2: POS floor selector ────────────────────────────────────────
  section('4. Part 2 — POS floor selector (real UI)');
  await logout();

  const reloadPage = async (label) => {
    await send('Page.reload', { ignoreCache: true });
    await ensureHelpers(`reload (${label})`);
    await waitShell();
    await sleep(2500);
  };

  const gotoFloorStep = async (label) => {
    await ensureHelpers(`pos (${label})`);
    await evaluate(`window.__qa.clickText('POS Ordering')`);
    await waitFor(`window.__qa.bodyText().includes('order type') || window.__qa.bodyText().includes('dine in') || window.__qa.floorStep().present`,
      30000, 300, `POS ordering (${label})`);
    await sleep(800);
    // Managers get the Order Type screen; staff without the Takeaway grant skip it.
    if (!(await evaluate('window.__qa.floorStep().present'))) {
      await evaluate(`window.__qa.clickText('Dine In')`);
    }
    await waitFor(`window.__qa.floorStep().present`, 25000, 300, `floor/table step (${label})`);
    await sleep(600);
    return evaluate('window.__qa.floorStep()');
  };

  await loginAs(qaWaiterEmail, QA_PASS, 'QA waiter');
  let step = await gotoFloorStep('Case A');
  check(step.present && step.step === 'floor', 'the POS floor step rendered for the waiter', step.step);
  check(sameSet(step.floors, ALL_FLOORS),
    'CASE A — no assignments → ALL active floors are shown in the POS selector', step.floors);
  check(!/No floor has been assigned/.test(step.text), 'the "no floor assigned" state is not shown');

  await assignFloors([floorIds['Ground Floor'], floorIds['VIP Lounge']]);
  await reloadPage('Case B (two floors)');
  step = await gotoFloorStep('Case B (two floors)');
  check(step.present && step.step === 'floor', 'the POS floor step rendered after assignment');
  check(sameSet(step.floors, ['Ground Floor', 'VIP Lounge']),
    'CASE B — only the assigned floors are shown', step.floors);
  check(!step.floors.includes('Outdoor'), 'an unassigned floor is NOT offered');

  await assignFloors([floorIds['Ground Floor']]);
  await reloadPage('Case B (single floor)');
  step = await gotoFloorStep('Case B (single floor)');
  check(step.present && step.step === 'table',
    'CASE B (single floor) — the floor step is skipped and the only permitted floor is auto-selected', step.step);
  check(/Floor: Ground Floor/.test(step.text || ''),
    'the table step is scoped to the assigned floor', (step.text || '').slice(0, 120));

  await assignFloors([]);
  await reloadPage('Case A restored');
  step = await gotoFloorStep('Case A restored');
  check(step.present && step.step === 'floor' && sameSet(step.floors, ALL_FLOORS),
    'CASE A RESTORED — removing every assignment shows all active floors again', step.floors);

  section('5. Runtime errors');
  const realErrors = pageErrors.filter((e) => !/Download the React DevTools|favicon|Failed to load resource|net::ERR/i.test(e));
  check(realErrors.length === 0, 'no unexpected runtime/console errors during the session', realErrors.slice(0, 3));
})().catch((e) => {
  console.error('\nHARNESS ERROR:', e);
  fail++;
}).finally(async () => {
  // ── Cleanup: QA waiter + floor state (QA subcategory already deleted by the UI) ──
  section('6. Cleanup');
  // Tenant staff are removed through the tenant route (ADMIN only) — the waiter
  // first, then the temp ADMIN itself (its token dies with the row).
  try {
    if (qaWaiterId && adminToken) {
      const delW = await api('DELETE', `/users/${qaWaiterId}`, undefined, adminToken);
      check(delW.status === 200 || delW.status === 204, 'QA waiter removed', delW.status);
    }
  } catch (e) { check(false, 'QA waiter removed', e.message); }
  // The temp ADMIN is a restaurant admin, which lives in the PLATFORM user
  // table — removed through the super-admin endpoint (the tenant route 404s).
  try {
    if (qaAdminId && saToken) {
      const delA = await api('DELETE', `/super-admin/users/${qaAdminId}`, undefined, saToken);
      check(delA.status === 200 || delA.status === 204, 'QA admin removed', delA.status);
    }
  } catch (e) { check(false, 'QA admin removed', e.message); }
  try {
    const floors = await api('GET', '/floors', undefined, managerToken);
    const outdoor = (floors.data?.floors || []).find((f) => f.name === 'Outdoor');
    if (outdoor && outdoor.isActive !== true) {
      await api('PUT', `/floors/${outdoor.id}`, { isActive: true }, managerToken);
      console.log('  (floor "Outdoor" re-activated)');
    }
  } catch (e) { console.log('  (floor cleanup failed)', e.message); }
  try {
    const subs = await api('GET', '/menu/subcategories?categoryId=9', undefined, managerToken);
    for (const s of subs.data?.data?.subcategories || []) {
      if (String(s.name).startsWith('QA Sub ')) {
        await api('DELETE', `/menu/subcategories/${s.id}`, undefined, managerToken);
        console.log(`  (leftover QA subcategory "${s.name}" removed)`);
      }
    }
  } catch (e) { console.log('  (subcategory cleanup failed)', e.message); }

  console.log(`\n${'='.repeat(64)}\n  BROWSER QA → ${pass} passed, ${fail} failed\n${'='.repeat(64)}`);
  try { ws?.close(); } catch (_) {}
  try { chrome?.kill(); } catch (_) {}
  await sleep(1200);
  try { fs.rmSync(CHROME_PROFILE, { recursive: true, force: true }); } catch (_) {}
  process.exit(fail > 0 ? 1 : 0);
});
