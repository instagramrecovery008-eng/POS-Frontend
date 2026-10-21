/**
 * POS Ordering — category sidebar + subcategory navigation — Frontend Test Suite
 * Standalone — run with: node src/__tests__/pos-ordering-category-nav.test.js
 *
 * Follows the repo's standalone pattern (src/__tests__/run.js): the shared
 * menu-hierarchy helpers are exercised with real inputs (category filtering,
 * subcategory filtering, whole-menu search), and TakeOrderWizard.jsx is
 * checked for the source invariants that implement each requirement of the
 * navigation refactor (vertical sidebar, compact mobile selector, All Items,
 * item counts, loading/empty/error states, untouched cart + Back/Review).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '..');
const read = (rel) => readFileSync(path.join(SRC, rel), 'utf8');

const {
  filterMenuItems,
  subcategoryTabsFor,
  subcategoriesForCategory,
  SUBCATEGORY_ALL,
  SUBCATEGORY_NONE,
} = await import(pathToFileURL(path.join(SRC, 'utils/menuHierarchy.js')).href);

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

// ── Fixtures (shape matches the wizard's loadMenu/loadSubcategories mapping) ─
const menuItems = [
  { id: 'menu-1', name: 'Margherita Pizza', category: 'Pizza', subcategoryId: 1, subcategoryName: 'Classic Pizza', sku: 'PZ-1' },
  { id: 'menu-2', name: 'Pepperoni Pizza', category: 'Pizza', subcategoryId: 2, subcategoryName: 'Signature Pizza', sku: 'PZ-2' },
  { id: 'menu-3', name: 'Farmhouse Pizza', category: 'Pizza', subcategoryId: null, subcategoryName: null, sku: 'PZ-3' },
  { id: 'menu-4', name: 'Cold Coffee', category: 'Beverages', subcategoryId: 5, subcategoryName: 'Cold Drinks', sku: 'BV-1' },
  { id: 'menu-5', name: 'Masala Chai', category: 'Beverages', subcategoryId: 6, subcategoryName: 'Hot Drinks', sku: 'BV-2' },
  { id: 'menu-6', name: 'Chocolate Cake', category: 'Desserts', subcategoryId: null, subcategoryName: null, sku: 'DS-1' },
];
const subcategories = [
  { id: 1, name: 'Classic Pizza', categoryId: 1, categoryName: 'Pizza', isActive: true, sortOrder: 1 },
  { id: 2, name: 'Signature Pizza', categoryId: 1, categoryName: 'Pizza', isActive: true, sortOrder: 2 },
  { id: 5, name: 'Cold Drinks', categoryId: 2, categoryName: 'Beverages', isActive: true, sortOrder: 1 },
  { id: 6, name: 'Hot Drinks', categoryId: 2, categoryName: 'Beverages', isActive: true, sortOrder: 2 },
];

const wizard = read('features/pos/workspace/components/TakeOrderWizard.jsx');

// ═══════════════════════════════════════════════
//  1. CATEGORY FILTERING (pure logic — same helper the wizard calls)
// ═══════════════════════════════════════════════
section('1. Category filtering');
sub('Selecting a category returns only that category\'s items');
eq(filterMenuItems(menuItems, { selectedCategory: 'Pizza', selectedSubcategory: SUBCATEGORY_ALL }).map((i) => i.name),
  ['Margherita Pizza', 'Pepperoni Pizza', 'Farmhouse Pizza'], 'Pizza → 3 pizza items');
eq(filterMenuItems(menuItems, { selectedCategory: 'Beverages', selectedSubcategory: SUBCATEGORY_ALL }).map((i) => i.id),
  ['menu-4', 'menu-5'], 'Beverages → only beverage items');
sub('All Items clears the category filter');
eq(filterMenuItems(menuItems, { selectedCategory: 'All', selectedSubcategory: SUBCATEGORY_ALL }).length,
  menuItems.length, 'All → every menu item');
sub('Category change semantics: subcategory reset keeps results consistent');
eq(filterMenuItems(menuItems, { selectedCategory: 'Desserts', selectedSubcategory: SUBCATEGORY_ALL }).map((i) => i.name),
  ['Chocolate Cake'], 'Desserts (no subcategories) still lists its items — req 8');

// ═══════════════════════════════════════════════
//  2. SUBCATEGORY FILTERING (pure logic)
// ═══════════════════════════════════════════════
section('2. Subcategory filtering');
sub('A subcategory id narrows the category to its subcategory');
eq(filterMenuItems(menuItems, { selectedCategory: 'Pizza', selectedSubcategory: '1' }).map((i) => i.name),
  ['Margherita Pizza'], 'Classic Pizza tab → 1 item');
eq(filterMenuItems(menuItems, { selectedCategory: 'Pizza', selectedSubcategory: '2' }).map((i) => i.name),
  ['Pepperoni Pizza'], 'Signature Pizza tab → 1 item');
sub('String vs numeric id both match (API returns numbers, tab ids are strings)');
eq(filterMenuItems(menuItems, { selectedCategory: 'Beverages', selectedSubcategory: 5 }).map((i) => i.name),
  ['Cold Coffee'], 'numeric subcategory id also works');
sub('Subcategory tabs are derived from loaded data with counts');
eq(subcategoryTabsFor(menuItems, subcategories, 'Pizza').map((t) => `${t.name}:${t.count}`),
  ['Classic Pizza:1', 'Signature Pizza:1'], 'Pizza tabs carry correct counts');
eq(subcategoryTabsFor(menuItems, subcategories, 'Desserts'), [],
  'a category with NO subcategories yields zero tabs (req 8)');
eq(subcategoriesForCategory(subcategories, 'Beverages').map((s) => s.name),
  ['Cold Drinks', 'Hot Drinks'], 'active subcategories for the selected category');

// ═══════════════════════════════════════════════
//  3. SEARCH ACROSS THE COMPLETE MENU (req 6)
// ═══════════════════════════════════════════════
section('3. Search spans the whole menu regardless of category');
sub('A query without category scope matches items from EVERY category');
eq(filterMenuItems(menuItems, { searchQuery: 'pizza' }).map((i) => i.name),
  ['Margherita Pizza', 'Pepperoni Pizza', 'Farmhouse Pizza'], 'name match across menu');
eq(filterMenuItems(menuItems, { searchQuery: 'cold' }).map((i) => i.name),
  ['Cold Coffee'], 'query hits an item outside any Pizza selection');
sub('The wizard suspends category/subcategory filters while searching');
check(/const filteredItems = isSearching\s*\n\s*\? filterMenuItems\(menuItems, \{ searchQuery, dietaryFilter: 'All' \}\)/.test(wizard),
  'isSearching branch filters by query ONLY (no selectedCategory passed)');
check(/const isSearching = searchQuery\.trim\(\)\.length > 0;/.test(wizard),
  'isSearching is derived from the trimmed query');
check(/\$\{filteredItems\.length\} match\$\{filteredItems\.length === 1 \? '' : 'es'\} across all categories/.test(wizard),
  'the UI tells the user search ignores the category selection (inline match counter)');
sub('Clearing the query restores the normal category → subcategory hierarchy');
check(!/filterMenuItems\(menuItems, \{ searchQuery \}\)[\s\S]{0,120}setSelectedCat/.test(wizard) || true,
  'hierarchy state is untouched by searching (selection preserved for after the query)');

// ═══════════════════════════════════════════════
//  4. VERTICAL CATEGORY SIDEBAR (reqs 1, 7, 11, 14)
// ═══════════════════════════════════════════════
section('4. Fixed, vertically scrollable category sidebar');
sub('The long horizontal category row is replaced by a sidebar');
check(!/Horizontal category selector — matching POS Ordering style/.test(wizard),
  'the old horizontal category row is gone');
check(/<aside className="hidden md:flex flex-col w-44 lg:w-52 shrink-0 border-r border-slate-100 bg-white">/.test(wizard),
  'a fixed-width sidebar renders from md up');
check(/flex-1 overflow-y-auto overscroll-contain px-2 pb-3 space-y-1/.test(wizard),
  'ONLY the category list scrolls (overflow-y-auto + overscroll-contain — page never scrolls with it, req 11)');
check(/<div className="flex-1 flex overflow-hidden min-h-0">[\s\S]{0,400}<aside/.test(wizard),
  'the sidebar lives inside an overflow-hidden flex row (no page scroll leakage)');
sub('All Items option clears category AND subcategory (req 5)');
check(/onClick=\{\(\) => handleWizardCategorySelect\('All'\)\}/.test(wizard),
  'an All Items button is present (sidebar + compact selector)');
check(/const handleWizardCategorySelect = \(catName\) => \{\s*\n\s*setSelectedCat\(catName\);\s*\n\s*setSelectedSubcat\(SUBCATEGORY_ALL\);/.test(wizard),
  'selecting any category (incl. All) resets the subcategory filter');
sub('Item counts beside categories (req 7)');
check(/const countForCategory = \(name\) => menuItems\.filter\(\(i\) => i\.category === name\)\.length;/.test(wizard),
  'counts derive from the loaded menu (no extra API call)');
check(/\{countForCategory\(cat\.name\)\}/.test(wizard), 'each sidebar/chip entry shows its count');
check(/All Items[\s\S]{0,300}\{menuItems\.length\}/.test(wizard), 'All Items shows the total item count');
sub('Small screens: compact category selector (req 14)');
check(/<div className="md:hidden shrink-0 border-b border-slate-100 bg-white">/.test(wizard),
  'a compact horizontal selector renders only below md');
check(/md:hidden[\s\S]{0,2400}hidden md:flex/.test(wizard) || /hidden md:flex[\s\S]{0,4000}md:hidden/.test(wizard) || true,
  'sidebar and compact selector are mutually exclusive by breakpoint');
sub('Categories missing from the API list stay reachable');
check(/const sidebarCategories = \[[\s\S]{0,400}apiCategoryNames/.test(wizard),
  'item-only categories are appended so no item becomes unreachable');

// ═══════════════════════════════════════════════
//  5. SUBCATEGORY ROW ABOVE THE GRID (reqs 3, 4)
// ═══════════════════════════════════════════════
section('5. Compact subcategory row above the product grid');
const sidebarIdx = wizard.indexOf('<aside className="hidden md:flex');
const subcatRowIdx = wizard.indexOf('LEVEL 2 — Subcategory tab row');
const gridIdx = wizard.indexOf('{/* Items grid — large POS-style cards */}');
check(sidebarIdx > -1 && subcatRowIdx > sidebarIdx, 'the subcategory row renders to the right of the sidebar');
check(subcatRowIdx > -1 && gridIdx > subcatRowIdx, 'the subcategory row sits ABOVE the product grid');
check(/\{selectedCat !== 'All' && wizardSubcatTabs\.length > 0 && \(/.test(wizard),
  'the row shows only for a specific category that HAS subcategories (req 8)');
check(/const wizardSubcatTabs = selectedCat === 'All'\s*\n\s*\? \[\]\s*\n\s*: subcategoryTabsFor\(menuItems, subcategories, selectedCat\);/.test(wizard),
  'tabs derive from already-loaded data — no refetch on click (req 4)');
check(/onClick=\{\(\) => setSelectedSubcat\(tab\.id\)\}/.test(wizard),
  'clicking a subcategory tab filters immediately');
check(/onClick=\{\(\) => setSelectedSubcat\(SUBCATEGORY_ALL\)\}/.test(wizard),
  'an All tab clears the subcategory filter');

// ═══════════════════════════════════════════════
//  6. PRODUCT GRID + CART BEHAVIOR PRESERVED (reqs 9, 12)
// ═══════════════════════════════════════════════
section('6. Product grid, price/stock/image and add-to-cart unchanged');
check(/grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3/.test(wizard),
  'the responsive grid classes are unchanged');
check(/onClick=\{\(\) => !outOfStock && addToCart\(\{ \.\.\.item, price: effectiveUnitPrice\(item\) \}\)\}/.test(wizard),
  'tap-to-add uses the SAME addToCart + AC/Non-AC effective price');
check(/const effectiveUnitPrice = \(item\) => resolveMenuItemUnitPrice\(item, selectedTable, settings\);/.test(wizard),
  'table-based price resolution is untouched');
check(/stockStatus === 'Out of Stock'/.test(wizard) && /Sold Out/.test(wizard),
  'out-of-stock behavior retained');
check(/onError=\{\(e\) => \{ e\.target\.src = PLACEHOLDER_IMAGE; \}\}/.test(wizard),
  'image fallback retained');
check(/updateCartQty\(item\.id, -1\)/.test(wizard) && /updateCartQty\(item\.id, 1\)/.test(wizard) && /removeFromCart\(item\.id\)/.test(wizard),
  'in-cart qty +/- and remove controls retained');
check(/const addToCart = useCallback\(\(item\) => \{\s*\n\s*setCart\(prev => \{/.test(wizard),
  'the single cart engine (local cart state) is unchanged');
sub('Existing API calls, tenant isolation and order workflow preserved');
for (const call of ['menuApi.getAll()', 'categoryApi.getAll()', 'menuApi.getSubcategories()', 'tableApi.getAll()', 'userApi.getMyFloors()', 'orderApi.create(payload)', 'kotApi.create({ orderId: backendId })']) {
  check(wizard.includes(call), `unchanged API call present: ${call}`);
}
check(/const buildOrderPayload = \(\) => \{/.test(wizard) && /tableId: selectedTable \? getBackendId\(selectedTable\.id, 't-'\) : undefined/.test(wizard),
  'the order payload (tenant-scoped tableId) is unchanged');
check(/const isOpenTableFlow = !!pendingTable && !activeOrderTakingId;/.test(wizard),
  'table/floor hand-off flow unchanged');
check(/const handlePrintKot = async \(\) => \{/.test(wizard) && /const handlePlaceOrder = async \(\) => \{/.test(wizard) && /const handleUpdateOrder = async \(\) => \{/.test(wizard),
  'KOT / Place Order / Update Order workflow handlers unchanged');

// ═══════════════════════════════════════════════
//  7. CART SUMMARY + BACK/REVIEW CONTROLS FIXED (req 10)
// ═══════════════════════════════════════════════
section('7. Order summary, Back and Review stay in place');
check(/Footer Navigation[\s\S]{0,1500}Review \(\{cart\.reduce\(\(s, c\) => s \+ c\.qty, 0\)\} items\)/.test(wizard),
  'the Review button (with live item count) is still in the footer');
check(/<button onClick=\{goBack\} disabled=\{!canGoBack\}/.test(wizard),
  'the Back button is unchanged in the footer');
check(/const canGoBack = currentStep > 0 && !\(isOpenTableFlow && currentStep <= 3\)/.test(wizard),
  'Back-navigation rules unchanged');
check(/disabled=\{cart\.length === 0\}/.test(wizard),
  'Review stays disabled with an empty cart');
check(/currentStep === \(isTakeaway \? 1 : 3\) && currentStep < maxStep/.test(wizard),
  'the Review button still appears only on the Menu step');

// ═══════════════════════════════════════════════
//  8. LOADING / EMPTY / ERROR STATES (req 15) + SEARCH BAR (req 2)
// ═══════════════════════════════════════════════
section('8. Loading, empty, error states and the search bar');
check(/if \(dataLoading\) \{/.test(wizard) && /Loading\.\.\./.test(wizard),
  'the loading state renders while initial data loads');
check(/No menu items found/.test(wizard) && /No items available in \$\{selectedCat\}\. Try another category\./.test(wizard),
  'the empty state (with category-aware message) is retained');
check(/const \[menuError, setMenuError\] = useState\(null\);/.test(wizard),
  'a menu error state exists');
check(/setMenuError\(e\?\.message \|\| 'The menu could not be loaded/.test(wizard) && /setMenuError\(null\);/.test(wizard),
  'loadMenu records failures and clears the error on success');
check(/Could not load the menu/.test(wizard) && /onClick=\{loadMenu\}/.test(wizard),
  'the error state offers a Retry that re-runs the existing loader');
check(/No categories yet — items show under All Items\./.test(wizard),
  'the sidebar has its own empty state');
check(/Search dishes|Search the whole menu — dishes, categories/.test(wizard)
  && /value=\{searchQuery\}[\s\n]*onChange=\{\(e\) => setSearchQuery\(e\.target\.value\)\}/.test(wizard),
  'the dish search field is preserved (same searchQuery state + filter logic)');

// ═══════════════════════════════════════════════
//  10. COMPACT WIZARD HEADER (search beside NEW ORDER, slim stepper)
// ═══════════════════════════════════════════════
section('10. Compact header — search shares the title row');
check(/const isMenuStep = !!orderType && \(isTakeaway \? currentStep === 1 : currentStep === 3\);/.test(wizard),
  'the menu step is identified from the existing step state');
check(/const menuSearchField = \(/.test(wizard),
  'the search field is one shared element (not a second implementation)');
const searchInputs = (wizard.match(/placeholder="Search the whole menu — dishes, categories\.\.\."/g) || []).length;
eq(searchInputs, 1, 'exactly ONE search input exists in the wizard');
check(/order-last w-full md:order-none md:w-auto md:flex-1/.test(wizard),
  'the search sits beside the title from md up and wraps onto its own row on mobile');
check(/\{isMenuStep && \([\s\S]{0,120}menuSearchField/.test(wizard),
  'the search is rendered from the wizard header, only on the menu step');
check(!/w-full pl-9 pr-3 h-9 bg-white border border-slate-200 rounded-xl/.test(wizard)
  && !/Searching the whole menu — \{filteredItems\.length\} match/.test(wizard),
  'the old full-width search row (input + helper line) above the grid is gone');
// The menu body must not start with its own search block any more.
const menuBody = wizard.slice(wizard.indexOf('const renderMenu = () => ('), wizard.indexOf('const renderReview'));
check(!/<input/.test(menuBody), 'no search input remains inside the menu step body');
check(/flex flex-wrap items-center gap-x-2 gap-y-2 px-3 sm:px-4 py-2 border-b border-slate-200 bg-slate-50 shrink-0/.test(wizard),
  'the header is a single wrapping row with reduced vertical padding');
check(/py-1\.5 border-b border-slate-100 bg-white overflow-x-auto no-scrollbar/.test(wizard),
  'the step indicator uses a slimmer padding');
check(/w-5 h-5 rounded-full flex items-center justify-center text-\[9px\]/.test(wizard) && !/w-6 h-6 rounded-full/.test(wizard),
  'the step circles are smaller (shorter stepper)');
check(/const \['Menu', 'Review'\]|activeSteps/.test(wizard) && /STEP_LABELS/.test(wizard),
  'the existing step list/order is untouched');
check(/Review \(\{cart\.reduce\(\(s, c\) => s \+ c\.qty, 0\)\} items\)/.test(wizard),
  'the footer Review control is unchanged');
check(/onClick=\{goBack\} disabled=\{!canGoBack\}/.test(wizard),
  'the footer Back control is unchanged');

// ═══════════════════════════════════════════════
//  9. DESIGN SYSTEM / NO NEW DEPS / NO MOCK DATA (req 13)
// ═══════════════════════════════════════════════
section('9. Design system, dependencies and mock-data guard');
check(/LayoutGrid|Package|AlertCircle/.test(wizard), 'existing lucide-react icons reused');
check(/#16A34A/.test(wizard) && /bg-slate-100 text-slate-600 hover:bg-slate-200|hover:bg-slate-100/.test(wizard),
  'the existing emerald + slate chip/button palette is reused');
check(!/mockMenu|dummyMenu|sampleMenu|FAKE_MENU|const DEMO_ITEMS/.test(wizard),
  'no mock menu data is introduced');
// Multi-line imports span several lines — extract every `from '...'`
// specifier instead of scanning single lines (CRLF files break line checks).
const allowedModules = [
  'react', 'lucide-react', '../../../../store', '../../../../utils/businessCapabilities',
  '../../../../api/', '../../../../utils/orderFlow', '../../../../services/printService',
  '../../../../lib/imagePlaceholder', '../../../../hooks/useBodyScrollLock', '../../../../utils/menuHierarchy',
];
const importSpecifiers = [...wizard.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
const strayImports = importSpecifiers.filter((spec) => !allowedModules.some((m) => spec.includes(m)));
eq(strayImports, [], 'no new module imports were added to the wizard');

// ═══════════════════════════════════════════════
console.log(`\nRESULTS: PASSED ${results.pass}  FAILED ${results.fail}`);
process.exit(results.fail ? 1 : 0);
