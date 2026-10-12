/**
 * Manage Subcategories modal — Edit / Delete visibility (spec §1) — frontend tests.
 * Standalone: node src/__tests__/subcategory-manage-ui.test.js
 *
 * Root cause this suite locks down: the modal's Category <select> carries the
 * display token `cat-<id>` while every subcategory row carries the numeric
 * `categoryId`. The list filter compared the raw values
 * (`String(s.categoryId) === String(subCatCategory)` → "3" !== "cat-3"), matched
 * nothing, and rendered ONLY the empty-state message — so the Edit / Delete
 * controls existed in the source but were unreachable in the real UI.
 *
 * Coverage:
 *   1. Pure normalization helper (the fix) — including a regression guard that
 *      proves the OLD comparison matched nothing
 *   2. The modal renders a row per subcategory with Edit AND Delete controls
 *   3. The list is driven by the normalized helper (no raw-token comparison)
 *   4. Edit: inline form with Save + Cancel, empty/duplicate rejection, refresh
 *   5. Delete: confirmation dialog, blocked/reassignment flow, never deletes items
 *   6. API wiring (tenant-scoped subcategory endpoints + route ordering)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '..');
const REPO = path.resolve(SRC, '..', '..');
const read = (rel) => readFileSync(path.join(SRC, rel), 'utf8');
const readBackend = (rel) => readFileSync(path.join(REPO, 'backend', rel), 'utf8');

const { categoryTokenToId, subcategoriesForCategoryId, subcategoriesForCategory } =
  await import(pathToFileURL(path.join(SRC, 'utils/menuHierarchy.js')).href);

let pass = 0, fail = 0;
function section(t) { console.log(`\n${'='.repeat(60)}\n  ${t}\n${'='.repeat(60)}`); }
function sub(t) { console.log(`\n  --- ${t} ---`); }
function check(cond, msg) { process.stdout.write(cond ? '  ✅ ' : '  ❌ '); console.log(msg); cond ? pass++ : fail++; }
function eq(actual, expected, label) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  process.stdout.write(ok ? '  ✅ ' : '  ❌ ');
  console.log(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  ok ? pass++ : fail++;
}

const menuPage = read('features/masters/menu/pages/MenuPage.jsx');
// Comment-free view — line comments quote the OLD broken expression on purpose.
const menuPageCode = menuPage.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const menuApi = read('api/menu.api.js');
const menuRoutes = readBackend('src/routes/menu.routes.js');
const menuController = readBackend('src/controllers/menu.controller.js');

// ── Fixtures: TWO real subcategories under the selected category ────────────
// Category <select> values are the display tokens the page builds (`cat-<id>`).
const categories = [
  { id: 'cat-1', name: 'Pizza' },
  { id: 'cat-2', name: 'Beverages' },
];
const subcategories = [
  { id: 11, name: 'Classic Pizza', categoryId: 1, categoryName: 'Pizza', isActive: true, sortOrder: 1 },
  { id: 12, name: 'Signature Pizza', categoryId: 1, categoryName: 'Pizza', isActive: true, sortOrder: 2 },
  { id: 21, name: 'Cold Coffee', categoryId: 2, categoryName: 'Beverages', isActive: true, sortOrder: 1 },
];

section('1. Category token ↔ numeric id normalization (the actual bug)');
eq(categoryTokenToId('cat-1'), 1, "'cat-1' resolves to the numeric id 1");
eq(categoryTokenToId(1), 1, 'a raw numeric id passes through');
eq(categoryTokenToId('1'), 1, 'a numeric string passes through');
eq(categoryTokenToId(''), null, 'unset select value → null (no list)');
eq(categoryTokenToId(undefined), null, 'undefined → null');
eq(categoryTokenToId(null), null, 'null → null');
eq(categoryTokenToId('cat-abc'), null, 'unparsable token → null (never NaN)');

sub('Regression guard — the OLD comparison could never match');
const oldMatch = subcategories.filter((s) => String(s.categoryId) === String('cat-1'));
eq(oldMatch.length, 0, 'old `String(s.categoryId) === String(subCatCategory)` matched NOTHING (empty list + no Edit/Delete)');
const newMatch = subcategoriesForCategoryId(subcategories, 'cat-1');
eq(newMatch.map((s) => s.name), ['Classic Pizza', 'Signature Pizza'],
  'normalized helper returns BOTH subcategories of the selected category');
eq(subcategoriesForCategoryId(subcategories, ''), [], 'no category selected → empty list');
eq(categories.map((c) => c.id), ['cat-1', 'cat-2'], 'select values are `cat-<id>` tokens (the mismatch source)');

sub('The other Category → Subcategory selector is unaffected');
eq(subcategoriesForCategory(subcategories, 'Pizza').map((s) => s.name),
  ['Classic Pizza', 'Signature Pizza'], 'food-type/tab selector still matches on the category NAME');

section('2. Modal renders a row per subcategory with Edit AND Delete');
const modal = menuPage.slice(menuPage.indexOf('MANAGE SUBCATEGORIES MODAL'));
check(modal.length > 0, 'Manage Subcategories modal section found in MenuPage.jsx');
check(/subCatsForSelectedCategory\.map\(/.test(menuPage), 'list is rendered from the normalized subcategory list');
check(!/String\(s\.categoryId\) === String\(subCatCategory\)/.test(menuPageCode),
  'no live code compares the raw category token against the numeric categoryId');
check(/Number\(s\.categoryId\) === categoryTokenToId\(subCatCategory\)/.test(menuPageCode),
  'the duplicate-name guard uses the SAME normalized comparison (it previously never fired)');
check(/title="Edit subcategory" aria-label=\{`Edit subcategory \$\{s\.name\}`\}/.test(menuPage),
  'each row has a labelled Edit control');
check(/title="Delete subcategory" aria-label=\{`Delete subcategory \$\{s\.name\}`\}/.test(menuPage),
  'each row has a labelled Delete control');
check(/aria-label="Subcategory name"/.test(menuPage), 'the add/edit name input is labelled');
check(/subCatsForSelectedCategory\.length === 0 && \(/.test(menuPage),
  'the empty-state message only renders when the SELECTED category has no subcategories');

section('3. Edit — Save / Cancel, validation, refresh');
check(/const cancelSubCatEdit = \(\) => \{/.test(menuPage), 'Cancel resets the edit state');
check(/\{editingSubCat \? 'Save' : 'Add'\}/.test(menuPage), 'the button becomes Save while editing');
check(menuPage.includes('onClick={cancelSubCatEdit}'), 'Cancel is wired to cancelSubCatEdit');
check(/const clash = subcategories\.find\(\(s\) =>/.test(menuPage) && /already exists in this category/.test(menuPage),
  'duplicate name inside the same category is rejected in the UI');
check(/Subcategory name is required/.test(menuPage), 'an empty name is rejected in the UI');
check(/menuApi\.updateSubcategory\(editingSubCat\.id, \{ name, sortOrder: subCatForm\.sortOrder \}\)/.test(menuPage),
  'Save persists through the tenant-scoped updateSubcategory API');
check(/cancelSubCatEdit\(\);\s*\n\s*loadSubcategories\(\);/.test(menuPage),
  'the list is refreshed after saving');
check(/cachedMenuFetched = 0;\s*\n\s*loadMenu\(\);/.test(menuPage),
  'menu items + subcategory filters are refreshed after saving');
check(/handleSubCatToggle/.test(menuPage), 'activate/deactivate still works alongside edit');

section('4. Delete — confirmation, safe reassignment, never deletes items');
check(/const openSubCatDelete = \(s\) => \{/.test(menuPage), 'Delete opens a confirmation target (no silent delete)');
check(/const confirmSubCatDelete = async \(\) => \{/.test(menuPage), 'an explicit confirm handler exists');
check(menuPage.includes('Delete Subcategory') && /Cannot be undone|This cannot be undone/.test(menuPage)
  || /No menu items use this subcategory\. This cannot be undone\./.test(menuPage),
  'the confirmation dialog explains the consequence');
check(/menu item\(s\) use this subcategory\. They will NOT be deleted/.test(menuPage),
  'when items reference it, the dialog blocks and demands a destination');
check(/<option value="none">None \(no subcategory\)<\/option>/.test(menuPage),
  'reassignment offers the supported "None" destination');
check(/subCatDeleteTarget\.siblings\.map/.test(menuPage), 'reassignment offers sibling subcategories of the same category');
check(/const siblings = subcategories\.filter\(x =>\s*\n\s*Number\(x\.categoryId\) === Number\(s\.categoryId\)/.test(menuPage),
  'siblings are compared on normalized category ids');
check(/await menuApi\.deleteSubcategory\(target\.sub\.id, target\.itemCount > 0 \? target\.moveTo : undefined\)/.test(menuPage),
  'delete calls the tenant-scoped API with the chosen destination');
const confirmBody = menuPage.slice(menuPage.indexOf('const confirmSubCatDelete'), menuPage.indexOf('// ── Category CRUD Handlers'));
check(!/menuApi\.delete\(/.test(confirmBody) && !/deleteMenuItem/.test(confirmBody),
  'menu items are NEVER deleted implicitly');
check(/deleteItemTarget|menuApi\.delete\(/.test(menuPage) && !/menuApi\.delete\(/.test(confirmBody),
  'item deletion stays a separate, explicitly-confirmed flow');

section('5. API wiring + tenant isolation (backend contract)');
check(/getSubcategories: \(categoryId\) =>/.test(menuApi) && /'\/menu\/subcategories'/.test(menuApi),
  'frontend reads GET /menu/subcategories');
check(/createSubcategory: \(data\) => apiClient\.post\('\/menu\/subcategories', data\)/.test(menuApi),
  'frontend creates through POST /menu/subcategories');
check(/updateSubcategory: \(id, data\) => apiClient\.put\(`\/menu\/subcategories\/\$\{id\}`, data\)/.test(menuApi),
  'frontend updates through PUT /menu/subcategories/:id');
check(/deleteSubcategory: \(id, moveToSubcategoryId\) =>/.test(menuApi) && /moveToSubcategoryId !== undefined/.test(menuApi),
  'frontend deletes through DELETE /menu/subcategories/:id?moveToSubcategoryId=');
check(menuRoutes.indexOf('"/subcategories"') < menuRoutes.indexOf('"/:id"'),
  'subcategory routes are registered BEFORE /:id (no capture by the menu-item route)');
check(/findOwnedCategory/.test(menuController) && /restaurantId: req\.user\.restaurantId/.test(menuController),
  'backend scopes every subcategory statement to the caller restaurant');
check(/`This subcategory still has \$\{itemCount\} menu item\(s\)\. Reassign them first/.test(menuController),
  'backend refuses to delete a referenced subcategory without a destination');
check(/Target subcategory not found in this category/.test(menuController),
  'backend validates the reassignment target (same category, same tenant)');

console.log(`\n${'='.repeat(60)}\n  subcategory-manage-ui: ${pass} passed, ${fail} failed\n${'='.repeat(60)}`);
if (fail > 0) process.exit(1);
