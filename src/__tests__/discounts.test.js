/**
 * Discounts & Promotions — Frontend Test Suite
 * Standalone — run directly with: node src/__tests__/discounts.test.js
 *
 * Source-invariant + pure-function checks (no browser, no database):
 *   1. discount.api.js — all endpoints hit the tenant-scoped /discounts routes
 *   2. permissions.js — discounts screen + action keys role-gated correctly
 *   3. Sidebar — the Discounts & Promotions entry exists with role gating
 *   4. AppShell — the discounts screen is registered in ScreenRenderer
 *   5. DiscountsPage — summary cards, filters, table, actions, real-API calls
 *   6. DiscountFormModal — sections A–J, validation, preview, staff/promo config
 *   7. DiscountDetailModal — view modal renders persisted snapshot fields
 *   8. BillingPage — Apply Promotion, eligible-list panel, promo code input,
 *      staff discount, OrderDiscount chips, remove action
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '..');

const read = (rel) => readFileSync(path.join(SRC, rel), 'utf8');

const results = { pass: 0, fail: 0 };

function section(title) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${'='.repeat(60)}`);
}

function check(condition, message) {
  process.stdout.write(condition ? '  ✅ ' : '  ❌ ');
  console.log(message);
  condition ? results.pass++ : results.fail++;
}

// ═══════════════════════════════════════════════
//  1. API CLIENT
// ═══════════════════════════════════════════════
section('1. DISCOUNT API CLIENT');
const apiSrc = read('api/discount.api.js');

check(apiSrc.includes("apiClient.get('/discounts'"), 'GET /discounts — list');
check(apiSrc.includes("apiClient.get(`/discounts/${id}`)"), 'GET /discounts/:id — detail');
check(apiSrc.includes("apiClient.post('/discounts'"), 'POST /discounts — create');
check(apiSrc.includes("apiClient.put(`/discounts/${id}`") && apiSrc.includes("apiClient.patch(`/discounts/${id}/status`"), 'PUT + PATCH status — update');
check(apiSrc.includes("apiClient.delete(`/discounts/${id}`)"), 'DELETE /discounts/:id — archive');
check(apiSrc.includes("apiClient.post('/discounts/preview'"), 'POST /discounts/preview — §29 preview');
check(apiSrc.includes("apiClient.get(`/discounts/eligible/${orderId}`)"), 'GET /discounts/eligible/:orderId — §21');
check(apiSrc.includes("apiClient.post(`/discounts/apply/${orderId}`"), 'POST /discounts/apply/:orderId — §21');
check(apiSrc.includes("apiClient.post(`/discounts/apply/${orderId}/manual`"), 'POST /discounts/apply/:orderId/manual — §22');
check(apiSrc.includes("apiClient.delete(`/discounts/applied/${orderDiscountId}`)"), 'DELETE /discounts/applied/:id — remove');
check(apiSrc.includes("apiClient.get('/discounts/usage-stats')"), 'GET /discounts/usage-stats — real usage stats');
check(apiSrc.includes("apiClient.get('/discounts/reference/categories')"), 'GET /discounts/reference/categories — tenant-scoped category lookup');
check(apiSrc.includes("apiClient.get('/discounts/reference/products'") && apiSrc.includes('params: search'), 'GET /discounts/reference/products — tenant-scoped product lookup');
check(apiSrc.includes("apiClient.get('/discounts/reference/staff')"), 'GET /discounts/reference/staff — tenant-scoped staff lookup');
check(!apiSrc.includes('restaurantId:'), 'No restaurantId in payloads — tenant context is server-side');

// ═══════════════════════════════════════════════
//  2. PERMISSIONS
// ═══════════════════════════════════════════════
section('2. PERMISSIONS / RBAC');
const permSrc = read('utils/permissions.js');

check(permSrc.includes("discounts: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MANAGER]"), 'Screen gate: SUPER_ADMIN / ADMIN / MANAGER only');
check(permSrc.includes("'discount.view': [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MANAGER]"), 'discount.view key');
check(permSrc.includes("'discount.apply': [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MANAGER, ROLES.CASHIER]"), 'discount.apply key includes CASHIER');
check(!/KITCHEN:.*discount/.test(permSrc), 'KITCHEN has no discount permissions');

// ═══════════════════════════════════════════════
//  3. SIDEBAR + APP SHELL
// ═══════════════════════════════════════════════
section('3. NAVIGATION WIRING');
const sidebarSrc = read('components/layout/sidebar/Sidebar.jsx');
const shellSrc = read('components/layout/app-shell/AppShell.jsx');

check(sidebarSrc.includes("{ screen: 'discounts', label: 'Discounts & Promotions', icon: TicketPercent }"), 'Sidebar: Discounts & Promotions entry (TicketPercent icon)');
check(sidebarSrc.includes('TicketPercent,'), 'TicketPercent icon imported');
check(shellSrc.includes("const DiscountsPage = lazy(() => import('../../../features/discounts/pages/DiscountsPage'))"), 'AppShell: lazy-loaded DiscountsPage');
check(shellSrc.includes('discounts: DiscountsPage,'), 'AppShell: discounts → DiscountsPage mapping');

// ═══════════════════════════════════════════════
//  4. DISCOUNTS PAGE (§2)
// ═══════════════════════════════════════════════
section('4. DISCOUNTS & PROMOTIONS PAGE');
const pageSrc = read('features/discounts/pages/DiscountsPage.jsx');

check(pageSrc.includes('+ Create Discount'), 'Top action: + Create Discount');
check(pageSrc.includes('discountApi.getAll'), 'Loads REAL tenant data via discountApi.getAll');
check(pageSrc.includes("'Active'") && pageSrc.includes("'Scheduled'"), 'Summary cards: Active / Scheduled');
check(pageSrc.includes("'Expired'") && pageSrc.includes("'Disabled'"), 'Summary cards: Expired / Disabled');
check(pageSrc.includes("Today's Discount Amount"), "Summary: Today's Discount Amount");
check(pageSrc.includes('Total Discounted Orders'), 'Summary: Total Discounted Orders');
check(pageSrc.includes('discountApi.getUsageStats'), 'Usage stats from real tenant OrderDiscount data');
check(pageSrc.includes("placeholder=") && pageSrc.includes('Search'), 'Search input');
check(pageSrc.includes('statusFilter') && pageSrc.includes('typeFilter'), 'Status + Type filters');
check(pageSrc.includes('PERCENTAGE') && pageSrc.includes('FIXED_AMOUNT') && pageSrc.includes('STAFF') && pageSrc.includes('PROMO_CODE'), 'All four discount types in filter options');
check(pageSrc.includes('effectiveStatus') || pageSrc.includes('effective'), 'Effective status (§28) rendered');
check(pageSrc.includes('discountApi.setStatus'), 'Activate/Deactivate action');
check(pageSrc.includes('discountApi.archive') || pageSrc.includes('handleArchive'), 'Archive/Delete where safe');
check(pageSrc.includes('currencySymbol') || pageSrc.includes('useSettingsStore'), 'Existing settings-store currency pattern');

// ═══════════════════════════════════════════════
//  5. CREATE/EDIT FORM MODAL (§3–§19)
// ═══════════════════════════════════════════════
section('5. CREATE / EDIT DISCOUNT FORM');
const formSrc = read('features/discounts/components/DiscountFormModal.jsx');

check(formSrc.includes('Basic Information'), 'Section A: Basic Information');
check(formSrc.includes("'PERCENTAGE'") && formSrc.includes("'FIXED_AMOUNT'") && formSrc.includes("'STAFF'") && formSrc.includes("'PROMO_CODE'"), 'Section B: all four discount types');
check(formSrc.includes('maximumDiscountAmount'), 'Section C/D: Maximum Discount (§12)');
check(formSrc.includes('discountApi.refCategories'), 'Section D: categories from tenant-scoped reference endpoint');
check(formSrc.includes('discountApi.refProducts'), 'Section D: products from tenant-scoped reference endpoint');
check(!formSrc.includes('discountApi.refStaff'), 'No staff reference needed in the form (staff eligibility needs no configuration)');
check(formSrc.includes('No categories in this restaurant yet'), 'Genuine empty state kept for tenants without categories');
check(formSrc.includes('No products in this restaurant yet'), 'Genuine empty state kept for tenants without products');
check(formSrc.includes("category?.name"), 'Product chips show the real category');
check(formSrc.includes('No products match your search'), 'Search empty state distinct from no-data state');
check(formSrc.includes('startDate') && formSrc.includes('endDate'), 'Section E: Start/End Date (§8)');
check(formSrc.includes('startTime') && formSrc.includes('endTime'), 'Section E: Start/End Time');
check(formSrc.includes('applicableDays') && (formSrc.includes('Monday') || formSrc.includes('Mon')), 'Section E/F: Recurring days (§9)');
check(formSrc.includes('minimumOrderAmount'), 'Section F: Minimum Order Amount (§11)');
check(formSrc.includes('stackable'), 'Section H: Stacking Rules (§18)');
check(formSrc.includes('usageLimit'), 'Section G: Usage Limits (§16)');
check(formSrc.includes('perCustomerLimit'), 'Section G: Max Uses Per Customer');
check(formSrc.includes('code') && formSrc.includes('toUpperCase'), 'Section I: Promo code normalization (§15)');
check(formSrc.includes('promoMethod'), 'Promo: grant method (percentage vs fixed) configurable (§4)');
check(formSrc.includes('Discount Method'), 'Promo: dedicated Discount Method section shown');
// §13 rewrite: STAFF is ONE common discount for ALL active staff — the form
// exposes NO role/member/role-cap eligibility configuration at all.
check(!formSrc.includes('staffRoles'), 'Staff: NO eligible-roles configuration (removed)');
check(!formSrc.includes('Eligible Staff Members'), 'Staff: NO specific-member selection (removed)');
check(!formSrc.includes('staffUserIds'), 'Staff: NO targeted staff User ids submitted');
check(!formSrc.includes('staffRoleMaxPercent'), 'Staff: NO role-specific maximum (%) fields (removed)');
check(!formSrc.includes('Role-Specific Maximum'), 'Staff: role-cap UI fully removed');
check(!formSrc.includes('Eligible Roles'), 'Staff: role chip picker fully removed');
check(formSrc.includes('Staff discounts are automatically available to all active staff members.'), 'Staff: informational note about universal eligibility present');
check(!formSrc.includes('staffRequireApproval') && !formSrc.includes('Require manager approval'), 'Staff: manager approval fully removed (§4/§5)');
check(formSrc.includes('All Active Staff'), 'Staff preview: eligibility shown as All Active Staff');
check(formSrc.includes('Preview') || formSrc.includes('preview'), 'Section I: Preview (§29)');
check(formSrc.includes('percentage > 100') || formSrc.includes('Percentage must') || formSrc.includes('cannot exceed 100'), 'Validation: percentage range');
check(formSrc.includes('End must be after start') || formSrc.includes('must be on or after start') || formSrc.includes('End date/time'), 'Validation: date ordering');
check(formSrc.includes('discountApi.create') && formSrc.includes('discountApi.update'), 'Save: create + update calls');

// ═══════════════════════════════════════════════
//  6. DETAIL MODAL
// ═══════════════════════════════════════════════
section('6. DISCOUNT DETAIL MODAL');
const detailSrc = read('features/discounts/components/DiscountDetailModal.jsx');
check(detailSrc.includes('Discount Details'), 'View modal renders');
check(detailSrc.includes('discountValue') && detailSrc.includes('discountName') || detailSrc.includes('discount.name'), 'Shows persisted discount fields');
check(!detailSrc.includes('Eligible Roles') && !detailSrc.includes('staffRoles'), 'Detail: no role eligibility config shown (§13 rewrite)');
check(detailSrc.includes('All Active Staff'), 'Detail: STAFF eligibility shown as All Active Staff');

// ═══════════════════════════════════════════════
//  7. BILLING INTEGRATION (§21/§22)
// ═══════════════════════════════════════════════
section('7. BILLING SCREEN INTEGRATION');
const billSrc = read('features/billing/pages/BillingPage.jsx');

check(billSrc.includes("import { discountApi } from '../../../api/discount.api'"), 'discountApi imported');
check(billSrc.includes('function PromotionDiscountPanel'), 'PromotionDiscountPanel component');
check(billSrc.includes('Apply Promotion'), 'Apply Promotion entry button');
check(billSrc.includes('discountApi.getEligible'), 'Fetches backend-eligible discounts (frontend never decides eligibility)');
check(billSrc.includes('Available Discounts'), 'Eligible discounts list rendered');
check(billSrc.includes('Promo Code') || billSrc.includes('Enter code'), 'Promo code input + apply');
check(billSrc.includes('staffRequestedValue'), 'Staff discount with requested value');
check(billSrc.includes('staffUserId'), 'Staff discount associates the selected real staff member (§6)');
check(billSrc.includes('Search staff...'), 'Billing: searchable staff picker from tenant directory (§13)');
check(!billSrc.includes('servedRoles'), 'Billing: staff picker never filtered by a promotion staffRoles (all active staff selectable)');
check(billSrc.includes('Select the staff member receiving this discount'), 'Billing: staff member required before applying');
check(billSrc.includes('orderDiscounts'), 'OrderDiscount snapshot rows consumed');
check(billSrc.includes('discountApi.removeApplied'), 'Remove applied discount');
check(billSrc.includes('promotionDiscountTotal'), 'Promotion discount totals included in payable');
check(billSrc.includes('promotionDiscountTotal > 0 ? undefined : (discountType || undefined)'), 'Legacy cashier discount not double-counted with engine discounts');

// ═══════════════════════════════════════════════
//  8. STAFF IDENTITY MODEL + ERROR SURFACING (fix/QA round)
// ═══════════════════════════════════════════════
section('8. STAFF RECIPIENT CONTRACT + ERROR SURFACING');
check(
  billSrc.includes("data.eligible || []") && billSrc.includes("data.excluded || []"),
  'Eligible list unwraps the REAL { eligible, excluded } contract (no guessed shape)'
);
check(
  billSrc.includes("e.response?.data?.message") && billSrc.includes("details[0]?.message"),
  'Backend validation/business-rule messages surfaced verbatim (no generic masking)'
);
check(
  billSrc.includes("onApplied(resp?.data?.data ?? resp?.data ?? resp)"),
  'Apply response unwrapped safely for both axios and interceptor shapes'
);
check(
  billSrc.includes("{ discountId: d.id, staffUserId: Number(selectedStaffId) }"),
  'STAFF apply payload sends the explicitly selected recipient staffUserId'
);
check(
  !billSrc.includes("staffUserId: user?.id") && !billSrc.includes("staffUserId: authState?.user?.id"),
  'Frontend never substitutes the logged-in user as the staff recipient'
);
check(
  billSrc.includes("excluded.length > 0 && ("),
  'Excluded promotions rendered with backend-provided reasons (truthful empty state)'
);
check(
  billSrc.includes("excluded.length === 0 && ("),
  '"No eligible discounts" only when there is truly nothing (eligible AND excluded empty)'
);
check(
  billSrc.includes("Remove the applied promotion before adding a manual discount"),
  'Manual cashier discount blocked while a promotion is applied (display = backend total)'
);
check(
  billSrc.includes("No active staff members found for this restaurant."),
  'Real empty state when the tenant has no eligible staff (no dummy data)'
);

// Manual discount preview must be derived from the CURRENT input (§14)
check(
  billSrc.includes("const previewDiscount = calculateDiscount(type, sanitized, subtotal)"),
  'Add-Discount preview computed from the live sanitized input'
);
check(
  billSrc.includes("`Discount (${sanitized || '0'}%)`"),
  'Preview label shows the value currently entered (never stale)'
);

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
