/**
 * ADD ITEM · POLLING / NAVIGATION · REPORT KEYS — Frontend Test Suite
 * Standalone — run with: node src/__tests__/add-item-and-refresh.test.js
 *
 *  1. Add Item reuses the normal POS Ordering screen (no modal, no second order)
 *  2. Polling refreshes DATA only — no route navigation, no page reload,
 *     no state reset, stale/overlapping responses discarded
 *  3. The route guard does not bounce to Dashboard on a default/partial
 *     settings snapshot (the "jumped to Dashboard" symptom)
 *  4. ManagementReports renders its lists with stable keys
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '..');
const read = (rel) => readFileSync(path.join(SRC, rel), 'utf8');

const results = { pass: 0, fail: 0 };
function section(t) { console.log(`\n${'='.repeat(60)}\n  ${t}\n${'='.repeat(60)}`); }
function sub(t) { console.log(`\n  --- ${t} ---`); }
function check(cond, msg) {
  process.stdout.write(cond ? '  ✅ ' : '  ❌ ');
  console.log(msg);
  cond ? results.pass++ : results.fail++;
}
function eq(actual, expected, label) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  process.stdout.write(pass ? '  ✅ ' : '  ❌ ');
  console.log(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  pass ? results.pass++ : results.fail++;
}

const activeOrders = read('features/orders/pages/ActiveOrdersPage.jsx');
const kitchen = read('features/kitchen/pages/KitchenPage.jsx');
const wizard = read('features/pos/workspace/components/TakeOrderWizard.jsx');
const newOrderPage = read('features/pos/workspace/pages/NewOrderPage.jsx');
const posWorkspace = read('features/pos/workspace/pages/PosWorkspace.jsx');
const settingsPage = read('features/settings/pages/SettingsPage.jsx');
const appShell = read('components/layout/app-shell/AppShell.jsx');
const socketHook = read('hooks/useSocket.js');
const socketService = read('services/socket.js');
const panel = read('features/kitchen/components/KotPrinterStatus.jsx');
const uiStore = read('store/uiStore.js');
const reports = read('features/reports/components/ManagementReports.jsx');
const loginPage = read('features/auth/pages/LoginPage.jsx');
const axiosSrc = read('api/axios.js');

// ═══════════════════════════════════════════════
//  1. ADD ITEM → NORMAL POS ORDERING
// ═══════════════════════════════════════════════
section('1. ADD ITEM REUSES THE NORMAL POS ORDERING SCREEN');

const { resolveAddItemScreen } = await import('../utils/orderFlow.js');
eq(resolveAddItemScreen(), 'new_order', 'Add Item targets the POS Ordering screen');

sub('Active Orders hands the order over — it never opens the modal wizard');
const addItemBlock = activeOrders.slice(
  activeOrders.indexOf('const handleAddItem'),
  activeOrders.indexOf('const handlePrintKOT')
);
check(/setActiveOrderTakingId\(`ord-\$\{order\.id\}`\)/.test(addItemBlock),
  'the clicked order id is handed to the wizard');
check(/setShowTakeOrderWizard\(false\)/.test(addItemBlock),
  'the old modal overlay is explicitly NOT opened');
check(/setScreen\(resolveAddItemScreen\(settings\)\)/.test(addItemBlock),
  'the POS Ordering screen is opened (page mode)');
check(/clearPendingTable\(\)/.test(addItemBlock),
  'a stale table hand-off cannot leak into the edit session');

sub('Printer status panel is a compact horizontal card (no oversized banner)');
check(/px-2\.5 py-1\.5/.test(panel), 'compact padding (no tall banner)');
check(/sm:flex-row sm:items-center/.test(panel), 'single horizontal row from sm up');
check(/flex min-w-0 flex-1 items-center gap-2/.test(panel), 'icon + heading + description sit on the left');
check(/sm:shrink-0 sm:justify-end/.test(panel), 'the actions sit on the right');
check(/h-6 shrink-0 items-center/.test(panel) && /flex flex-wrap items-center gap-1\.5/.test(panel),
  'compact actions wrap neatly on narrow screens');
check(/line-clamp-2/.test(panel), 'the description is capped at two lines');
check(!/py-3\.5|h-7 shrink-0/.test(panel), 'no oversized padding/buttons remain');
check(/aria-live="polite"/.test(panel), 'status changes are announced accessibly');
check(/<KotPrinterStatus/.test(settingsPage), 'the same compact panel renders in POS Settings');
check(/openKotPrintWindow\(\)/.test(panel) && /renderKotInWindow\(win,/.test(panel),
  'Test Print uses the real print path and reports its result');
check(/Confirm it\s+in the dialog|Confirm it in the dialog/.test(panel) || /Confirm it in the dialog/.test(panel),
  'Test Print never claims a physical print');

sub('The POS Ordering screen is the same menu-selection experience');
check(/<TakeOrderWizard mode="page" \/>/.test(newOrderPage), 'NewOrderPage renders the wizard in page mode');
check(/activeOrderTakingId/.test(newOrderPage) && /hasOrderHandoff/.test(newOrderPage),
  'an edit hand-off always opens the wizard (never the scan-only workspace)');
check(/\[categories, setCategories\]/.test(wizard) && /renderMenu/.test(wizard),
  'the wizard owns the category/subcategory/search/menu selection UI');
check(/\[subcategories, setSubcategories\]/.test(wizard), 'subcategories are loaded once with the menu');
check(/selectedCat/.test(wizard) && /selectedSubcat/.test(wizard) && /searchQuery/.test(wizard),
  'category, subcategory and search selection state live in the wizard');
check(/menuApi\.getAll\(\)/.test(wizard), 'the same tenant menu source is used');

sub('Existing items load read-only — never duplicated into the new-lines cart');
const editBlock = wizard.slice(
  wizard.indexOf('if (activeOrderTakingId) {'),
  wizard.indexOf('const resetWizard')
);
check(/setEditExistingItems\(existingItems\)/.test(editBlock), 'existing lines are shown as the order context');
check(!/setCart\(/.test(editBlock), 'existing lines are never re-added to the cart (no duplicates)');
check(/orderData\.orderItems \|\| \[\]/.test(editBlock), 'the existing items come from the real order');
check(/setSelectedTable\(\{/.test(editBlock), 'the order table is restored');
check(/orderData\.orderType === 'DINE_IN' && orderData\.table/.test(editBlock),
  'only a real dine-in order restores a table (takeaway/counter stay table-less)');
check(/setOrderType\(resolvedOrderType\)/.test(editBlock), 'the original order type is preserved');
check(/setGuestCount\(orderData\.guestCount\)/.test(editBlock), 'the original guest count is preserved');
check(/setCurrentStep\(resolvedOrderType === 'takeaway' \? 1 : 3\)/.test(editBlock),
  'the session opens on the Menu step (no re-asking type/floor/table)');

sub('Confirmation updates the SAME order and issues only a delta KOT');
const updateBlock = wizard.slice(
  wizard.indexOf('const handleUpdateOrder'),
  wizard.indexOf('// ── End of session ──')
);
check(/orderApi\.addItem\(backendId/.test(updateBlock), 'new lines are added to the existing order id');
check(!/orderApi\.create\(/.test(updateBlock), 'the edit path never creates a second order');
check(/kotApi\.create\(\{ orderId: backendId \}\)/.test(updateBlock),
  'the KOT is the backend delta for the same order');
check(/kotData\?\.kotItems \|\| \[\]/.test(updateBlock),
  'only the delta KOT items are printed');
check(/manual: true/.test(updateBlock), 'the incremental print is a manual dispatch');
check(/incrementRefreshTrigger\(\)/.test(updateBlock), 'Active Orders is refreshed with the update');
check(/This order already exists — use Update Order to add items/.test(wizard),
  'creating a second order from an edit session is refused');

sub('Finishing returns to Active Orders (not Dashboard)');
const finishBlock = wizard.slice(wizard.indexOf('const finishSession'), wizard.indexOf('const handleClose'));
check(/const wasEditSession = isEditing;/.test(finishBlock), 'the session type is captured before cleanup');
check(/goBackScreen\('active_orders'\)/.test(finishBlock),
  'an edit session returns to the screen that started it');
check(/const \{ showTakeOrderWizard, setShowTakeOrderWizard, setScreen, goBack: goBackScreen/.test(wizard),
  'the store return action is separate from the wizard step Back button');
check(/setActiveOrderTakingId\(null\)/.test(finishBlock) && /clearPendingTable\(\)/.test(finishBlock),
  'the edit id and any hand-off are cleared');

// ═══════════════════════════════════════════════
//  2. POLLING NEVER NAVIGATES OR RELOADS
// ═══════════════════════════════════════════════
section('2. POLLING REFRESHES DATA ONLY');

sub('No POS screen reloads or navigates from a data refresh');
for (const [name, src] of Object.entries({ activeOrders, kitchen, posWorkspace, settingsPage })) {
  check(!/window\.location\.(reload|href)/.test(src), `${name}: no forced page reload/navigation`);
}
check(!/window\.location\.(reload|href)/.test(socketHook), 'the polling hook itself never reloads');
check(!/setScreen\(/.test(socketHook), 'the polling hook itself never navigates');

sub('One interval per screen, no overlap, hidden tabs skipped, clean teardown');
check(/export const DEFAULT_POLL_INTERVAL_MS = 30000/.test(socketHook), 'the cadence is a named, configurable convention');
check(/if \(cancelled \|\| inFlight\) return;/.test(socketHook), 'a tick is skipped while a poll is in flight');
check(/document\.visibilityState === 'hidden'/.test(socketHook), 'hidden tabs are not polled');
check(/document\.addEventListener\('visibilitychange'/.test(socketHook), 'returning to the tab refreshes once');
check(/clearInterval\(intervalRef\.current\)/.test(socketHook), 'the interval is cleared on unmount');
check(/removeEventListener\('visibilitychange'/.test(socketHook), 'the visibility listener is removed too');
check(/intervalRef\.current = null/.test(socketHook), 'no duplicate interval survives the cleanup');
check(/catch \{[\s\S]{0,260}screen owns its own/.test(socketHook),
  'a rejected poll is swallowed (the screen keeps its error state)');
check(/reconnection: true/.test(socketService), 'the socket reconnects after a backend restart');
check(/transports: \['websocket', 'polling'\]/.test(socketService), 'polling transport is available when WS fails');

sub('Stale/overlapping responses are discarded; a failure keeps the screen');
check(/activeRequestSeqRef/.test(activeOrders), 'Active Orders guards response ordering');
check(/kotRequestSeqRef/.test(kitchen), 'Kitchen Tickets guards response ordering');
check(/seq !== activeRequestSeqRef\.current\) return/.test(activeOrders), 'an older poll cannot overwrite newer data');
check(/seq !== kotRequestSeqRef\.current\) return/.test(kitchen), 'an older KOT poll cannot overwrite newer data');
check(/Showing the last loaded data\./.test(activeOrders) && /Showing the last loaded data\./.test(kitchen),
  'a refresh failure is a non-blocking notice');

sub('Tabs, search and selected records survive a poll');
const fetchActiveBlock = activeOrders.slice(
  activeOrders.indexOf('const fetchActiveOrders'),
  activeOrders.indexOf('const fetchCompletedAndCancelled')
);
const fetchKotsBlock = kitchen.slice(kitchen.indexOf('const fetchKots'), kitchen.indexOf('// ── Real-time updates'));
for (const setter of ['setOrdersActiveTab', 'setSearchQuery', 'setPreviewOrder', 'setTypeFilter', 'setScreen']) {
  check(!new RegExp(`${setter}\\(`).test(fetchActiveBlock), `Active Orders poll does not touch ${setter}`);
}
for (const setter of ['setActiveTab', 'setSearchQuery', 'setSelectedKotId', 'setScreen']) {
  check(!new RegExp(`${setter}\\(`).test(fetchKotsBlock), `Kitchen Tickets poll does not touch ${setter}`);
}
check(/pollFn: fetchActiveOrders, pollInterval: 30000/.test(activeOrders), 'Active Orders polls data at the project cadence');
check(/pollFn: fetchKots/.test(kitchen), 'Kitchen Tickets polls data');
check(/useState\('Active'\)/.test(activeOrders) || /useState\('Active'\)/.test(kitchen),
  'tabs/search are local state, not re-derived from a poll');

// ═══════════════════════════════════════════════
//  3. ROUTE GUARD: NO DASHBOARD BOUNCE
// ═══════════════════════════════════════════════
section('3. ROUTE GUARD DOES NOT BOUNCE TO DASHBOARD');

sub('The guard waits for a real tenant snapshot');
check(/if \(!lastFetched\) return;/.test(appShell),
  'module/mode checks never run on the default snapshot');
check(/lastFetched, activeOrderTakingId, pendingTable\]/.test(appShell),
  'the guard re-runs when the snapshot or hand-off changes');
check(/const handoffActive = !!\(activeOrderTakingId \|\| pendingTable\)/.test(appShell),
  'an order-entry hand-off is recognised');
check(/screen === 'new_order' && handoffActive/.test(appShell),
  'the POS Ordering screen is allowed for a hand-off in any business mode');
check(/modeAllowsScreen\(currentScreen\)/.test(appShell),
  'the same rule is used by the guard effect AND the render check');
check(!/setScreen\('dashboard'\)/.test(appShell.match(/Route Protection[\s\S]{0,3000}/)?.[0] || ''),
  'the guard never hard-codes Dashboard (it uses the resolved fallback)');
check(/const settingsSettled = !!lastFetched;/.test(appShell),
  'the render check also waits for a real snapshot');
check(/settingsSettled \? modeAllowsScreen\(currentScreen\) : true/.test(appShell),
  'Access Denied is not shown purely because settings are still loading');

sub('Only a real 401 is session expiry — with a clear message');
check(/setLoginNotice\('Your session expired\. Please sign in again\.'\)/.test(appShell),
  'an expired session explains why the login screen is shown');
check(/loginNotice/.test(loginPage), 'the login screen displays the one-shot notice');
check(/error\.response\?\.status === 401/.test(axiosSrc), 'only HTTP 401 triggers the expiry flow');
check(/!String\(error\.config\?\.url \|\| ''\)\.includes\('\/auth\/login'\)/.test(axiosSrc),
  'a failed login attempt is never treated as expiry');
check(!/status === 403[\s\S]{0,120}session-expired/.test(axiosSrc),
  'a 403 permission error is never disguised as session expiry');

// ═══════════════════════════════════════════════
//  4. MANAGEMENT REPORTS KEYS
// ═══════════════════════════════════════════════
section('4. MANAGEMENT REPORTS KEYS');

sub('Every mapped row has a stable key');
check(/key=\{k\.label\}/.test(reports), 'Kitchen KPI tiles are keyed by their label');
check(!/\]\.map\(\(k, i\) => \(/.test(reports), 'no index-keyed KPI list remains');
check(/key=\{item\.menuItemId \|\| item\.id \|\| item\.name/.test(reports),
  'top items use their record id (index only as last resort)');
check(/key=\{cat\.categoryId \|\| cat\.id \|\| cat\.categoryName/.test(reports),
  'category rows use their record id');
check(/key=\{method\}/.test(reports), 'payment rows are keyed by method');
check(/key=\{t\.key\}/.test(reports), 'sub-tab buttons are keyed by their stable key');
check(!/console\.(error|warn)\s*=\s*\(\)\s*=>\s*\{\s*\}/.test(reports),
  'the warning is fixed at the source, not suppressed');

// ═══════════════════════════════════════════════
//  SUMMARY
// ═══════════════════════════════════════════════
section('RESULTS');
console.log(`\n  Total:  ${results.pass + results.fail}`);
console.log(`  Passed: ${results.pass} ✅`);
console.log(`  Failed: ${results.fail} ${results.fail > 0 ? '❌' : '✅'}`);
console.log(`  Rate:   ${((results.pass / (results.pass + results.fail)) * 100).toFixed(1)}%`);

if (results.fail > 0) {
  console.log('\n  ❌ SOME TESTS FAILED\n');
  process.exit(1);
} else {
  console.log('\n  ✅ ALL TESTS PASSED\n');
}
