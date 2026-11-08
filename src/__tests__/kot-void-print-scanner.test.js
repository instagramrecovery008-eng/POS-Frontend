/**
 * KOT VOID · KITCHEN PRINTING · BARCODE SCANNER — Frontend Test Suite
 * Standalone — run with: node src/__tests__/kot-void-print-scanner.test.js
 *
 * Follows the repo's standalone pattern (src/__tests__/run.js): pure helpers
 * are exercised with real inputs, and the feature files are checked for the
 * source invariants that implement each documented requirement.
 *
 *  1. VOID MODAL — opens, reasons, "Other" explanation, cancel, no double submit
 *  2. VOID API CONTRACT — structured reason + code, refresh, success/error
 *  3. ACTIVE ORDERS — voided lines drop out, partial lines keep their remainder
 *  4. KITCHEN PRINTING — one dispatch path, printer config warning, retry,
 *     duplicate suppression
 *  5. KOT INDEPENDENCE — the Kitchen screen toggle never gates KOT creation,
 *     printing or retry; printer status panel; Socket.IO-offline order flow
 *  6. BARCODE SCANNER — business-type visibility, wedge capture rules,
 *     unknown/disabled handling
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

const voidModal = read('features/kitchen/components/VoidKotModal.jsx');
const kitchen = read('features/kitchen/pages/KitchenPage.jsx');
const activeOrders = read('features/orders/pages/ActiveOrdersPage.jsx');
const kotApi = read('api/kot.api.js');
const printService = read('services/kotPrintService.js');
const settingsStore = read('store/settingsStore.js');
const settingsPage = read('features/settings/pages/SettingsPage.jsx');
const posWorkspace = read('features/pos/workspace/pages/PosWorkspace.jsx');
const wizard = read('features/pos/workspace/components/TakeOrderWizard.jsx');
const backendKotRoutes = readFileSync(path.join(SRC, '../../backend/src/routes/kot.routes.js'), 'utf8');

// ═══════════════════════════════════════════════
//  1. VOID MODAL
// ═══════════════════════════════════════════════
section('1. VOID TICKET MODAL');

sub('Void Ticket opens a confirmation dialog — it never voids on click');
check(/onClick=\{handleVoidKotOpen\}/.test(kitchen), 'the Void Ticket button only OPENS the modal');
check(!/onClick=\{\(\) => handleVoidKot\(/.test(kitchen), 'no direct void call is bound to the button');
check(/<VoidKotModal/.test(kitchen), 'the modal component is rendered');
check(/isOpen=\{showVoidModal\}/.test(kitchen), 'the modal visibility is explicit state');
check(/kot=\{showVoidModal \? selectedKot : null\}/.test(kitchen),
  'the modal only ever receives the SELECTED ticket (never a stale one)');

sub('The dialog shows the KOT number, the order number and the items');
check(/void-kot-title/.test(voidModal), 'the dialog has an accessible title');
check(/Ticket \{?/.test(voidModal) && /\{kot\.kotNo\}/.test(voidModal), 'the KOT number is shown');
check(/#\{order\.orderNo \|\| order\.id/.test(voidModal), 'the related order number is shown');
check(/kot\.kotItems \|\| \[\]/.test(voidModal), 'the ticket\u2019s OWN items are listed');
check(/Items to be voided/.test(voidModal), 'the items are labelled as the ones being voided');

sub('The reason is REQUIRED and picked from the shared preset list');
check(/VOID_REASONS/.test(voidModal), 'a preset reason list exists');
for (const label of ['Order cancelled', 'Wrong item entered', 'Duplicate ticket', 'Customer changed order', 'Other']) {
  check(voidModal.includes(`'${label}'`), `preset reason present: ${label}`);
}
check(/Select a void reason to continue\./.test(voidModal), 'an empty reason is blocked with a message');
check(/const canSubmit = !!reasonCode && detailValid && !isSubmitting;/.test(voidModal),
  'Confirm is disabled until a reason is chosen');

sub('"Other" additionally requires a written explanation');
check(/needsDetail = reasonCode === 'OTHER'/.test(voidModal), '"Other" switches on the explanation field');
check(/id="void-reason-detail"/.test(voidModal), 'the explanation field is labelled + associated');
check(/reasonDetail\.trim\(\)\.length >= MIN_DETAIL/.test(voidModal), 'the explanation has a minimum length');
check(/Add at least \$\{MIN_DETAIL\} characters explaining the reason\./.test(voidModal),
  'a too-short explanation is blocked with a message');

sub('Cancel leaves the ticket untouched');
check(/onClose=\{handleVoidModalClose\}/.test(kitchen), 'the modal is wired to a close handler');
check(/if \(voidSubmitting\) return; \/\/ never discard an in-flight void/.test(kitchen),
  'an in-flight void cannot be discarded by closing');
check(/if \(!isSubmitting\) onClose\(\)/.test(voidModal), 'Escape/backdrop close is blocked only while submitting');
check(/role="dialog"/.test(voidModal) && /aria-modal="true"/.test(voidModal), 'the dialog is announced as modal');
check(/handleKeyDown/.test(voidModal) && /Escape/.test(voidModal), 'Escape closes the dialog');

sub('No duplicate submission + a visible loading state');
check(/const \[voidSubmitting, setVoidSubmitting\] = useState\(false\)/.test(kitchen), 'a submitting flag exists');
check(/if \(voidSubmitting \|\| !selectedKot\) return;/.test(kitchen), 'a second confirm is refused while submitting');
check(/isSubmitting \? <Loader2/.test(voidModal), 'the confirm button shows a spinner while submitting');
check(/disabled=\{\!canSubmit\}/.test(voidModal) && /isSubmitting/.test(voidModal),
  'the confirm button is disabled while submitting');

sub('Voided tickets can no longer be voided again from the UI');
check(/disabled=\{\!\!busyAction \|\| selectedKot\.cancelledAt \|\| selectedKot\.status === 'CANCELLED'\}/.test(kitchen),
  'the Void button is disabled for an already-voided ticket');

// ═══════════════════════════════════════════════
//  2. VOID API CONTRACT
// ═══════════════════════════════════════════════
section('2. VOID API CONTRACT');

sub('The structured reason + code are sent together');
check(/cancel: \(id, reason, extra = \{\}\) =>/.test(kotApi), 'the API client accepts structured extras');
check(/apiClient\.patch\(`\/kot\/\$\{id\}\/cancel`, \{ reason, \.\.\.extra \}\)/.test(kotApi),
  'reason + reasonCode + reasonDetail travel in one payload');
check(/voidReasonPayload/.test(voidModal), 'the modal composes the payload');
check(/const reason = reasonCode === 'OTHER' \? `Other: \$\{detail\}` : label;/.test(voidModal),
  'the stored reason stays human-readable');

sub('Success and failure are both surfaced to the user');
check(/addToast\(\s*`KOT \$\{selectedKot\.kotNo\} voided/.test(kitchen), 'a success toast names the ticket');
check(/const msg = err\?\.message \|\| 'Failed to void KOT';/.test(kitchen), 'a failure message is derived');
check(/addToast\(msg, 'error'\)/.test(kitchen), 'the failure is shown as an error toast');

sub('Kitchen Tickets, Active Orders and order details all refresh after a void');
check(/await fetchKots\(\);/.test(kitchen), 'the kitchen list is refetched');
check(/emitOrderEvent\(req\.user\.restaurantId, "updated"/.test(readFileSync(path.join(SRC, '../../backend/src/controllers/kot.controller.js'), 'utf8')),
  'the backend emits order:updated so Active Orders refetches too');
check(/voidKotItemsFor/.test(readFileSync(path.join(SRC, '../../backend/src/controllers/kot.controller.js'), 'utf8')),
  'the backend rewrites the item bookkeeping in the same transaction');

// ═══════════════════════════════════════════════
//  3. ACTIVE ORDERS — voided items are not active work
// ═══════════════════════════════════════════════
section('3. ACTIVE ORDERS FILTERING');

const orderItemsUtil = await import('../utils/orderItems.js');
const line = (quantity, voidedQuantity = 0) => ({ id: 1, quantity, voidedQuantity });

sub('activeQuantity = quantity − voidedQuantity');
eq(orderItemsUtil.activeQuantity(line(3, 0)), 3, 'untouched line → all units active');
eq(orderItemsUtil.activeQuantity(line(3, 2)), 1, 'partially voided line → the remainder stays active');
eq(orderItemsUtil.activeQuantity(line(3, 3)), 0, 'fully voided line → nothing active');
eq(orderItemsUtil.activeQuantity(line(3, 9)), 0, 'over-voided (legacy/corrupt) clamps at 0');
eq(orderItemsUtil.activeQuantity(null), 0, 'null line → 0 (never throws)');
eq(orderItemsUtil.activeQuantity({ quantity: null }), 0, 'null quantity → 0 (never throws)');

sub('Fully voided lines drop out; partially voided lines are KEPT');
eq(orderItemsUtil.isFullyVoided(line(2, 2)), true, 'all units voided → fully voided');
eq(orderItemsUtil.isFullyVoided(line(2, 1)), false, 'a remainder means NOT fully voided');
eq(orderItemsUtil.isPartiallyVoided(line(2, 1)), true, 'a remainder is a partial void');
eq(orderItemsUtil.isPartiallyVoided(line(2, 2)), false, 'a full void is not a partial void');
eq(orderItemsUtil.activeOrderItems([line(2, 2), line(3, 1), line(1, 0)]).length, 2,
  'the active list keeps the two lines with remaining units');

sub('Counts use the ACTIVE remainder, not the ordered quantity');
eq(orderItemsUtil.activeItemCount([line(2, 2), line(3, 1), line(1, 0)]), 3,
  'a fully voided line counts 0, the partial line counts its remainder (2), the intact line counts 1');

sub('A fully voided ORDER leaves the Active board, a partial one stays');
eq(orderItemsUtil.isFullyVoidedOrder({ orderItems: [line(2, 2), line(1, 1)] }), true,
  'every line voided → the order is not active work');
eq(orderItemsUtil.isFullyVoidedOrder({ orderItems: [line(2, 2), line(1, 0)] }), false,
  'one valid line remaining → the order stays active');
eq(orderItemsUtil.isFullyVoidedOrder({ orderItems: [] }), false,
  'an order with no lines is never judged fully voided');

sub('The page uses these helpers (never local ad-hoc sums)');
check(/from '\.\.\/\.\.\/\.\.\/utils\/orderItems'/.test(activeOrders), 'ActiveOrdersPage imports the shared helpers');
check(/const getItemCount = \(order\) => activeItemCount\(order\?\.orderItems \|\| \[\]\);/.test(activeOrders),
  'the card count comes from the ACTIVE remainder');
check(/if \(isFullyVoidedOrder\(o\)\) return false;/.test(activeOrders),
  'a fully voided order leaves the Active tab');
check(/voidedLineCount\(previewOrder\.orderItems\)/.test(activeOrders),
  'the preview explains that voided lines are history');
check(/Voided/.test(activeOrders) && /line-through/.test(activeOrders),
  'the preview marks voided lines explicitly');

sub('Legitimate unpaid / in-preparation work is NEVER removed');
check(/if \(o\.status === 'COMPLETED' \|\| o\.status === 'CANCELLED'\) return false;/.test(activeOrders),
  'only terminal orders leave the Active tab by status');
check(!/deleteMany|filter\(o => o\.bill/.test(activeOrders),
  'nothing is deleted or hidden because of a bill/payment');

// ═══════════════════════════════════════════════
//  4. KITCHEN PRINTING
// ═══════════════════════════════════════════════
section('4. KITCHEN PRINTING');

sub('There is ONE dispatch path, and it records the job');
check(/export async function dispatchKotPrint/.test(printService), 'the dispatch service exists');
check(/renderKotInWindow\(win, printData\)/.test(printService), 'it renders into the EXISTING browser print window');
check(/from '\.\/printService'/.test(printService), 'the mechanism is the shared print service (no second printer stack)');
check(/reportPrintResult/.test(printService), 'it reports the outcome back to the API');
check(/status: 'dispatched'/.test(printService), 'a successful dispatch is reported as dispatched');
check(/status: 'failed'/.test(printService), 'a failed dispatch is reported as failed');
check(!/navigator\.|getUserMedia|jsPDF|escpos/i.test(printService), 'no second printing mechanism is introduced');

sub('No printer configured → visible warning, and printing STILL happens');
// REGRESSION: a missing printer row used to abort the dispatch entirely, so a
// tenant with "KOT printing enabled" printed nothing at all. The browser print
// dialog IS the mechanism — it must still open, with a visible warning.
check(/const noConfiguredPrinter = printerConfigured === false;/.test(printService),
  'the service checks the printer configuration');
check(/needsConfiguration: noConfiguredPrinter/.test(printService),
  'a missing printer is a distinct, surfaced state');
check(/dispatched: true, duplicate, needsConfiguration: noConfiguredPrinter/.test(printService),
  'the ticket is still dispatched to the system printer');
check(/return \{ dispatched: false, needsConfiguration: noConfiguredPrinter/.test(printService),
  'a real dispatch failure is still reported as failed');
check(/POS Settings → Printer Configuration/.test(printService), 'the message names where to configure it');
check(/configurationWarning/.test(printService), 'the caller can show the warning after a successful print');
check(/addToast\(`KOT \$\{kotNo \|\| ''\} sent to the system printer/.test(wizard),
  'the wizard reports the warning without hiding that the ticket was sent');
check(/<KotPrinterStatus/.test(kitchen),
  'Kitchen Tickets renders the compact printer status panel (no oversized banner)');
check(!/No printer is configured\. Kitchen tickets print through the system print dialog/.test(kitchen),
  'the old oversized warning banner text is gone');
check(/setScreen\('settings'\)/.test(activeOrders), 'Active Orders routes the user to POS Settings');
check(/setScreen\('settings'\)/.test(kitchen), 'Kitchen Tickets routes the user to POS Settings');
check(/printerConfigured: resp\.printerConfigured !== false/.test(settingsStore),
  'the setting comes from the server response (never assumed)');

sub('A popup-blocked print is a FAILURE, never a silent success');
check(/browser blocked the print window/.test(printService), 'the popup-blocked case has its own message');
check(/print window was closed before the ticket was ready/.test(printService),
  'a closed pre-opened window has its own message (never a fake success)');

sub('REGRESSION: the print window is opened inside the click gesture, not after an await');
// window.open() after `await orderApi.create(...)` is blocked by the browser, so
// the KOT never printed even though the job said it would.
const printSvc = read('services/printService.js');
check(/export function openKotPrintWindow\(\)/.test(printSvc), 'a synchronous window opener exists');
check(/export function renderKotInWindow\(printWindow, kotData\)/.test(printSvc),
  'the KOT is rendered into an ALREADY-OPEN window');
check(/export function closeKotPrintWindow\(printWindow\)/.test(printSvc),
  'an unused window can be closed (no blank popup left behind)');
check(/const printWindow = openKotPrintWindow\(\);\n  if \(!printWindow\)/.test(printSvc),
  'the single-shot preview builds on the same two helpers');

const wizardOpen = wizard.indexOf('openKotPrintWindow()');
const wizardAwait = wizard.indexOf('await orderApi.create(payload)');
check(wizardOpen > -1 && wizardAwait > -1 && wizardOpen < wizardAwait,
  'the wizard opens the window BEFORE the order request (valid user gesture)');
check(/printWindow: kotPrintWindow/.test(wizard), 'the wizard hands that window to the dispatcher');
check(/closeKotPrintWindow\(kotPrintWindow\)/.test(wizard),
  'a failed/unused order closes the pre-opened window');
const wizardUpdateOpen = wizard.indexOf('openKotPrintWindow()', wizardOpen + 1);
const wizardUpdateAwait = wizard.indexOf('await orderApi.addItem(');
check(wizardUpdateOpen > -1 && wizardUpdateOpen < wizardUpdateAwait,
  'the ADD-ITEM (incremental KOT) path opens the window before its first await too');
check((wizard.match(/printWindow: kotPrintWindow/g) || []).length >= 2,
  'both first-print and incremental-print dispatches pass the window');

const posOpen = posWorkspace.indexOf('openKotPrintWindow()');
const posAwait = posWorkspace.indexOf('await orderApi.create(');
check(posOpen > -1 && posOpen < posAwait, 'the counter workspace opens the window before creating the order');
check(/printCounterKot\(order, itemsPayload, kotPrintWindow\)/.test(posWorkspace),
  'and passes it to the counter KOT print');
check(/const kotCapable = \(settings\?\.capabilities \|\| \{\}\)\.kot === true;/.test(posWorkspace),
  'window preparation follows the KOT CAPABILITY, not the Kitchen screen toggle');
check(/isBasicPosProduction \|\| isBasicPos \|\| kotCapable/.test(posWorkspace),
  'a window is prepared for EVERY KOT-capable tenant (not just BASIC_POS)');
check(/const autoKot = \(order\.kot \|\| \[\]\)\[0\] \|\| null;/.test(posWorkspace),
  'the dispatch is driven by the KOT the backend actually created');
check(/if \(autoKot\?\.kotNo\) await printCounterKot\(order, itemsPayload, kotPrintWindow\);/.test(posWorkspace),
  'restaurant takeaway/delivery placed here prints its ticket too');
check(/if \(!autoKot\?\.kotNo\) closeKotPrintWindow\(kotPrintWindow\);/.test(posWorkspace),
  'a retail order (no KOT) closes the prepared window');

const aoOpen = activeOrders.indexOf('openKotPrintWindow()');
const aoAwait = activeOrders.indexOf('await kotApi.create(');
check(aoOpen > -1 && aoOpen < aoAwait,
  'Active Orders opens the window before the delta-KOT request (Print KOT works there)');
check(/printWindow: kotPrintWindow/.test(activeOrders), 'and hands it to the dispatcher');

sub('Nothing depends on the Kitchen Tickets screen being open');
check(/dispatchKotPrint\(/.test(wizard) && /await orderApi\.create/.test(wizard),
  'the print is dispatched from the order-placement flow itself');
check(!/openKotPrintPreview\(/.test(wizard), 'the wizard does not rely on a screen-level preview helper');

sub('The ticket template carries every required field');
const kotTemplate = read('services/printService.js');
for (const field of ['kotNo', 'orderNo', 'tableNo', 'orderType', 'formattedTime']) {
  check(new RegExp(`\\b${field}\\b`).test(kotTemplate), `the KOT template uses ${field}`);
}
check(/item\.quantity \|\| item\.qty \|\| 1/.test(kotTemplate), 'each line prints its quantity');
check(/item\.notes/.test(kotTemplate), 'item modifiers/notes are printed');
check(/Items to prepare|qty/i.test(kotTemplate), 'the item table is rendered');

sub('The rendered ticket actually contains the ticket data');
const { generateKotHtml } = await import('../services/printService.js');
const renderedAt = new Date('2026-10-22T19:45:00+05:30');
const ticketHtml = generateKotHtml({
  restaurantName: 'Spice Garden',
  kotNo: 'KOT-0042',
  orderNo: 'ORD-0099',
  tableNo: 'T-12',
  orderType: 'DINE_IN',
  guestCount: 3,
  waiterName: 'Asha',
  items: [
    { name: 'Paneer Tikka', quantity: 2, notes: 'No onion' },
    { name: 'Masala Chai', quantity: 3 },
  ],
  date: renderedAt,
});
check(ticketHtml.includes('KOT-0042'), 'the KOT number is on the ticket');
check(ticketHtml.includes('ORD-0099'), 'the order number is on the ticket');
check(ticketHtml.includes('T-12'), 'the table is on the ticket');
check(/DINE IN|DINE_IN/.test(ticketHtml), 'the order type is on the ticket');
check(ticketHtml.includes('Paneer Tikka') && ticketHtml.includes('Masala Chai'), 'every item name is on the ticket');
check(/2x[\s\S]{0,80}Paneer Tikka/.test(ticketHtml), 'first item prints with its quantity');
check(/3x[\s\S]{0,80}Masala Chai/.test(ticketHtml), 'second item prints with its quantity');
check(ticketHtml.includes('No onion'), 'item modifiers/notes are on the ticket');
check(ticketHtml.includes('KOT No:'), 'the KOT number is labelled');
check(ticketHtml.includes('Order No:'), 'the order number is labelled');
check(/\d{2}:\d{2}/.test(ticketHtml), 'a timestamp is printed');

sub('Failed prints stay visible and retryable');
check(/printJobStatus/.test(kitchen), 'Kitchen Tickets renders the print job state');
check(/Print failed/.test(kitchen), 'a failed job is labelled');
check(/Retry print/.test(kitchen), 'a retry action is offered');
check(/manual: true/.test(kitchen), 'the retry is a MANUAL dispatch');
check(/reportPrintResult/.test(kotApi), 'the API client exposes the print-result endpoint');

sub('Duplicate dispatches are suppressed (client + server)');
check(/const inFlight = new Set\(\)/.test(printService), 'an in-flight set exists');
check(/isKotPrintInFlight/.test(printService), 'the guard is exposed for callers');
check(/duplicate: true/.test(printService), 'a server-reported duplicate is recognised');
check(/manual = false/.test(printService), 'the default dispatch is AUTOMATIC (idempotent)');
check(/!manual && \(kot\.printJobStatus === "DISPATCHED"/.test(readFileSync(path.join(SRC, '../../backend/src/controllers/kot.controller.js'), 'utf8')),
  'the backend refuses to re-dispatch an already-terminal automatic job');

sub('A voided ticket can never be printed');
check(/was voided and cannot be printed/.test(printService), 'the service refuses a voided ticket');
check(/Cannot print a voided KOT/.test(readFileSync(path.join(SRC, '../../backend/src/controllers/kot.controller.js'), 'utf8')),
  'the backend enforces it too');

sub('Every POS flow prints through the shared dispatch');
check(/dispatchKotPrint\(/.test(wizard), 'the order wizard uses the dispatch service');
check(/dispatchKotPrint\(/.test(posWorkspace), 'the counter/BASIC_POS workspace uses it');
check(/dispatchKotPrint\(/.test(activeOrders), 'Active Orders uses it');
check(/dispatchKotPrint\(/.test(kitchen), 'Kitchen Tickets reprint uses it');
check(!/openKotPrintPreview\(/.test(wizard) && !/openKotPrintPreview\(/.test(posWorkspace)
  && !/openKotPrintPreview\(/.test(activeOrders) && !/openKotPrintPreview\(/.test(kitchen),
  'no screen opens a print window directly any more (single path)');

sub('The backend creates the print job from the CANONICAL business type');
const backendOrderController = readFileSync(path.join(SRC, '../../backend/src/controllers/order.controller.js'), 'utf8');
check(/printJobStatusOnCreate\(kotPrintJobEnabled\)/.test(backendOrderController),
  'the auto-KOT stores the print job state at creation');
check(/tenantKotPrintingEnabled\(prisma, req\.user\.restaurantId\)/.test(backendOrderController),
  'the decision is made server-side, never from the request');
const backendKotPrint = readFileSync(path.join(SRC, '../../backend/src/utils/kotPrint.js'), 'utf8');
check(/getBusinessCapabilities\(businessType\)\.kot === true/.test(backendKotPrint),
  'the kot capability decides (a stale autoPrintKOT=false row cannot suppress a kitchen vertical)');
check(/platformPrisma\.restaurant\.findUnique/.test(backendKotPrint) && /businessType: true/.test(backendKotPrint),
  'the business type comes from the platform Restaurant row');
check(/findFirst\(\{[\s\S]{0,120}autoPrintKOT/.test(backendKotPrint),
  'the tenant row is only the fallback when the type is unknown');

// ═══════════════════════════════════════════════
//  5. KOT PRINTING vs KITCHEN SCREEN VISIBILITY
// ═══════════════════════════════════════════════
section('5. KOT PRINTING IS INDEPENDENT OF THE KITCHEN SCREEN');

sub('The Kitchen screen toggle only hides the screen — it never gates KOTs');
const printerPanel = read('features/kitchen/components/KotPrinterStatus.jsx');
const uiStore = read('store/uiStore.js');
const socketSvc = read('services/socket.js');
check(/const wizardCaps = settings\?\.capabilities \|\| getBusinessCapabilities\(settings\?\.businessType\);/.test(wizard)
  && /const kotCapable = wizardCaps\.kot === true;/.test(wizard),
  'the wizard resolves the KOT workflow from the KOT CAPABILITY (business-type fallback)');
check(!/enableKitchen/.test(wizard), 'the wizard never reads the Kitchen screen toggle');
check(!/enableKitchen/.test(activeOrders), 'Active Orders never reads the Kitchen screen toggle');
check(!/enableKitchen/.test(posWorkspace), 'the POS workspace never reads the Kitchen screen toggle');
check(/\{kotCapable && \(/.test(wizard), 'Print KOT stays available for every KOT business');
check(/if \(cart\.length > 0 && kotCapable\)/.test(wizard),
  'ADD ITEM still issues a delta KOT for a KOT business');

sub('Kitchen DISABLED + printing enabled → the order still creates and prints its KOT');
check(/const autoKot = orderData\.kot\?\.\[0\] \|\| null;/.test(wizard),
  'the dispatched ticket is the KOT the backend actually created');
check(/printWindow: kotPrintWindow/.test(wizard), 'the print job is dispatched with the ticket');
const backendOrderCtl = readFileSync(path.join(SRC, '../../backend/src/controllers/order.controller.js'), 'utf8');
check(/orderType !== "COUNTER_SALE" && autoKotOrderType/.test(backendOrderCtl),
  'the backend auto-creates the KOT from the order type, never the kitchen toggle');
check(!/enableKitchen/.test(backendOrderCtl), 'no order/KOT path consults RestaurantSetting.enableKitchen');

sub('Print status + Retry Print are reachable while the Kitchen screen is hidden');
check(/kotApi\.reprintByOrder\(order\.id\)/.test(activeOrders),
  'Active Orders retries the EXISTING ticket');
check(!/kotApi\.create/.test(
  (activeOrders.match(/const handleRetryKotPrint[\s\S]*?const handlePrintBill/) || [''])[0]),
  'retry never creates a duplicate KOT');
check(/Retry print/.test(activeOrders), 'Active Orders offers a Retry print action');
check(/\['FAILED', 'PENDING'\]\.includes\(order\.kot\[0\]\.printJobStatus\)/.test(activeOrders),
  'the retry panel appears only for a genuinely unprinted/failed job');
check(/printError/.test(activeOrders), 'the real failure message is shown');
check(!/>\s*No KOT\s*</.test(activeOrders),
  'a valid ticket is never labelled "No KOT"');
check(!/>\s*No KOT\s*</.test(wizard),
  'the order review screen no longer offers a "No KOT" action');

sub('Compact printer status panel — three statuses, honest printing, responsive');
const { resolvePrinterStatus, findKitchenPrinter } = await import('../utils/kotPrinterStatus.js');
const stFallback = resolvePrinterStatus({ printers: [], printerConfigured: false });
eq(stFallback.label, 'System print dialog', 'no printer → "System print dialog"');
check(/fallback/.test(stFallback.detail), 'explains the dialog is the fallback path');
check(/No dedicated kitchen printer/.test(stFallback.detail), 'never implies a physical printer exists');
const stConfigured = resolvePrinterStatus({
  printers: [{ id: 'p1', name: 'Kitchen A', type: 'Kitchen' }], printerConfigured: true,
});
eq(stConfigured.label, 'Printer configured', 'a kitchen printer → "Printer configured"');
check(/Kitchen A/.test(stConfigured.detail), 'names the registered printer');
check(/system print dialog/.test(stConfigured.detail), 'still states the real browser mechanism');
eq(findKitchenPrinter([{ name: 'KOT 1', type: 'KOT' }])?.name, 'KOT 1', 'KOT-type printers count as kitchen printers');
eq(findKitchenPrinter([{ name: 'Front desk', type: 'Billing' }]), null, 'a billing printer is not a kitchen printer');
const stBillingOnly = resolvePrinterStatus({
  printers: [{ id: 'p2', name: 'Front desk', type: 'Billing' }], printerConfigured: true,
});
eq(stBillingOnly.label, 'System print dialog', 'a billing-only printer still uses the print dialog for KOTs');
check(/none is assigned to the kitchen/.test(stBillingOnly.detail), 'says why the dialog is used');
const stFailed = resolvePrinterStatus({ printers: [], lastError: 'popup blocked' });
eq(stFailed.label, 'Printer unavailable', 'a failed dispatch → "Printer unavailable"');
check(/Allow pop-ups/.test(stFailed.detail) && /retry/i.test(stFailed.detail),
  'the failure explains the fix and is retryable');
check(!/printed successfully|physical print succeeded/i.test(
  [stFallback, stConfigured, stBillingOnly, stFailed].map((s) => s.detail).join(' ')),
  'no state claims paper was printed');
check(/Printer configured/.test(printerPanel) && /System print dialog/.test(printerPanel)
  && /Printer unavailable/.test(printerPanel),
  'the panel uses the three required statuses');
check(/openKotPrintWindow\(\)/.test(printerPanel) && /renderKotInWindow\(win,/.test(printerPanel),
  'Test print uses the SAME browser print path (no second printing stack)');
check(!/navigator\.|getUserMedia|jsPDF|escpos/i.test(printerPanel),
  'no unsupported direct-hardware API is introduced');
check((printerPanel.match(/sm:flex-row/g) || []).length >= 1
  && /flex-wrap/.test(printerPanel) && /min-w-0/.test(printerPanel),
  'the panel stacks/wraps on small screens (no overflow, no fixed height)');
check(/Confirm it in the dialog/.test(printerPanel),
  'it never claims a physical print succeeded');
check(/Allow pop-ups/.test(printerPanel) && /Retry print/.test(printerPanel),
  'popup blocking is an error state with a Retry action');
check(!/stillPrintingInBackground|silently/.test(printerPanel),
  'browser printing is never described as silent/background printing');

sub('"Configure printer" opens POS Settings → Printer');
check(/setSettingsSection\('printer'\)/.test(kitchen), 'the panel action sets the Printer tab');
check(/settingsSection: 'general'/.test(uiStore) && /setSettingsSection/.test(uiStore),
  'the pending settings section lives in the UI store');
check(/useUiStore\.getState\(\)\.settingsSection/.test(settingsPage) && /setActiveSection\(pending\)/.test(settingsPage),
  'POS Settings opens the requested tab');
check(/<KotPrinterStatus/.test(settingsPage), 'Printer Configuration renders the same status panel');
check(/configureLabel="Add printer"/.test(settingsPage), 'it offers the Add printer action on that tab');
check(/<KotPrinterStatus/.test(kitchen), 'Kitchen Tickets renders the panel');
const panelIdx = kitchen.indexOf('<KotPrinterStatus');
const kotsGridIdx = kitchen.indexOf('grid grid-cols-1 lg:grid-cols-3 gap-3 flex-1 min-h-0');
check(panelIdx > -1 && kotsGridIdx > -1 && panelIdx < kotsGridIdx,
  'the panel sits ABOVE the list grid (it never consumes the KOT/detail height)');
check(/grid grid-cols-1 lg:grid-cols-3 gap-3 flex-1 min-h-0/.test(kitchen),
  'the KOT list + detail grid fills the remaining viewport height');

sub('Order creation works while Socket.IO is disconnected');
check(!/socket/i.test(wizard), 'order + KOT creation make no socket call');
check(/pollFn: fetchActiveOrders, pollInterval: 30000/.test(activeOrders),
  'Active Orders falls back to polling when live updates are unavailable');
check(/pollFn: fetchKots/.test(kitchen), 'Kitchen Tickets falls back to polling');
check(/reconnection: true/.test(socketSvc) && /reconnectionAttempts/.test(socketSvc),
  'the client reconnects after a backend restart');
check(/transports: \['websocket', 'polling'\]/.test(socketSvc),
  'polling transport is available when the websocket cannot connect');
check(!/throw|reject/.test(socketSvc.match(/socket\.on\('connect_error'[\s\S]{0,80}/)?.[0] || ''),
  'a socket connection error never breaks the app (printing is independent)');

// ═══════════════════════════════════════════════
//  6. BARCODE SCANNER
// ═══════════════════════════════════════════════
section('6. BARCODE SCANNER');

sub('REGRESSION: a restaurant account can never be offered the scanner');
// Root cause: every business type carried barcode: true, so the POS Settings
// card rendered "Enable Barcode Scanner" for RESTAURANT accounts.
const { getBusinessCapabilities } = await import('../utils/businessCapabilities.js');
for (const t of ['RESTAURANT', 'CAFE', 'BAR', 'BAKERY', 'FOOD_TRUCK', 'CLOUD_KITCHEN', 'FOOD_COURT']) {
  eq(getBusinessCapabilities(t).barcode, false, `${t}: barcode capability OFF`);
}
for (const t of ['SUPERMARKET', 'GROCERY', 'CLOTHING', 'ELECTRONICS', 'COSMETICS', 'STATIONERY', 'OTHER']) {
  eq(getBusinessCapabilities(t).barcode, true, `${t}: barcode capability ON`);
}

sub('Visibility = business capability AND plan entitlement AND tenant toggle');
const { createWedgeBuffer, isTextEntryTarget } = await import('../hooks/useKeyboardWedgeScanner.js');
check(/barcodeScannerSupported/.test(settingsStore), 'the store exposes the business-type gate');
check(/s\.capabilities\s*\? s\.capabilities\.barcode === true/.test(settingsStore),
  'the gate requires an EXPLICIT server capability (never a default)');
check(/getBusinessCapabilities\(s\.businessType\)\.barcode === true/.test(settingsStore),
  'a missing capability falls back to the SAVED businessType mirror (not to "on")');
check(/barcodeScannerSupported: null/.test(settingsStore),
  'the gate starts UNKNOWN so nothing is offered before the business type loads');
check(/s\.barcodeScannerSupported === true\)/.test(wizard), 'the wizard requires an explicit true');
check(/useSettingsStore\(\(s\) => s\.barcodeScannerSupported\) === true/.test(posWorkspace),
  'the counter workspace requires an explicit true');
const newOrderPage = read('features/pos/workspace/pages/NewOrderPage.jsx');
check(/s\.barcodeScannerSupported\) === true/.test(newOrderPage),
  'the POS ordering entry point requires it too');

sub('POS Settings explains WHY the scanner is unavailable (and shows the saved value)');
check(/barcodeScannerSupported === null \|\| barcodeScannerSupported === undefined \?/.test(settingsPage),
  'an unresolved capability shows a neutral "checking" row instead of a toggle');
check(/Checking whether barcode scanning is available for this business/.test(settingsPage),
  'the checking state is explicit');
check(/barcodeScannerSupported === false \?/.test(settingsPage), 'an unsupported business type gets its own card');
check(/Not available for this business type \(\{settings\.businessType \|\| 'Unknown'\}\)/.test(settingsPage),
  'the card names the SAVED business type, not a default');
check(/Manual item search and ordering work as usual\./.test(settingsPage),
  'manual ordering is explicitly preserved');
check(/Camera scanning is not supported\./.test(settingsPage), 'no camera-scanning claim is made');
check(/barcodeScannerEnabled === true/.test(settingsPage), 'the toggle shows the SAVED tenant value');

sub('Backend enforces the same capability');
const backendMenuRoutes = readFileSync(path.join(SRC, '../../backend/src/routes/menu.routes.js'), 'utf8');
check(/requireBusinessCapability\("barcode"/.test(backendMenuRoutes), 'the barcode lookup route is capability-gated');
const backendSettings = readFileSync(path.join(SRC, '../../backend/src/controllers/setting.controller.js'), 'utf8');
check(/businessCapabilities\.barcode === false/.test(backendSettings), 'a non-barcode business cannot enable the toggle');
check(/settingWithMode\.barcodeScannerEnabled = false;/.test(backendSettings),
  'and the READ normalises it off so the UI never shows a phantom "on"');

sub('Keyboard-wedge capture: scanner-fast bursts only');
const scanned = [];
const wedge = createWedgeBuffer({ onScan: (code) => scanned.push(code) });
const key = (k, target = null, opts = {}) => ({ key: k, target, ...opts });
const body = { tagName: 'DIV', isContentEditable: false };

// Simulate a HID scanner: characters ~5ms apart, terminated by Enter.
let now = 1000;
const realNow = Date.now;
Date.now = () => now;
'8901234567890'.split('').forEach((ch) => { now += 5; wedge.handleKeydown(key(ch, body)); });
now += 5;
const consumed = wedge.handleKeydown(key('Enter', body));
Date.now = realNow;

eq(scanned, ['8901234567890'], 'a scanner-fast burst ending in Enter produces exactly one scan');
eq(consumed, '8901234567890', 'the Enter that ends a scan is consumed (it cannot submit a form)');

sub('Human typing is NEVER treated as a scan');
const slowScans = [];
const slow = createWedgeBuffer({ onScan: (c) => slowScans.push(c) });
now = 5000;
Date.now = () => now;
'search'.split('').forEach((ch) => { now += 220; slow.handleKeydown(key(ch, body)); });
now += 5;
slow.handleKeydown(key('Enter', body));
Date.now = realNow;
eq(slowScans.length, 0, 'a slowly typed word + Enter produces no scan');

sub('Text fields are never captured (search box, password, notes, …)');
for (const target of [
  { tagName: 'INPUT', type: 'text' },
  { tagName: 'INPUT', type: 'password' },
  { tagName: 'TEXTAREA' },
  { tagName: 'SELECT' },
  { tagName: 'DIV', isContentEditable: true },
]) {
  check(isTextEntryTarget(target) === true, `treated as text entry: ${target.tagName}${target.type ? `[${target.type}]` : ''}`);
}
check(isTextEntryTarget(body) === false, 'a plain container is NOT text entry');
check(isTextEntryTarget({ tagName: 'INPUT', type: 'checkbox' }) === false, 'a checkbox is not text entry');

const fieldScans = [];
const fieldWedge = createWedgeBuffer({ onScan: (c) => fieldScans.push(c) });
const inputTarget = { tagName: 'INPUT', type: 'text' };
now = 9000;
Date.now = () => now;
'8901234567890'.split('').forEach((ch) => { now += 5; fieldWedge.handleKeydown(key(ch, inputTarget)); });
now += 5;
fieldWedge.handleKeydown(key('Enter', inputTarget));
Date.now = realNow;
eq(fieldScans.length, 0, 'a burst typed INTO a text field produces no scan');

sub('Modifier shortcuts never produce a phantom scan');
const modScans = [];
const modWedge = createWedgeBuffer({ onScan: (c) => modScans.push(c) });
now = 12000; Date.now = () => now;
'8901234567890'.split('').forEach((ch) => { now += 5; modWedge.handleKeydown(key(ch, body, { ctrlKey: true })); });
now += 5; modWedge.handleKeydown(key('Enter', body, { ctrlKey: true }));
Date.now = realNow;
eq(modScans.length, 0, 'Ctrl/Alt/Meta combinations are ignored');

sub('A too-short burst + Enter is not a barcode');
const shortScans = [];
const shortWedge = createWedgeBuffer({ onScan: (c) => shortScans.push(c) });
now = 15000; Date.now = () => now;
'ab'.split('').forEach((ch) => { now += 5; shortWedge.handleKeydown(key(ch, body)); });
now += 5; shortWedge.handleKeydown(key('Enter', body));
Date.now = realNow;
eq(shortScans.length, 0, '2 fast characters + Enter add nothing');

sub('Disabled scanning attaches NO listener at all');
check(/if \(!enabled\) return undefined;/.test(read('hooks/useKeyboardWedgeScanner.js')),
  'the hook bails out entirely when disabled');
check(/enabled: canScanBarcode/.test(wizard), 'the wizard enables it from the resolved entitlement');

sub('A scanned item is resolved against the tenant menu and added to the cart');
check(/menuApi\.getByBarcode\(code\)/.test(wizard), 'the wizard resolves the code via the tenant-scoped lookup');
check(/menuApi\.getByBarcode\(code\)/.test(posWorkspace), 'the counter workspace does the same');
check(/addToCart\(\{[\s\S]{0,220}id: `menu-\$\{item\.id\}`/.test(wizard),
  'the resolved item is added through the SAME addToCart used by card taps');
check(/resolveMenuItemUnitPrice\(/.test(wizard), 'the price follows the existing pricing rules');

sub('Unknown barcodes and disabled scanners fail loudly and safely');
check(/Item not found for barcode/.test(wizard) && /Item not found for barcode/.test(posWorkspace),
  'an unknown barcode surfaces a visible message');
check(/status === 404/.test(wizard) && /status === 403/.test(posWorkspace),
  '404/403 are distinguished (unknown item vs not-enabled)');
check(/setScanError\(\{ barcode: code \}\)/.test(posWorkspace), 'the counter screen shows the failed barcode');

// ═══════════════════════════════════════════════
//  SUMMARY
// ═══════════════════════════════════════════════
section('RESULTS');
console.log(`\n  Total:  ${results.pass + results.fail}`);
console.log(`  Passed: ${results.pass} ✅`);
console.log(`  Failed: ${results.fail} ${results.fail > 0 ? '❌' : '✅'}`);
if (results.fail > 0) { console.log('\n  ❌ SOME TESTS FAILED\n'); process.exit(1); }
else { console.log('\n  ✅ ALL TESTS PASSED\n'); }
