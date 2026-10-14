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
const orderController = readFileSync(path.join(SRC, '../../backend/src/controllers/order.controller.js'), 'utf8');
const kotController = readFileSync(path.join(SRC, '../../backend/src/controllers/kot.controller.js'), 'utf8');

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

sub('Open Table opens a NEW order and goes straight to the menu');
check(/setActiveOrderTakingId\(null\); \/\/ hard reset/.test(tablePage),
  'the stale edit-order id is cleared before opening (never edits an old order)');
check(/setShowTakeOrderWizard\(true\)/.test(tablePage), 'the order-entry wizard is opened');
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
check(/\{selectedTable && !isTakeaway && \(/.test(wizard) && /title=\{selectedTable\.name\}/.test(wizard),
  'the order-entry screen shows the selected table (so the wrong table cannot be mistaken for the right one)');

// ═══════════════════════════════════════════════
//  2. KITCHEN TABS — mutually exclusive from stored status
// ═══════════════════════════════════════════════
section('2. KOT STATUS FILTERING (Active vs On Hold vs History)');

const { kotTabFor, groupKotsByTab } = await import('../utils/kotTabs.js');

const kot = (over = {}) => ({
  id: over.id ?? 1,
  kotNo: over.kotNo ?? 'KOT-0001',
  status: over.status ?? 'PENDING',
  cancelledAt: over.cancelledAt ?? null,
  order: { status: over.orderStatus ?? 'PENDING', table: { tableNo: '05' } },
});

sub('Hold → only On Hold');
const held = kot({ id: 1, orderStatus: 'HOLD' });
eq(kotTabFor(held), 'On Hold', 'held ticket classifies as On Hold');
eq(groupKotsByTab([held]).Active.length, 0, 'held ticket is NOT in Active');
eq(groupKotsByTab([held])['On Hold'].length, 1, 'held ticket appears exactly once (On Hold)');
eq(groupKotsByTab([held]).History.length, 0, 'held ticket is not History');

sub('Resume → only Active');
const resumed = kot({ id: 1, orderStatus: 'PENDING' });
eq(kotTabFor(resumed), 'Active', 'resumed ticket classifies as Active');
eq(groupKotsByTab([resumed])['On Hold'].length, 0, 'resumed ticket disappears from On Hold');
eq(groupKotsByTab([resumed]).Active.length, 1, 'resumed ticket appears exactly once (Active)');

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
eq(closing['On Hold'].length, 0, 'no finished ticket leaks into On Hold');
eq(closing.History.length, 4, 'all four finished tickets are in History');

sub('Every ticket lands in exactly ONE bucket');
const mixed = groupKotsByTab([
  kot({ id: 1, orderStatus: 'HOLD' }),
  kot({ id: 2, orderStatus: 'PENDING' }),
  kot({ id: 3, status: 'SERVED' }),
  kot({ id: 4, orderStatus: 'HOLD', status: 'ACCEPTED' }),
  kot({ id: 5, orderStatus: 'COMPLETED' }),
]);
eq(mixed.Active.map(k => k.id), [2], 'Active = the single open ticket');
eq(mixed['On Hold'].map(k => k.id), [1, 4], 'On Hold = the two held tickets');
eq(mixed.History.map(k => k.id), [3, 5], 'History = the two finished tickets');
eq(mixed.Active.length + mixed['On Hold'].length + mixed.History.length, 5,
  'bucket sizes always sum to the ticket count (no duplicates, no losses)');

sub('KitchenPage uses the shared classifier and refreshes on hold/resume');
check(/import \{ groupKotsByTab \} from '\.\.\/\.\.\/\.\.\/utils\/kotTabs'/.test(kitchen),
  'KitchenPage imports the shared classifier');
check(/const kotTabs = groupKotsByTab\(kots\);/.test(kitchen), 'the three lists come from ONE classifier call');
check(/const activeKots = kotTabs\.Active;/.test(kitchen), 'Active list is the Active bucket');
check(!/k\.status !== 'CANCELLED' && k\.status !== 'SERVED'/.test(kitchen),
  'the old overlapping Active filter is gone');
check(/event: 'order:updated',[\s\S]{0,80}handler: \(\) => \{ fetchKots\(\); \}/.test(kitchen),
  'hold / resume (order:updated) refetches the lists');
check(/activeTab\b/.test(kitchen) && /setSelectedKotId\(null\)/.test(kitchen),
  'switching tabs resets the selected ticket');

// ═══════════════════════════════════════════════
//  3. DUPLICATE KOT PREVENTION
// ═══════════════════════════════════════════════
section('3. NO DUPLICATE KOT (resume / retries)');

sub('Resuming can never create a second order or KOT');
check(/if \(activeOrderTakingId \|\| isEditing\) \{[\s\S]{0,220}use Update Order to add items/.test(wizard),
  'Save & Pay refuses to run for an existing order (would create a 2nd order + KOT)');
check(/!isEditing && settings\.enableBilling !== false && canBill &&/.test(wizard),
  'the Save & Pay button is hidden while editing/resuming');
check(/clearPendingTable\(\);\s*setActiveOrderTakingId\(null\);\s*setShowTakeOrderWizard\(false\);/.test(wizard),
  'closing the wizard clears the pending table AND the edit-order id (no leak into the next flow)');
check(/const handleCancelOrder = \(\) => \{[\s\S]{0,320}setActiveOrderTakingId\(null\);/.test(wizard),
  'cancelling also clears the edit-order id');

sub('The resume action itself is a status change only');
check(/await orderApi\.resume\(backendId\);/.test(activeOrders), 'resume calls the resume endpoint');
check(!/handleResumeHold[\s\S]{0,900}kotApi\.create/.test(activeOrders),
  'resuming never calls the KOT creation endpoint');
check(!/handleResumeHold[\s\S]{0,900}orderApi\.create/.test(activeOrders),
  'resuming never creates a new order');
check(/if \(resumeBusyRef\.current\) return;/.test(activeOrders), 'repeat resume taps are ignored');
check(/if \(holdBusyRef\.current\) return;/.test(activeOrders), 'repeat hold taps are ignored');
check(/setActiveOrderTakingId\(`ord-\$\{backendId\}`\);/.test(activeOrders),
  'resume re-opens the ORIGINAL order id (no new order)');

sub('Backend safety nets');
check(/const resumeOrder = async \(req, res\) => \{[\s\S]*?Resuming NEVER creates a KOT/.test(orderController),
  'resumeOrder documents + keeps the no-KOT invariant');
check(/status === \"HOLD\"/.test(orderController) && /Only held orders can be resumed/.test(orderController),
  'a repeated resume is rejected without side effects');
check(/SELECT id FROM "Order" WHERE id = \$\{Number\(orderId\)\} FOR UPDATE/.test(kotController),
  'KOT creation locks the order row (concurrent requests cannot both issue the same items)');
check(/historicalKOTQuantity/.test(kotController) && /pending = Math\.max\(0, oi\.quantity - historicalKOTQuantity\)/.test(kotController),
  'the KOT delta is quantity − already-issued quantity (per-OrderItem history)');
check(/created: false, kot: null, kotItems: \[\]/.test(kotController),
  'a retry with nothing pending returns created=false (no duplicate ticket)');
check(!/kotApi\.create/.test(wizard.match(/handlePrintKot[\s\S]*?handleSaveAndPay/)?.[0] || 'placeholder'),
  'order creation relies on the backend auto-KOT (no second KOT call)');

// ═══════════════════════════════════════════════
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
