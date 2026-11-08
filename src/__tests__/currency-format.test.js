/**
 * Global currency tests — standalone node script (same pattern as the other
 * suites here). Verifies the single shared formatter follows the company's
 * ISO currency code and nothing is hardcoded to a country.
 *   node src/__tests__/currency-format.test.js
 */
import {
  setActiveCurrency, getActiveCurrency, formatCurrency, getCurrencySymbol,
  getCurrencyDigits, toMinor, roundMoney, listCurrencies,
  setActiveTimezone, getActiveTimezone,
} from '../lib/utils.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let passed = 0;
let failed = 0;
const check = (cond, name) => { if (cond) passed++; else { failed++; console.error('  FAIL:', name); } };
const nb = (s) => s.replace(/ /g, ' ');
const eq = (a, b, name) => check(a === b, `${name} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);

// ── No company currency configured: never invent one ──
setActiveCurrency('');
eq(getActiveCurrency(), '', 'no default currency');
eq(formatCurrency(150), '150.00', 'unconfigured shows a plain number, not ₹');
eq(getCurrencySymbol(), '', 'unconfigured symbol is empty');

// ── Company A: AED ──
setActiveCurrency('AED');
eq(nb(formatCurrency(150)), 'AED 150.00', 'AED display');
eq(nb(getCurrencySymbol() + '137.00'), 'AED 137.00', 'AED symbol prefix call-sites');
eq(getCurrencyDigits(), 2, 'AED digits');

// ── Company B: INR ──
setActiveCurrency('INR');
eq(nb(formatCurrency(1500)), '₹1,500.00', 'INR display');
eq(getCurrencySymbol(), '₹', 'INR symbol');

// ── Company C: USD ──
setActiveCurrency('USD');
eq(nb(formatCurrency(150)), '$150.00', 'USD display');

// ── Changing the company currency changes every call site immediately ──
setActiveCurrency('AED');
const before = nb(formatCurrency(59));
setActiveCurrency('GBP');
const after = nb(formatCurrency(59));
check(before === 'AED 59.00' && after === '£59.00', 'currency switch updates formatting immediately');

// ── Other currencies / precision ──
eq(nb(formatCurrency(150, 'EUR')), '€150.00', 'explicit EUR');
eq(nb(formatCurrency(150, 'SAR')), 'SAR 150.00', 'explicit SAR');
eq(nb(formatCurrency(1500, 'JPY')), '¥1,500', 'JPY has no decimals');
eq(getCurrencyDigits('JPY'), 0, 'JPY digits');
eq(getCurrencyDigits('KWD'), 3, 'KWD digits');
eq(nb(formatCurrency(1.5, 'KWD')), 'KWD 1.500', 'KWD 3 decimals');
eq(formatCurrency('garbage'), '0.00'.replace('0.00', formatCurrency(0)), 'non-numeric amount is zero, never NaN');
check(!formatCurrency(NaN).includes('NaN'), 'NaN never rendered');
eq(nb(formatCurrency(-25.5, 'USD')), '-$25.50', 'negative amounts');
eq(nb(formatCurrency(5, 'xx1')), formatCurrency(5, ''), 'invalid ISO code falls back to the active currency');

// ── Minor-unit math ──
setActiveCurrency('USD');
eq(toMinor(0.1 + 0.2), 30, 'float drift removed');
eq(roundMoney(88.2 - 0.2), 88, 'round-off math exact');
setActiveCurrency('JPY');
eq(toMinor(1500), 1500, 'JPY minor = major');

// ── Currency list for settings is the full ISO set, not 8 hardcoded ones ──
const list = listCurrencies();
check(list.length > 100, 'settings offers the full ISO 4217 list');
check(['INR', 'AED', 'USD', 'GBP', 'EUR', 'SAR', 'JPY'].every((c) => list.some((o) => o.value === c)), 'common currencies present');

// ── Timezone ──
setActiveTimezone('Asia/Dubai');
eq(getActiveTimezone(), 'Asia/Dubai', 'company timezone set');
setActiveTimezone('Not/AZone');
eq(getActiveTimezone(), undefined, 'invalid timezone falls back to device zone');

// ── Source guards: nothing in POS code hardcodes a country currency/zone ──
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.resolve(here, '..', rel), 'utf8');
const guarded = [
  'features/billing/pages/BillingPage.jsx',
  'features/orders/pages/ActiveOrdersPage.jsx',
  'features/pos/workspace/pages/PosWorkspace.jsx',
  'features/pos/workspace/components/TakeOrderWizard.jsx',
  'features/dashboard/pages/DashboardPage.jsx',
  'features/masters/menu/pages/MenuPage.jsx',
  'features/discounts/pages/DiscountsPage.jsx',
  'services/printService.js',
  'services/reportExportService.js',
  'store/settingsStore.js',
];
for (const f of guarded) {
  const src = read(f);
  check(!src.includes('₹'), `${f}: no hardcoded ₹`);
  check(!src.includes("'Asia/Kolkata'"), `${f}: no hardcoded Asia/Kolkata`);
}
check(!/'en-IN'/.test(read('lib/utils.js').split('formatCurrency')[1].slice(0, 900)), 'formatCurrency does not use en-IN');
const store = read('store/settingsStore.js');
check(/setActiveCurrency\(/.test(store), 'settings store pushes currency to the shared formatter');
check(/currency: '',/.test(store), 'settings default has no country currency');

console.log(`RESULTS: PASSED ${passed}  FAILED ${failed}`);
if (failed) process.exit(1);
