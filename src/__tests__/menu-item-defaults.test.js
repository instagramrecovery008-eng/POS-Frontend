/**
 * Add Item defaults (Part 2) — frontend test suite.
 * Standalone: node src/__tests__/menu-item-defaults.test.js
 *
 * Pure-function checks on resolveItemDefaults() + source invariants on the
 * real MenuPage so the acceptance criteria cannot silently regress.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '..');
const read = (rel) => readFileSync(path.join(SRC, rel), 'utf8');

const { resolveItemDefaults } = await import(pathToFileURL(path.join(SRC, 'utils/menuItemDefaults.js')).href);
const { SUBCATEGORY_ALL, SUBCATEGORY_NONE } = await import(pathToFileURL(path.join(SRC, 'utils/menuHierarchy.js')).href);

let pass = 0, fail = 0;
function section(t) { console.log(`\n${'='.repeat(60)}\n  ${t}\n${'='.repeat(60)}`); }
function sub(t) { console.log(`\n  --- ${t} ---`); }
function check(cond, msg) { process.stdout.write(cond ? '  ✅ ' : '  ❌ '); console.log(msg); cond ? pass++ : fail++; }
function eq(actual, expected, label) {
  const ok = actual === expected;
  process.stdout.write(ok ? '  ✅ ' : '  ❌ ');
  console.log(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  ok ? pass++ : fail++;
}

// ── Fixtures ────────────────────────────────────────────────────────────────
const categories = [{ id: 'cat-1', name: 'Beverages' }, { id: 'cat-2', name: 'Snacks' }];
const subcategories = [
  { id: 11, name: 'Cold Coffee', categoryId: 1, categoryName: 'Beverages', isActive: true },
  { id: 12, name: 'Hot Coffee', categoryId: 1, categoryName: 'Beverages', isActive: true },
  { id: 21, name: 'Chips', categoryId: 2, categoryName: 'Snacks', isActive: true },
];

section('1. Category + subcategory preselected (Beverages → Cold Coffee)');
let d = resolveItemDefaults({ selectedCategory: 'Beverages', selectedSubcategory: 11, categories, subcategories });
eq(d.categoryName, 'Beverages', 'category preselected');
eq(d.subcategoryId, '11', 'subcategory preselected');

sub('String/number id tolerance (tab ids may be strings)');
d = resolveItemDefaults({ selectedCategory: 'Beverages', selectedSubcategory: '11', categories, subcategories });
eq(d.subcategoryId, '11', 'string subcategory id resolves');

section('2. Category-only selection → valid default subcategory (None)');
d = resolveItemDefaults({ selectedCategory: 'Beverages', selectedSubcategory: SUBCATEGORY_ALL, categories, subcategories });
eq(d.categoryName, 'Beverages', 'category preselected');
eq(d.subcategoryId, '', 'no subcategory (All)');
d = resolveItemDefaults({ selectedCategory: 'Beverages', selectedSubcategory: SUBCATEGORY_NONE, categories, subcategories });
eq(d.subcategoryId, '', 'no subcategory (None)');

section('3. Viewing "All" keeps the existing category default, no stale subcategory');
d = resolveItemDefaults({ selectedCategory: 'All', selectedSubcategory: 11, categories, subcategories });
eq(d.categoryName, 'Beverages', 'falls back to the first category');
eq(d.subcategoryId, '', 'never applies a subcategory from a previous view');
d = resolveItemDefaults({ selectedCategory: 'All', selectedSubcategory: SUBCATEGORY_ALL, categories: [], subcategories });
eq(d.categoryName, '', 'no categories → empty (existing behavior)');

section('4. A subcategory from another category is never applied');
d = resolveItemDefaults({ selectedCategory: 'Snacks', selectedSubcategory: 11, categories, subcategories });
eq(d.categoryName, 'Snacks', 'category applied');
eq(d.subcategoryId, '', 'foreign subcategory rejected (not silently applied)');

section('5. Stale selection — subcategory id no longer exists');
d = resolveItemDefaults({ selectedCategory: 'Beverages', selectedSubcategory: 999, categories, subcategories });
eq(d.subcategoryId, '', 'unknown id resolves to None');

section('6. MenuPage wiring (source invariants)');
const page = read('features/masters/menu/pages/MenuPage.jsx');
check(page.includes('resolveItemDefaults'), 'MenuPage delegates to the shared resolver');
check(/const openAddItemModal = \(\) => \{[\s\S]*?resetForm\(\);[\s\S]*?currentViewItemDefaults\(\)/.test(page),
  'Add Item derives defaults at open time (no stale cache)');
check(page.includes('if (categoryName) setItemCategory(categoryName)'), 'category applied to the form');
check(page.includes('setItemSubcategoryId(subcategoryId)'), 'subcategory applied to the form');
check(/setItemCategory\(e\.target\.value\); setItemSubcategoryId\(''\)/.test(page),
  'changing the category clears the previous subcategory selection');
check(/subcategories\.filter\(s => s\.isActive && s\.categoryName === itemCategory\)/.test(page),
  'subcategory dropdown only lists subcategories of the selected category');
check(page.includes('setSelectedSubcategory(tab.id)') && page.includes("setSelectedCategory(cat.name)"),
  'the item form reads the SAME category/subcategory view state used by the tabs');

section('RESULTS');
console.log(`\n  Total:  ${pass + fail}`);
console.log(`  Passed: ${pass} ✅`);
console.log(`  Failed: ${fail} ${fail > 0 ? '❌' : '✅'}`);
if (fail > 0) { console.log('\n  ❌ SOME TESTS FAILED\n'); process.exit(1); }
else { console.log('\n  ✅ ALL TESTS PASSED\n'); }
