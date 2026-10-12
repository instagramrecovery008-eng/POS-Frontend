/**
 * Restaurant-mode enhancements — frontend test suite.
 * Standalone (repo pattern): pure-function imports + source-invariant checks.
 *
 * Covers:
 *   1. isAcNonAcPricingEnabled — RESTAURANT only
 *   2. resolveMenuItemUnitPrice — FLOOR type selects the price
 *   3. Floor form shows AC/NON_AC (Restaurant mode)
 *   4. Table form no longer shows an AC/NON_AC selector
 *   5. Table displays the inherited floor type
 *   6. Menu Item form shows Non-AC Price + AC Price (Restaurant mode)
 *   7. Subcategory shows real subcategories; NO "No Subcategory" tab
 *   8. KOT preview has aligned fixed-width QTY and ITEM columns
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  isAcNonAcPricingEnabled,
  resolveMenuItemUnitPrice,
} from '../utils/businessCapabilities.js';
import { subcategoryTabsFor, SUBCATEGORY_NONE } from '../utils/menuHierarchy.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '..');
const read = (rel) => readFileSync(path.join(SRC, rel), 'utf8');

const results = { pass: 0, fail: 0 };
function section(t) { console.log(`\n${'='.repeat(60)}\n  ${t}\n${'='.repeat(60)}`); }
function check(cond, msg) {
  process.stdout.write(cond ? '  ✅ ' : '  ❌ ');
  console.log(msg);
  cond ? results.pass++ : results.fail++;
}
function eq(actual, expected, label) {
  const pass = actual === expected;
  process.stdout.write(pass ? '  ✅ ' : '  ❌ ');
  console.log(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  pass ? results.pass++ : results.fail++;
}

// ═══════════════════════════════════════════════
section('1. isAcNonAcPricingEnabled — RESTAURANT only');
eq(isAcNonAcPricingEnabled({ businessMode: 'restaurant' }), true, "businessMode 'restaurant' → enabled");
eq(isAcNonAcPricingEnabled({ businessMode: 'counter' }), false, "businessMode 'counter' → disabled");
eq(isAcNonAcPricingEnabled({ businessMode: 'counter', subscriptionBusinessMode: 'RESTAURANT' }), true, "raw subscription RESTAURANT → enabled");
eq(isAcNonAcPricingEnabled({ subscriptionBusinessMode: 'BASIC_POS' }), false, "raw BASIC_POS → disabled");
eq(isAcNonAcPricingEnabled({ subscriptionBusinessMode: 'QUICK_BILLING' }), false, "raw QUICK_BILLING → disabled");
eq(isAcNonAcPricingEnabled({}), false, "no settings → disabled");

// ═══════════════════════════════════════════════
section('2. resolveMenuItemUnitPrice — FLOOR type selects the price');
const item = { price: 250, acPrice: 280, nonAcPrice: 250 };
const rest = { businessMode: 'restaurant' };
eq(resolveMenuItemUnitPrice(item, { floorType: 'AC' }, rest), 280, 'AC floor → 280');
eq(resolveMenuItemUnitPrice(item, { floor: { floorType: 'AC' } }, rest), 280, 'AC floor (nested) → 280');
eq(resolveMenuItemUnitPrice(item, { floorType: 'NON_AC' }, rest), 250, 'NON_AC floor → 250');
eq(resolveMenuItemUnitPrice(item, { tableType: 'AC' }, rest), 280, 'table-only fallback → 280');
eq(resolveMenuItemUnitPrice(item, null, rest), 250, 'no table → base 250');
eq(resolveMenuItemUnitPrice(item, { floorType: 'AC' }, { businessMode: 'counter' }), 250, 'non-restaurant → base 250');

// ═══════════════════════════════════════════════
section('3–4. Floor form: Floor Type; Table form: NO AC/NON_AC selector');
const table = read('features/masters/table/pages/TablePage.jsx');
check(table.includes('isAcNonAcPricingEnabled'), 'TablePage imports the centralized mode helper');
check(table.includes('Floor Type') && table.includes("['AC', 'NON_AC'].map"), 'floor form renders an AC / Non-AC Floor Type selector');
check(table.includes('{acNonAcPricing && (') && table.includes('setFloorType'), 'Floor Type is gated by acNonAcPricing');
check(!/setTableType/.test(table), 'no table-level setTableType state remains');
check(!table.includes("AC / Non-AC</label>"), "the old table AC/NON_AC selector label is gone");
check(table.includes("...(acNonAcPricing ? { floorType } : {})"), 'floorType is submitted only in Restaurant mode');
check(!/\.\.\.\(acNonAcPricing \? \{ tableType \} : \{\}\)/.test(table), 'table payload no longer sends a client tableType');

// ═══════════════════════════════════════════════
section('5. Table displays the inherited floor type');
check(table.includes('floorType: t.floorType || t.tableType'), 'table list maps the inherited floorType');
check(table.includes("tbl.floorType === 'AC' ? 'AC' : 'Non-AC'"), 'table card shows the inherited floor type');

// ═══════════════════════════════════════════════
section('6. Menu form: Non-AC Price + AC Price (Restaurant mode)');
const menu = read('features/masters/menu/pages/MenuPage.jsx');
check(menu.includes('isAcNonAcPricingEnabled'), 'MenuPage imports the centralized mode helper');
check(menu.includes('Non-AC Price') && menu.includes('AC Price'), 'Menu form renders Non-AC Price and AC Price labels');
check(menu.includes('Base Price'), 'base price label reads Base Price in Restaurant mode');
check(menu.includes("AC and Non-AC prices are automatically applied based on the selected table's floor."), 'helper text explains automatic floor-based pricing');
check(menu.includes("acPrice: itemAcPrice === '' ? null : toNumber(itemAcPrice)") &&
      menu.includes("nonAcPrice: itemNonAcPrice === '' ? null : toNumber(itemNonAcPrice)"),
  'AC and Non-AC prices are submitted (empty → null)');

// ═══════════════════════════════════════════════
section('7. Subcategory tabs — real subcategories only, no "No Subcategory"');
const tabs = subcategoryTabsFor(
  [
    { category: 'Starters', subcategoryId: 1 },
    { category: 'Starters', subcategoryId: 2 },
    { category: 'Starters', subcategoryId: null },
  ],
  [
    { id: 1, name: 'Soup', categoryName: 'Starters', isActive: true, sortOrder: 1 },
    { id: 2, name: 'Salad', categoryName: 'Starters', isActive: true, sortOrder: 2 },
  ],
  'Starters'
);
eq(tabs.map(t => t.name).join('|'), 'Soup|Salad', 'only real subcategories are returned');
check(!tabs.some(t => t.id === SUBCATEGORY_NONE), 'no "No Subcategory" tab is created');
eq(subcategoryTabsFor([{ category: 'Starters', subcategoryId: null }], [], 'Starters').length, 0, 'category with zero subcategories → no tabs (All only)');
const hierarchy = read('utils/menuHierarchy.js');
check(!hierarchy.includes("name: 'No Subcategory'"), 'menuHierarchy no longer renders a "No Subcategory" tab');

// ═══════════════════════════════════════════════
section('8. KOT preview — aligned fixed-width QTY + ITEM columns');
const print = read('services/printService.js');
check(print.includes('table-layout: fixed'), 'KOT table uses a fixed layout');
check(print.includes('th.qty, td.qty { text-align: left; width: 16%'), 'QTY has its own fixed-width column');
check(print.includes('th.item, td.item { width: 84%; }'), 'ITEM starts at a consistent X position');
check(print.includes('td.item { padding-left: 6px; word-break: break-word'), 'long item names wrap under the item column');
check(!print.includes('td.qty { text-align: center; width: 28px; }'), 'old cramped centered QTY column is removed');
check(print.includes('<th class="qty">QTY</th>') && print.includes('<th class="item">ITEM</th>'), 'header renders QTY then ITEM columns');

// ═══════════════════════════════════════════════
console.log(`\nRESULTS: PASSED ${results.pass}  FAILED ${results.fail}`);
process.exit(results.fail ? 1 : 0);
