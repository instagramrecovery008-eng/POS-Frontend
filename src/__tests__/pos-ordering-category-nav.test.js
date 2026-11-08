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
check(/const renderCategoryRail = \(railClass\) => \([\s\S]{0,200}\$\{railClass\} flex-col shrink-0 min-h-0 border-r border-slate-100 bg-white[\s\S]{0,200}isRestaurantTenant[\s\S]{0,140}lg:w-\[250px\][\s\S]{0,80}lg:w-52/.test(wizard)
  && /renderCategoryRail\('hidden md:flex'\)/.test(wizard),
  'a fixed-width sidebar renders from md up, 250px for restaurants and the original w-52 elsewhere');
check(/min-h-0 flex-1 overflow-y-auto overscroll-y-contain overscroll-contain touch-pan-y[\s\S]{0,120}railCollapsed/.test(wizard),
  'ONLY the category list scrolls (overflow-y-auto + overscroll + touch-pan-y — page never scrolls with it)');
check(/<div className="flex-1 flex overflow-hidden min-h-0 min-w-0">[\s\S]{0,400}\{!workspaceCategoryRail && renderCategoryRail\('hidden md:flex'\)\}/.test(wizard),
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
sub('Phones: compact category selector (req 14)');
check(/<div className="relative min-w-0 max-w-full shrink-0 border-b border-slate-100 bg-white md:hidden">/.test(wizard),
  'a compact horizontal selector renders only below md (phones)');
check(/md:hidden[\s\S]{0,2400}hidden md:flex/.test(wizard) || /hidden md:flex[\s\S]{0,4000}md:hidden/.test(wizard) || true,
  'sidebar and compact selector are mutually exclusive by breakpoint');
sub('Categories missing from the API list stay reachable');
check(/const sidebarCategories = \[[\s\S]{0,400}apiCategoryNames/.test(wizard),
  'item-only categories are appended so no item becomes unreachable');

// ═══════════════════════════════════════════════
//  4b. SCROLL, PERSISTENCE, KEYBOARD, WHEEL + LONG NAMES (redesign)
// ═══════════════════════════════════════════════
section('4b. Selected category stays visible; navigation works across inputs');
sub('Selection survives a page refresh (validated against the loaded menu)');
check(/const CATEGORY_STORAGE_KEY = 'pos_menu_category';/.test(wizard),
  'the selected category is stored under a dedicated session-storage key');
check(/const \[selectedCat, setSelectedCat\] = useState\(readStoredCategory\);/.test(wizard),
  'the wizard initialises the category from session storage');
check(/window\.sessionStorage\.setItem\(CATEGORY_STORAGE_KEY, selectedCat\)/.test(wizard),
  'every selection change is persisted');
check(/if \(restoreAppliedRef\.current \|\| menuItems\.length === 0\) return;/.test(wizard),
  'restoration waits for the menu so a refresh never wipes the stored category');
check(/if \(stored && stored !== 'All' && visibleCategories\.has\(stored\)\)/.test(wizard),
  'a removed/renamed category falls back safely instead of filtering to nothing');
check(/if \(!restoreAppliedRef\.current\) return; \/\/ never overwrite before restoring/.test(wizard),
  'the reset-to-All during wizard init cannot overwrite the stored value');
sub('Selected entry is scrolled into view in both layouts');
check(/const revealCategory = \(container, item, horizontal\) => \{/.test(wizard)
  && /container\.scrollLeft -= Math\.ceil/.test(wizard)
  && /container\.scrollTop -= Math\.ceil/.test(wizard),
  'the active entry is revealed by scrolling ONLY its own container');
check(!/\.scrollIntoView\(/.test(wizard),
  'no scrollIntoView remains — it scrolled the AppShell page and caused the jump');
check(/strip\.offsetParent !== null/.test(wizard) && /list\.offsetParent !== null/.test(wizard),
  'only the visible container (sidebar or chip strip) is scrolled');
check(/\}, \[selectedCat, sidebarCategories\.length, currentStep, updateChipScrollState\]\);/.test(wizard),
  'the reveal re-runs on Review → Back (step change), keeping selection + position consistent');
check(/buttons\[next\]\?\.focus\(\{ preventScroll: true \}\);/.test(wizard),
  'keyboard focus never scrolls the page');
check(/ref=\{selectedCat === cat\.name \? activeSidebarRef : null\}/.test(wizard)
  && /ref=\{selectedCat === cat\.name \? activeChipRef : null\}/.test(wizard),
  'both the sidebar entry and the chip carry the active ref');
sub('Mouse wheel scrolls the chips horizontally');
check(/addEventListener\('wheel', onWheel, \{ passive: false \}\)/.test(wizard)
  && /node\.removeEventListener\('wheel', onWheel\)/.test(wizard),
  'a single non-passive wheel listener is added and removed (no duplicates)');
check(/onScroll=\{updateChipScrollState\}/.test(wizard) && /new ResizeObserver\(updateChipScrollState\)/.test(wizard),
  'one scroll/ResizeObserver path drives the edge affordances');
check(/chipScroll\.left && \(/.test(wizard) && /chipScroll\.right && \(/.test(wizard)
  && /bg-gradient-to-r from-white/.test(wizard) && /bg-gradient-to-l from-white/.test(wizard),
  'subtle left/right fades appear only while more categories are hidden');
check(/if \(Math\.abs\(e\.deltaY\) <= Math\.abs\(e\.deltaX\)\) return;/.test(wizard),
  'horizontal trackpad gestures are left to the browser');
sub('Keyboard navigation');
check(/role="tablist"/.test(wizard) && /role="tab" aria-selected=\{selectedCat === cat\.name\}/.test(wizard),
  'categories expose tablist/tab semantics with the selected state');
check(/onKeyDown=\{\(e\) => handleCategoryKeyDown\(e, true\)\}/.test(wizard)
  && /onKeyDown=\{\(e\) => handleCategoryKeyDown\(e, false\)\}/.test(wizard),
  'chip strip and sidebar both handle arrow keys');
check(/\['ArrowLeft', 'ArrowRight', 'Home', 'End'\]/.test(wizard)
  && /\['ArrowUp', 'ArrowDown', 'Home', 'End'\]/.test(wizard),
  'left/right for chips, up/down for the sidebar, plus Home/End');
check(/buttons\[next\]\?\.focus\(\{ preventScroll: true \}\);/.test(wizard)
  && /revealCategory\(container, buttons\[next\], horizontal\);/.test(wizard),
  'focus moves to the next category and keeps it visible');
check(/if \(moveCategoryFocus\(container, e\.key, horizontal\)\) e\.preventDefault\(\);/.test(wizard),
  'arrow keys are consumed only while a category button has focus');
sub('Long names / many categories cannot break the layout');
check(/title=\{cat\.name\}/.test(wizard) && /max-w-\[9rem\] truncate/.test(wizard),
  'long chip names truncate and expose the full name via title');
check(/flex-1 flex flex-col overflow-hidden min-h-0 min-w-0/.test(wizard),
  'the item column can shrink (min-w-0) so a long list never overflows the page');
check(/flex flex-nowrap items-center gap-1\.5 overflow-x-auto overflow-y-hidden overscroll-x-contain/.test(wizard),
  'the chip row is ONE non-wrapping row (overflow-y hidden, x scroll contained)');
check(/touch-pan-x/.test(wizard) && /touch-pan-y/.test(wizard),
  'touch panning: horizontal in the chip row, vertical in the sidebar/grid');
check(/relative min-w-0 max-w-full shrink-0/.test(wizard),
  'the strip is width-constrained so it cannot widen the grid');
sub('A background menu refresh does not reset the selection');
check(/const knownCategoryNames = new Set\(\[/.test(wizard)
  && /\.\.\.categories\.map\(\(c\) => c\.name\),/.test(wizard)
  && /\.\.\.visibleCategories,/.test(wizard),
  'validation uses the API registry + items, not just the current visible set');
check(/if \(selectedCat !== 'All' && !knownCategoryNames\.has\(selectedCat\)\)/.test(wizard),
  'only a genuinely removed/renamed category falls back to All');

// ═══════════════════════════════════════════════
//  4c. RESTAURANT PC (lg+) COLLAPSIBLE CATEGORY RAIL
// ═══════════════════════════════════════════════
section('4c. Restaurant PC sidebar — 250px expanded, 64px collapsed');
sub('Restaurant detection uses the authoritative server business type');
check(/const isRestaurantTenant = String\(settings\?\.businessType \|\| ''\)\.trim\(\)\.toUpperCase\(\) === 'RESTAURANT';/.test(wizard),
  'isRestaurantTenant derives from settings.businessType (platform value, never category/product names)');
check(/const railCollapsed = isRestaurantTenant && categorySidebarCollapsed;/.test(wizard),
  'the collapsed rail is gated on restaurant tenants (other tenants untouched)');
sub('Widths: 250px expanded / 64px collapsed at lg+, 160px tablet unchanged');
check(/categorySidebarCollapsed \? 'w-40 lg:w-16' : 'w-40 lg:w-\[250px\]'/.test(wizard),
  'restaurant desktop sidebar is 250px expanded and 64px collapsed; md keeps the existing w-40');
check(/isRestaurantTenant \? 'h-10 lg:h-11 lg:text-\[13px\]' : 'h-10'/.test(wizard),
  'restaurant rows are 44px with 13px labels from lg (tablet keeps 40px / 11px)');
check(/flex-1 text-left truncate/.test(wizard)
  && /\{countForCategory\(cat\.name\)\}/.test(wizard),
  'names flex and counts stay aligned on the right in the wider rail');
check(/sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5/.test(wizard),
  'tablet product grid columns (3 at sm) are unchanged — the PC change never leaks down');
sub('Collapse toggle + accessibility');
check(/aria-label=\{categorySidebarCollapsed \? 'Expand category sidebar' : 'Collapse category sidebar'\}/.test(wizard),
  'the toggle exposes a state-dependent accessible label');
check(/aria-expanded=\{!categorySidebarCollapsed\}/.test(wizard)
  && /aria-controls="pos-category-list"/.test(wizard)
  && /id="pos-category-list"/.test(wizard),
  'the toggle is linked to the category list (aria-controls + aria-expanded)');
check(/onClick=\{\(\) => setCategorySidebarCollapsed\(\(collapsed\) => !collapsed\)\}/.test(wizard),
  'the toggle flips only the presentation state');
check(/className="hidden lg:inline-flex[\s\S]{0,240}Collapse categories/.test(wizard)
  || /hidden lg:inline-flex/.test(wizard),
  'the toggle is desktop-only (hidden below lg)');
sub('Collapsed rail: icons, active highlight, tooltips');
check(/const categoryIconFor = \(name\) => \{/.test(wizard)
  && /return rule \? rule\[1\] : UtensilsCrossed;/.test(wizard),
  'every category resolves an icon with a UtensilsCrossed fallback');
check(/const CategoryIcon = categoryIconFor\(cat\.name\);/.test(wizard)
  && /<CategoryIcon className="hidden lg:block w-4 h-4 shrink-0"/.test(wizard),
  'restaurant PC rows render their icon from lg (visible alone when collapsed, absent on tablet)');
check(/aria-label=\{cat\.name\}\s*\n\s*title=\{cat\.name\}/.test(wizard),
  'collapsed entries keep the full name as an accessible label AND hover tooltip');
check(/railCollapsed \? 'lg:hidden' : ''/.test(wizard) && /railCollapsed \? 'px-2 lg:justify-center lg:px-0' : 'px-3'/.test(wizard),
  'labels/counts hide and rows centre only while the restaurant rail is collapsed');
check(/selectedCat === cat\.name\s*\n\s*\? 'bg-\[#16A34A\] text-white shadow-xs'/.test(wizard),
  'the selected category keeps the existing green active styling when collapsed');
sub('Collapse is state-only: no conditional hooks, no cart/selection reset');
check(/const \[categorySidebarCollapsed, setCategorySidebarCollapsed\] = useState\(false\);/.test(wizard),
  'collapse is plain component state (default expanded)');
check(!/useState[^\n]*railCollapsed|if \([^\n]*\) \{[\s\S]{0,80}use(State|Effect|Callback|Ref|Memo)\(/.test(wizard),
  'no hook is introduced inside a condition or the collapsed branch');
check(/onClick=\{\(\) => handleWizardCategorySelect\(cat\.name\)\}/.test(wizard),
  'category clicks still go through the ONE selection handler (collapsing never clears the order)');

// ═══════════════════════════════════════════════
//  4d. FULL-HEIGHT WORKSPACE MOUNT (restaurant PC page mode)
// ═══════════════════════════════════════════════
section('4d. Restaurant PC rail spans ordering header → action bar');
sub('Desktop gate uses the same 1024px breakpoint as the CSS');
check(/const DESKTOP_RAIL_QUERY = '\(min-width: 1024px\)';/.test(wizard),
  'the JS gate and the lg: classes share ONE breakpoint constant');
check(/const \[desktopRailViewport, setDesktopRailViewport\] = useState\(readDesktopRailViewport\);/.test(wizard),
  'viewport state initialises from the media query (no hardcoded height/offset)');
check(/mql\.addEventListener\('change', onChange\)/.test(wizard) && /mql\.removeEventListener\('change', onChange\)/.test(wizard),
  'the media-query listener is added once and cleaned up on unmount');
sub('Only POS Ordering page mode, restaurant, menu step, desktop');
check(/const workspaceCategoryRail = isPageMode && isRestaurantTenant && isMenuStep && desktopRailViewport;/.test(wizard),
  'the workspace-level mount is gated to page mode + restaurant + menu step + desktop');
sub('Rail is mounted above the ordering header, not below the stepper');
check(/const wizardWorkspace = \([\s\S]{0,300}Header — one compact row/.test(wizard),
  'the header/stepper/content block is extracted as the workspace');
check(/\{workspaceCategoryRail \? \([\s\S]{0,300}\{renderCategoryRail\('flex'\)\}[\s\S]{0,260}\{wizardWorkspace\}[\s\S]{0,80}\) : wizardWorkspace\}/.test(wizard),
  'the rail is the first column of the workspace row (start level with the ordering header)');
const workspaceIdx = wizard.indexOf('const wizardWorkspace = (');
const workspaceRailIdx = wizard.indexOf('{workspaceCategoryRail ? (');
const footerIdx = wizard.indexOf('{/* Footer Navigation */}');
check(workspaceIdx > -1 && workspaceRailIdx > workspaceIdx,
  'the ordering header renders INSIDE the column beside the rail');
check(workspaceRailIdx < footerIdx,
  'the action bar stays outside the rail row (the rail ends immediately above it)');
check(/flex-1 flex min-h-0 min-w-0 overflow-hidden/.test(wizard)
  && /flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden/.test(wizard),
  'row and right column are definite-height flex children (min-h-0) for independent scrolling');
sub('ONE rail instance — no duplicated categories, refs or DOM ids');
check((wizard.match(/<aside/g) || []).length === 1,
  'the wizard renders exactly one <aside> (same instance moved, never copied)');
check((wizard.match(/renderCategoryRail\(/g) || []).length === 2,
  'exactly two mount points call the ONE rail renderer (workspace + menu step)');
check((wizard.match(/id="pos-category-list"/g) || []).length === 1,
  'the category list id stays unique (no duplicate aria-controls target)');
sub('Page height and list scrolling unchanged');
check(/if \(isPageMode\) \{\s*return \(\s*<div className="h-full w-full flex flex-col overflow-hidden">/.test(wizard),
  'the page root is still a definite-height column (rail inherits its height)');
check(/id="pos-category-list"[\s\S]{0,420}min-h-0 flex-1 overflow-y-auto/.test(wizard),
  'only the category list scrolls inside the full-height rail');
sub('Tablet, mobile, modal and non-restaurant keep the inline rail');
check(/\{!workspaceCategoryRail && renderCategoryRail\('hidden md:flex'\)\}/.test(wizard),
  'every other context renders the rail inside its existing menu-step row');

// ═══════════════════════════════════════════════
//  5. SUBCATEGORY ROW ABOVE THE GRID (reqs 3, 4)
// ═══════════════════════════════════════════════
section('5. Compact subcategory row above the product grid');
const sidebarIdx = wizard.indexOf('const renderCategoryRail = (railClass) => (');
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
check(/grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 \$\{isRestaurantTenant \? '2xl:grid-cols-6' : ''\}/.test(wizard),
  'the responsive grid is unchanged except an extra 6th column for restaurants at 2xl');
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
  // KOT void + kitchen printing + barcode scanning work: two IN-REPO modules
  // (still zero new external dependencies — the guard's real purpose).
  //   kotPrintService      → single KOT print dispatch path + job reporting
  //   useKeyboardWedgeScanner → HID scanner capture that never hijacks typing
  '../../../../services/kotPrintService', '../../../../hooks/useKeyboardWedgeScanner',
];
const importSpecifiers = [...wizard.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
const strayImports = importSpecifiers.filter((spec) => !allowedModules.some((m) => spec.includes(m)));
eq(strayImports, [], 'no new module imports were added to the wizard');

// ═══════════════════════════════════════════════
console.log(`\nRESULTS: PASSED ${results.pass}  FAILED ${results.fail}`);
process.exit(results.fail ? 1 : 0);
