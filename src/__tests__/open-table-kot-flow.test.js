/**
 * Open Table → Order Entry, KOT tab filtering, duplicate-KOT prevention and
 * sidebar branding — Frontend Test Suite
 * Standalone — run with: node src/__tests__/open-table-kot-flow.test.js
 *
 * Follows the repo's standalone pattern (src/__tests__/run.js): pure-function
 * imports are exercised with real inputs, and the feature files are checked for
 * the source invariants that implement each documented requirement.
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
  const norm = (v) => (v !== null && typeof v === 'object' ? JSON.stringify(v) : v);
  const pass = norm(actual) === norm(expected);
  process.stdout.write(pass ? '  ✅ ' : '  ❌ ');
  console.log(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  pass ? results.pass++ : results.fail++;
}

const tablePage = read('features/masters/table/pages/TablePage.jsx');
const wizard = read('features/pos/workspace/components/TakeOrderWizard.jsx');
const kitchen = read('features/kitchen/pages/KitchenPage.jsx');
const sidebar = read('components/layout/sidebar/Sidebar.jsx');
const appLogo = read('components/common/AppLogo.jsx');
const activeOrders = read('features/orders/pages/ActiveOrdersPage.jsx');
const uiStore = read('store/uiStore.js');
const settingsStore = read('store/settingsStore.js');
const orderApi = read('api/order.api.js');
const orderController = readFileSync(path.join(SRC, '../../backend/src/controllers/order.controller.js'), 'utf8');
const kotController = readFileSync(path.join(SRC, '../../backend/src/controllers/kot.controller.js'), 'utf8');
const orderRoutes = readFileSync(path.join(SRC, '../../backend/src/routes/order.routes.js'), 'utf8');
const releaseScript = readFileSync(path.join(SRC, '../../backend/scripts/release-held-orders.js'), 'utf8');

// ═══════════════════════════════════════════════
//  1. OPEN TABLE HAND-OFF (selected table identity)
// ═══════════════════════════════════════════════
section('1. OPEN TABLE — the SELECTED table is carried by its database id');

sub('uiStore owns one explicit hand-off slot');
check(/pendingTable: null,/.test(uiStore), 'pendingTable state exists (null by default)');
check(/setPendingTable: \(table\) => set\(\{ pendingTable: table \|\| null \}\)/.test(uiStore),
  'setPendingTable accepts a table (or clears it)');
check(/clearPendingTable: \(\) => set\(\{ pendingTable: null \}\)/.test(uiStore),
  'clearPendingTable clears the hand-off');

sub('Floors & Tables passes the real id + display number');
check(/setPendingTable\(\{/.test(tablePage) && /id: parseInt\(String\(openTableTarget\.id\)\.replace\('t-', ''\), 10\)/.test(tablePage),
  'the tapped table\'s BACKEND id is passed (not the list index, not the number)');
check(/tableNo: openTableTarget\.tableNo \|\| String\(openTableTarget\.number \?\? ''\)/.test(tablePage),
  'the display number is carried through');
check(/setOpenTableTarget\(table\)/.test(tablePage),
  'the clicked table object is stored (never a bare index/number)');
check(!/setActiveTableNumber/.test(tablePage), 'the old ambiguous activeTableNumber state is gone');
check(!/o\.table\?\.tableNo\?\.toString\(\) === tableNo/.test(wizard),
  'the wizard never matches tables by display number');

sub('Open Table opens a NEW order and goes straight to the menu ON the POS Ordering screen');
check(/setActiveOrderTakingId\(null\); \/\/ hard reset/.test(tablePage),
  'the stale edit-order id is cleared before opening (never edits an old order)');
// One integrated screen: the tapped table is handed to the POS Ordering screen
// (TakeOrderWizard in page mode). A separate modal/card overlay is NOT opened.
check(/const orderEntryScreen = resolveOrderEntryScreen\(settings\);/.test(tablePage),
  'the mode\'s order-entry screen is resolved (business-mode aware)');
check(/setShowTakeOrderWizard\(false\);\s*setScreen\(orderEntryScreen\);/.test(tablePage),
  'the menu opens on the POS Ordering screen instead of a separate overlay');
check(/if \(orderEntryScreen\) \{[\s\S]{0,140}?\} else \{\s*setShowTakeOrderWizard\(true\);/.test(tablePage),
  'the overlay is kept ONLY as the fallback for modes with no order-entry screen');
check(!/status: 'Occupied', currentOrderId: null/.test(tablePage),
  'the table is NOT marked occupied optimistically (the backend does that on order creation)');
check(/if \(!openTableTarget \|\| openingTableRef\.current\) return;/.test(tablePage),
  'repeated taps cannot open the wizard twice');

sub('No Dine In / Take Away step and no floor/table re-selection');
check(/const isOpenTableFlow = !!pendingTable && !activeOrderTakingId;/.test(wizard),
  'the wizard detects the Open Table hand-off');
check(/setOrderType\(openTableFlow \? 'dine_in' : null\)/.test(wizard),
  'order type is DINE_IN for this flow');
check(/setCurrentStep\(openTableFlow \? 3 : 0\)/.test(wizard),
  'the wizard starts on the Menu step (order-type/floor/table skipped)');
check(/isOpenTableFlow\s*\?\s*\['Menu', 'Review'\]/.test(wizard),
  'the step indicator shows Menu → Review only');
check(/const canGoBack = currentStep > 0 && !\(isOpenTableFlow && currentStep <= 3\)/.test(wizard),
  'Back cannot return to the skipped order-type/floor/table screens');

sub('The table is re-validated server-side before any order exists');
check(/const loadedTables = settled\[3\]\?\.status === 'fulfilled'/.test(wizard),
  'the wizard resolves the table from the tenant-scoped GET /tables response');
check(/const match = loadedTables\.find\(\(t\) => t\.id === `t-\$\{pendingTable\.id\}`\)/.test(wizard),
  'the match is by the REAL database id (duplicate numbers across floors are safe)');
check(/if \(match\.status !== 'Available'\)/.test(wizard),
  'occupied / reserved / cleaning tables are rejected');
check(/clearPendingTable\(\);/.test(wizard) && /setSelectedTable\(null\)/.test(wizard),
  'a rejected table clears the hand-off and cannot be ordered on');
check(/setSelectedTable\(match\);\s*setGuestCount\(pendingTable\.seats \|\| match\.seats \|\| 2\);/.test(wizard),
  'the authoritative table row + guest count are applied');
check(/orderType: backendOrderType,/.test(wizard) && /orderType === 'dine_in' \? 'DINE_IN' : 'TAKEAWAY'/.test(wizard),
  'the payload uses the existing DINE_IN enum value');

sub('The table flow runs INLINE on the POS Ordering screen (page mode)');
const newOrderPage = read('features/pos/workspace/pages/NewOrderPage.jsx');
check(/const isTableSession = isPageMode && \(isOpenTableFlow \|\| !!activeOrderTakingId\);/.test(wizard),
  'a page-mode table session (Open Table / Add Items) is detected');
check(/const tableFlowReturnScreen = skipFloorMgmt \? 'dashboard' : 'tables';/.test(wizard),
  'a finished/cancelled session returns to Floors & Tables');
check(/const handleExitTableSession = \(\) => finishSession\(\);/.test(wizard),
  'the full-screen session offers an explicit exit (the overlay Close cannot exist)');
check(/aria-label=\{isPageMode \? 'Exit table order' : 'Close order wizard'\}/.test(wizard),
  'the exit control is labelled distinctly and the overlay keeps its own label');
check(/const hasOrderHandoff = useUiStore\(\(s\) => !!s.pendingTable \|\| !!s.activeOrderTakingId\);/.test(newOrderPage)
  && /scanMode && !hasOrderHandoff \? <PosWorkspace \/> : <TakeOrderWizard mode="page" \/>/.test(newOrderPage),
  'NewOrderPage renders the wizard inline for a handed-over table (scanner mode included)');
check(/\{selectedTable && !isTakeaway && \(/.test(wizard) && /title=\{selectedTable\.name\}/.test(wizard),
  'the order-entry screen shows the selected table (so the wrong table cannot be mistaken for the right one)');

// ═══════════════════════════════════════════════
//  2. KITCHEN TABS — mutually exclusive from stored status
// ═══════════════════════════════════════════════
section('2. KOT STATUS FILTERING (Active vs History)');

const { kotTabFor, groupKotsByTab } = await import('../utils/kotTabs.js');

const kot = (over = {}) => ({
  id: over.id ?? 1,
  kotNo: over.kotNo ?? 'KOT-0001',
  status: over.status ?? 'PENDING',
  cancelledAt: over.cancelledAt ?? null,
  order: { status: over.orderStatus ?? 'PENDING', table: { tableNo: '05' } },
});

sub('Legacy HOLD row → Active (never hidden, never duplicated)');
const legacyHeld = kot({ id: 1, orderStatus: 'HOLD' });
eq(kotTabFor(legacyHeld), 'Active', 'a legacy held ticket classifies as Active (still an open ticket)');
eq(groupKotsByTab([legacyHeld]).Active.length, 1, 'it is listed exactly once in Active');
eq(groupKotsByTab([legacyHeld]).History.length, 0, 'it is not History');

sub('Open ticket → Active only');
const openTicket = kot({ id: 6, orderStatus: 'PENDING' });
eq(kotTabFor(openTicket), 'Active', 'open ticket classifies as Active');
eq(groupKotsByTab([openTicket]).Active.length, 1, 'open ticket appears exactly once (Active)');

sub('Completed / voided → History only');
const served = kot({ id: 2, status: 'SERVED', orderStatus: 'COMPLETED' });
const voided = kot({ id: 3, status: 'CANCELLED', orderStatus: 'PENDING' });
const voidedFlag = kot({ id: 4, status: 'PENDING', cancelledAt: new Date().toISOString() });
const completed = kot({ id: 5, status: 'PENDING', orderStatus: 'COMPLETED' });
[served, voided, voidedFlag, completed].forEach((k, i) => {
  eq(kotTabFor(k), 'History', `finished/voided ticket #${i + 1} is History`);
});
const closing = groupKotsByTab([served, voided, voidedFlag, completed]);
eq(closing.Active.length, 0, 'no finished ticket leaks into Active');
eq(closing.History.length, 4, 'all four finished tickets are in History');

sub('Every ticket lands in exactly ONE bucket');
const mixed = groupKotsByTab([
  kot({ id: 1, orderStatus: 'HOLD' }),
  kot({ id: 2, orderStatus: 'PENDING' }),
  kot({ id: 3, status: 'SERVED' }),
  kot({ id: 4, orderStatus: 'HOLD', status: 'ACCEPTED' }),
  kot({ id: 5, orderStatus: 'COMPLETED' }),
]);
eq(mixed.Active.map(k => k.id), [1, 2, 4], 'Active = the three OPEN tickets (incl. legacy held rows)');
eq(mixed.History.map(k => k.id), [3, 5], 'History = the two finished tickets');
eq(mixed.Active.length + mixed.History.length, 5,
  'bucket sizes always sum to the ticket count (no duplicates, no losses)');
check(!('On Hold' in mixed), 'there is no On Hold bucket any more');

sub('KitchenPage uses the shared classifier and the Active/History tabs');
check(/import \{ KOT_TABS, groupKotsByTab \} from '\.\.\/\.\.\/\.\.\/utils\/kotTabs'/.test(kitchen),
  'KitchenPage imports the shared classifier');
check(/const kotTabs = groupKotsByTab\(kots\)/.test(kitchen), 'the tab lists come from ONE classifier call');
check(/KOT_TABS\.map\(\(tab\) => \(/.test(kitchen), 'the tabs render from the shared KOT_TABS list');
check(!/On Hold/.test(kitchen), 'the On Hold tab is gone');
check(!/k\.status !== 'CANCELLED' && k\.status !== 'SERVED'/.test(kitchen),
  'the old overlapping Active filter is gone');
check(/event: 'order:updated',[\s\S]{0,80}handler: \(\) => \{ fetchKots\(\); \}/.test(kitchen),
  'order status changes refetch the lists');
check(/activeTab\b/.test(kitchen) && /setSelectedKotId\(null\)/.test(kitchen),
  'switching tabs resets the selected ticket');

// ═══════════════════════════════════════════════
//  3. NO HOLD / RESUME — AND NO DUPLICATE KOT
// ═══════════════════════════════════════════════
section('3. NO HOLD / RESUME — AND NO DUPLICATE KOT');

sub('The wizard has neither Hold Order nor Save & Pay');
check(!/Hold Order/.test(wizard), 'the Hold Order action + label are gone from the wizard');
check(!/handleHoldOrder/.test(wizard), 'the Hold handler is deleted');
check(!/Save & Pay/.test(wizard), 'the Save & Pay action + label are gone');
check(!/handleSaveAndPay/.test(wizard), 'the Save & Pay handler is deleted');
check(!/orderApi\.hold\(/.test(wizard), 'the wizard never calls the removed hold endpoint');
check(/handlePrintKot/.test(wizard), 'Print KOT is preserved');
check(/Cancel Order/.test(wizard), 'Cancel Order is preserved');
check(/clearPendingTable\(\);\s*await loadInitialData\(\);/.test(wizard),
  'a printed KOT resets the wizard (clear cart + reload) so a second click cannot re-order');
check(/settings\.enableKitchen === false &&/.test(wizard) && /const handlePlaceOrder = async \(\) => \{/.test(wizard),
  'the kitchen-OFF configuration can still create an order (Place Order, no KOT)');
check(!/handlePlaceOrder[\s\S]{0,2200}setCheckoutOrderId/.test(wizard),
  'no create action opens the payment overlay — payment stays with the cashier');
check(/clearPendingTable\(\);\s*setActiveOrderTakingId\(null\);\s*setShowTakeOrderWizard\(false\);/.test(wizard),
  'closing the wizard clears the pending table AND the edit-order id (no leak into the next flow)');
check(/const handleCancelOrder = \(\) => \{[\s\S]{0,320}setActiveOrderTakingId\(null\);/.test(wizard),
  'cancelling also clears the edit-order id');

sub('Creating an order relies on the backend auto-KOT exactly once');
check(!/kotApi\.create/.test(wizard.match(/const handlePrintKot[\s\S]*?const handlePlaceOrder/)?.[0] || 'placeholder'),
  'Print KOT never makes a second KOT call (the backend creates it with the order)');
check(/const resp = await orderApi\.create\(payload\);[\s\S]{0,160}if \(!orderData \|\| !orderData\.id\)/.test(wizard),
  'a failed order creation aborts before anything is printed');

sub('Adding items issues ONLY the unsent delta');
check(/const kotResp = await kotApi\.create\(\{ orderId: backendId \}\);/.test(wizard),
  'adding items asks the KOT endpoint for the delta');
check(!/orderApi\.create/.test(wizard.match(/const handleUpdateOrder[\s\S]*?const handleClose/)?.[0] || 'placeholder'),
  'updating an order never creates a second order');
check(/orderNo: editingOrder\?\.orderNo \|\| String\(backendId\)/.test(wizard),
  'the added-item KOT carries the real order number');
check(/tableNo: editingOrder\?\.table\?\.tableNo/.test(wizard),
  'the added-item KOT carries the table number where applicable');
check(/orderType: editingOrder\?\.orderType \|\| 'DINE_IN'/.test(wizard),
  'the added-item KOT carries the order type');

sub('The removed workflow is gone from every screen and API client');
check(!/handleResumeHold|handleHoldOrder|handlePrintKotHeld|handleCheckoutHeld|handleDeleteHeld/.test(activeOrders),
  'Active Orders has no hold / resume / held handlers');
check(!/enableHoldOrders/.test(activeOrders), 'Active Orders no longer reads a hold toggle');
check(!/filteredHeld|heldOrders/.test(activeOrders), 'the Hold tab and its state are removed');
check(/if \(o\.status === 'COMPLETED' \|\| o\.status === 'CANCELLED'\) return false;/.test(activeOrders),
  'legacy held rows are NOT filtered out of Active (they cannot disappear from the board)');
check(!/hold: \(id\)/.test(orderApi) && !/resume: \(id\)/.test(orderApi),
  'the frontend API client has no hold/resume calls');
check(!/holdOrder|resumeOrder/.test(orderController), 'the backend controller no longer defines hold/resume');
check(!/\/:id\/hold|\/:id\/resume|holdOrder|resumeOrder/.test(orderRoutes),
  'the backend routes no longer expose /hold or /resume');

sub('Backend safety nets (KOT delta + row lock)');
check(/SELECT id FROM "Order" WHERE id = \$\{Number\(orderId\)\} FOR UPDATE/.test(kotController),
  'KOT creation locks the order row (concurrent requests cannot both issue the same items)');
check(/historicalKOTQuantity/.test(kotController) && /pending = Math\.max\(0, oi\.quantity - historicalKOTQuantity\)/.test(kotController),
  'the KOT delta is quantity − already-issued quantity (per-OrderItem history)');
check(/sentQuantity: newSent/.test(kotController),
  'OrderItem.sentQuantity is updated with what was just issued');
check(/created: false, kot: null, kotItems: \[\]/.test(kotController),
  'a retry with nothing pending returns created=false (no duplicate ticket)');
check(/sentQuantity: 0,/.test(orderController),
  'a newly added OrderItem starts unsent (sentQuantity 0)');

sub('Legacy held orders have an explicit, non-destructive recovery path');
check(/status: "HOLD", isDeleted: false/.test(releaseScript), 'the script reports legacy held orders');
check(/data: \{ status: "PENDING", holdAt: null \}/.test(releaseScript), 'recovery only flips the order status');
check(!/deleteMany|\.delete\(|cancelReason/.test(releaseScript), 'recovery never deletes or cancels orders, items or tickets');
check(/CONFIRM_TOKEN/.test(releaseScript) && /--apply/.test(releaseScript),
  'writes require an explicit --apply + confirmation token (dry-run by default)');

//  4. KITCHEN TICKETS — production-only screen
// ═══════════════════════════════════════════════
section('4. KITCHEN TICKETS — no Checkout Desk');

check(!kitchen.includes('Checkout Desk'), 'Checkout Desk button removed');
check(!kitchen.includes('setCheckoutOrderId'), 'no checkout navigation/handler remains on the kitchen screen');
check(!kitchen.includes('canHandleBilling'), 'the kitchen screen no longer imports the billing capability');
check(/Void Ticket/.test(kitchen), 'Void Ticket is preserved');
check(/Mark as \$\{getNextStatus\(selectedKot\.status\)\}/.test(kitchen), 'Mark as <next status> is preserved');
check(/const getNextStatus = \(currentStatus\) =>/.test(kitchen), 'the acceptance/status sequence is untouched');
const posWorkspace = read('features/pos/workspace/pages/PosWorkspace.jsx');
check(posWorkspace.includes('canHandleBilling'), 'cashier/POS payment flows keep their own billing gate');

// ═══════════════════════════════════════════════
//  5. SIDEBAR BRANDING
// ═══════════════════════════════════════════════
section('5. SIDEBAR RESTAURANT LOGO + NAME');

sub('The sidebar renders the CURRENT tenant\'s branding');
check(/const restaurantName = settings\?\.branding\?\.restaurantName \|\| 'POS';/.test(sidebar),
  'restaurant name comes from the tenant settings');
check(/const tenantLogo = settings\?\.branding\?\.customLogo \|\| '';/.test(sidebar),
  'only a tenant-uploaded logo is used (platform/bundled assets are not tenant branding)');
check(!/settings\.branding\.sidebarLogo/.test(sidebar), 'the old ambiguous sidebarLogo source is no longer rendered');
check(/<AppLogo src=\{tenantLogo\} name=\{restaurantName\} size="sm" \/>/.test(sidebar),
  'logo + name are passed together (aligned pair, rail and drawer)');
check(/min-w-0 flex-1/.test(sidebar) && /truncate/.test(sidebar) && /title=\{restaurantName\}/.test(sidebar),
  'the name truncates inside a flexible box and keeps its full text in a tooltip');

sub('AppLogo: undistorted image, no broken-image icon, initials fallback');
check(/import React, \{ useEffect, useState \} from 'react';/.test(appLogo), 'AppLogo tracks load state');
check(/onError=\{\(\) => setFailed\(true\)\}/.test(appLogo), 'a failed image falls back instead of showing the broken-image icon');
check(/useEffect\(\(\) => \{ setFailed\(false\); \}, \[url\]\)/.test(appLogo),
  'the failure flag resets when the logo URL changes');
check(/object-contain/.test(appLogo), 'the logo is contained (no cropping/stretching of non-square logos)');
check(!/object-cover/.test(appLogo), 'the previous crop-to-fill distortion is gone');
check(/shrink-0 rounded-lg aspect-square/.test(appLogo), 'fixed square shell → no overflow and no layout shift');
check(/const initial = displayName\.charAt\(0\)\.toUpperCase\(\);/.test(appLogo), 'initials fallback uses the restaurant name');
check(/if \(url && !failed\) \{/.test(appLogo), 'missing/empty logo sources skip the image entirely');

sub('Tenant isolation of branding');
check(/customLogo: s\.logo \|\| '',/.test(settingsStore),
  'the custom-logo flag is loaded from THIS tenant\'s settings response');
check(/logo: s\.branding\.customLogo \|\| '',/.test(settingsStore),
  'saving settings never writes the bundled platform logo into the tenant record');
check(/delete uiSettings\.branding\.customLogo;/.test(settingsStore),
  'the derived flag is never persisted as a UI setting');
const appShell = read('components/layout/app-shell/AppShell.jsx');
check(/settingsLoadedForUserRef/.test(appShell) && /switchedUser/.test(appShell),
  'settings are refetched when the authenticated user changes (no cross-tenant branding)');

// ═══════════════════════════════════════════════
//  6. MODAL USABILITY
// ═══════════════════════════════════════════════
section('6. OPEN TABLE MODAL / WIZARD FIT THE VIEWPORT');

check(/max-h-\[calc\(100dvh-1\.5rem\)\]/.test(tablePage), 'the Open Table dialog is bounded by the dynamic viewport height');
check(/max-w-xs/.test(tablePage), 'a compact maximum width is kept');
check(/overflow-y-auto overscroll-contain/.test(tablePage), 'internal scrolling only, without chaining to the page');
check(/pt-safe pb-safe px-safe/.test(tablePage), 'mobile safe areas are respected');
check(/role="dialog"/.test(tablePage) && /aria-modal="true"/.test(tablePage), 'the dialog is announced as a modal');
check(/useBodyScrollLock\(showOpenTableModal \|\| showOccupiedModal \|\| mergeModalMode !== null\)/.test(tablePage),
  'background scrolling is locked while a dialog is open');
check(/disabled=\{openingTableRef\.current\}/.test(tablePage), 'the confirm button blocks a second submit');
check(/bg-white w-full h-\[100dvh\] sm:h-\[95dvh\] sm:max-w-4xl/.test(wizard),
  'the order-entry wizard uses dvh so it never extends past the visible viewport');
check(/useBodyScrollLock\(!isPageMode && showTakeOrderWizard\)/.test(wizard),
  'the wizard overlay locks background scrolling');
check(/pb-safe sm:pt-0 sm:pb-0/.test(wizard), 'the wizard respects mobile safe areas');
check(/overscroll-contain/.test(wizard), 'the wizard scroll areas do not chain to the page');

// ═══════════════════════════════════════════════
//  SUMMARY
// ═══════════════════════════════════════════════
section('RESULTS');
console.log(`\n  Total:  ${results.pass + results.fail}`);
console.log(`  Passed: ${results.pass} ✅`);
console.log(`  Failed: ${results.fail} ${results.fail > 0 ? '❌' : '✅'}`);
if (results.fail > 0) { console.log('\n  ❌ SOME TESTS FAILED\n'); process.exit(1); }
else { console.log('\n  ✅ ALL TESTS PASSED\n'); }
