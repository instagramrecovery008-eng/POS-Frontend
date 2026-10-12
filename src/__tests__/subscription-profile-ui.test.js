/**
 * Subscription UI + dietary consistency + user profile dropdown — regression suite.
 * Standalone (repo pattern): pure-function imports + source-invariant checks.
 *
 * Covers:
 *   1. Super Admin subscription list — compact rows, portal action menu,
 *      every action preserved, confirmation routing, responsive container
 *   2. PlanChangeDialog supports the suspend action (confirmation + notes)
 *   3. Dietary mode consistency: item-selection surfaces read the single
 *      server-filtered menu source; the shared filter honors dietaryType
 *   4. Shared UserProfileDropdown — real identity, logout reuse, close
 *      behaviors, accessibility, used by the header for every role
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { filterMenuItems } from '../utils/menuHierarchy.js';
import { getRoleDisplayName, canAccessScreen } from '../utils/permissions.js';

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
section('1. Super Admin subscription list — compact rows + action menu');
const subs = read('features/super-admin/pages/SubscriptionManagement.jsx');

check(subs.includes("import { createPortal } from 'react-dom'"), 'action menu is portal-rendered (escapes table overflow)');
check(subs.includes('sa-subscription-action-dropdown'), 'portal menu has a stable id for outside-click handling');
check(subs.includes('getRowActions'), 'row actions come from one declarative list');
for (const key of ['upgrade', 'downgrade', 'renew', 'suspend', 'activate', 'cancel']) {
  check(subs.includes(`key: '${key}'`), `action preserved: ${key}`);
}
check(subs.includes('MoreVertical'), 'a single three-dot trigger replaces the icon row (constant row height)');
check(subs.includes('aria-haspopup="menu"') && subs.includes('aria-expanded='), 'trigger exposes menu a11y state');
check(subs.includes('aria-label={`Subscription actions for'), 'trigger has a descriptive accessible label');
check(subs.includes('role="menuitem"') && subs.includes('title={label}'), 'each action is a labelled menu item');
check(!/superAdminApi\.(renewSubscription|cancelSubscription|suspendSubscription|activateSubscription)/.test(subs),
  'actions no longer fire directly — all route through the confirmation dialog');
check(subs.includes('setPlanDialog({ subscription: activeSub, mode: key })'), 'selecting an action opens PlanChangeDialog');
check(subs.includes('e.key === \'Escape\''), 'Escape closes the action menu');
check(subs.includes("document.addEventListener('mousedown'"), 'outside click closes the action menu');

check(subs.includes('py-2 px-3'), 'cells use compact vertical padding');
check(subs.includes('whitespace-nowrap'), 'columns do not wrap (stable header/body alignment)');
check(!/flex gap-1 justify-end flex-wrap/.test(subs), 'old wrapping icon group is gone');
check(subs.includes('overflow-x-auto'), 'table lives in a horizontal-scroll container (no page overflow)');
check(subs.includes('min-w-[920px]'), 'table keeps a readable min width and scrolls on narrow viewports');
check(subs.includes('text-right') && subs.includes('text-right font-extrabold'), 'Actions header and body cell align right');
check(subs.includes('viewportW - MENU_WIDTH') && subs.includes('viewportH - menuHeight'), 'action menu is clamped inside the viewport');

// preserved operations
check(subs.includes('placeholder="Search restaurant..."'), 'search preserved');
check(subs.includes('All Plans') && subs.includes('All Status') && subs.includes('All Expiry') && subs.includes('All Cycles'), 'all filters preserved');
check(subs.includes('RefreshCw'), 'refresh preserved');
check(subs.includes('ChevronLeft') && subs.includes('ChevronRight') && subs.includes('pagination'), 'pagination preserved');

// ═══════════════════════════════════════════════
section('2. PlanChangeDialog — suspend confirmation wired');
const dialog = read('features/super-admin/components/PlanChangeDialog.jsx');
check(dialog.includes("suspend: { title: 'Suspend Subscription'"), 'suspend mode has a title/icon');
check(dialog.includes('suspendSubscription(restaurant.id, notes)'), 'suspend calls the existing API');
check(dialog.includes('Suspending pauses access'), 'suspend explains its effect before confirming');
check(dialog.includes('Cancelling will deactivate all users'), 'cancel confirmation message preserved');
check(dialog.includes("mode === 'suspend' ? 'Suspend Subscription'"), 'confirm button is clearly labelled');

// ═══════════════════════════════════════════════
section('3. Dietary mode consistency across item-selection surfaces');
const wizard = read('features/pos/workspace/components/TakeOrderWizard.jsx');
const posWs = read('features/pos/workspace/pages/PosWorkspace.jsx');
const activeOrders = read('features/orders/pages/ActiveOrdersPage.jsx');
const menuApiSrc = read('api/menu.api.js');
check(menuApiSrc.includes("getAll: (params)"), 'menu API exposes the single filtered list endpoint');
check(wizard.includes('menuApi.getAll()'), 'POS wizard reads items from the server-filtered menu endpoint');
check(posWs.includes('menuApi.getAll()'), 'Basic POS reads items from the server-filtered menu endpoint');
check(activeOrders.includes('setShowTakeOrderWizard(true)'), 'Active Orders add-item flow reuses the filtered TakeOrderWizard');
check(wizard.includes('dietaryMenuWhere'), 'POS documents that dietary filtering is enforced server-side');

const menu = [
  { name: 'Paneer Tikka', category: 'Starters', dietaryType: 'VEG', subcategoryId: null },
  { name: 'Chicken Tikka', category: 'Starters', dietaryType: 'NON_VEG', subcategoryId: null },
  { name: 'Legacy Veg', category: 'Starters', isVeg: true, subcategoryId: null },
  { name: 'Legacy Non-Veg', category: 'Starters', isVeg: false, subcategoryId: null },
];
eq(filterMenuItems(menu, { dietaryFilter: 'VEG' }).length, 2, 'VEG filter keeps only vegetarian items (legacy isVeg included)');
eq(filterMenuItems(menu, { dietaryFilter: 'VEG' }).some(i => i.name === 'Chicken Tikka'), false, 'non-veg item cannot survive a VEG filter');
eq(filterMenuItems(menu, { dietaryFilter: 'All' }).length, 4, 'Veg + Non-Veg shows every item');

// ═══════════════════════════════════════════════
section('4. Shared user profile dropdown');
const dropdown = read('components/layout/header/UserProfileDropdown.jsx');
const header = read('components/layout/header/Header.jsx');

check(dropdown.includes('useAuthStore'), 'reads identity from the auth store (never sample data)');
check(dropdown.includes('user?.name') && dropdown.includes('user?.email'), 'renders the real name + email');
check(dropdown.includes('getRoleDisplayName(user?.role)'), 'renders the real role through the shared label map');
check(dropdown.includes('settings?.branding?.restaurantName'), 'shows the restaurant/business name when applicable');
check(!dropdown.includes('example.com') && !dropdown.includes('John Doe'), 'no hardcoded sample details');
check(dropdown.includes('logout()') && dropdown.includes("setScreen('login')"), 'reuses the existing logout + login redirect');
check(!dropdown.includes('localStorage'), 'no second auth/session implementation');
check(dropdown.includes("document.addEventListener('mousedown'") && dropdown.includes('contains(e.target)'), 'closes on outside click');
check(dropdown.includes("e.key === 'Escape'") && dropdown.includes('buttonRef.current?.focus()'), 'Escape closes and restores focus');
check(dropdown.includes('role="menu"') && dropdown.includes('role="menuitem"'), 'menu semantics for keyboard/screen readers');
check(dropdown.includes('aria-haspopup="menu"') && dropdown.includes('aria-expanded='), 'trigger exposes its menu state');
// ── Positioning / clipping (portal + viewport clamping) ──
check(dropdown.includes('createPortal') && dropdown.includes('document.body'), 'the menu renders in a body portal (no ancestor overflow/transform can clip it)');
check(dropdown.includes("position: 'fixed'"), 'the menu is position:fixed so shell overflow-hidden cannot clip it');
check(dropdown.includes('getBoundingClientRect'), 'position is derived from the trigger rect');
check(dropdown.includes('window.innerWidth') && dropdown.includes('window.innerHeight'), 'position is clamped to the viewport');
check(dropdown.includes('VIEWPORT_MARGIN'), 'a viewport margin keeps the menu off the right/bottom edges');
check(dropdown.includes('max-w-[calc(100vw-1rem)]'), 'the menu can never be wider than the viewport');
check(dropdown.includes('menuRef.current?.offsetHeight'), 'the flip decision measures the real menu height');
check(dropdown.includes('spaceBelow') && dropdown.includes('spaceAbove'), 'the menu flips above the trigger when there is no room below');
check(dropdown.includes("addEventListener('scroll'") && dropdown.includes("addEventListener('resize'"), 'the menu re-anchors on scroll and resize');
check(dropdown.includes('visibility: coords ?'), 'the menu is hidden until its position is measured (no 0,0 flash)');
check(dropdown.includes('z-[1000]'), 'the portalled menu stacks above sticky headers and page content');
check(dropdown.includes("e.key === 'ArrowDown'") && dropdown.includes("e.key === 'ArrowUp'"), 'keyboard users can move through the menu items');

check(header.includes('UserProfileDropdown'), 'the shared app shell header uses the dropdown');
check(!header.includes('getInitials'), 'the old non-interactive user area is removed from the header');

// Role coverage — every authenticated role resolves a label and the profile
// action is only offered when the role can actually open the screen.
eq(getRoleDisplayName('SUPER_ADMIN'), 'Super Admin', 'SUPER_ADMIN label');
eq(getRoleDisplayName('ADMIN'), 'Admin', 'ADMIN label');
eq(getRoleDisplayName('MANAGER'), 'Manager', 'MANAGER label');
eq(getRoleDisplayName('CASHIER'), 'Cashier', 'CASHIER label');
eq(getRoleDisplayName('KITCHEN'), 'Kitchen Staff', 'KITCHEN label');
eq(getRoleDisplayName('WAITER'), 'Service Staff', 'WAITER label');
eq(canAccessScreen('ADMIN', 'settings'), true, 'Admin can open Account Details');
for (const role of ['MANAGER', 'CASHIER', 'KITCHEN', 'WAITER']) {
  eq(canAccessScreen(role, 'settings'), false, `${role} shows Sign Out only (no profile screen)`);
}
check(dropdown.includes("isSuperAdmin || canAccessScreen(user?.role, 'settings')"), 'profile entry is capability-gated');

// Sign-out clears the session through the EXISTING mechanism, and protected
// screens stay unreachable once logged out.
const auth = read('store/authStore.js');
const appShell = read('components/layout/app-shell/AppShell.jsx');
check(auth.includes('localStorage.removeItem(STORAGE_KEY_TOKEN)') && auth.includes('localStorage.removeItem(STORAGE_KEY_USER)'), 'logout clears the persisted token + user');
check(/isAuthenticated: false[\s\S]{0,140}isUnlocked: false/.test(auth), 'logout flips the authenticated + unlocked state off');
check(appShell.includes('if (!isUnlocked)') && appShell.includes('return <LoginPage />'), 'logged-out users can only reach the login screen (no protected page)');

// ═══════════════════════════════════════════════
console.log(`\nRESULTS: PASSED ${results.pass}  FAILED ${results.fail}`);
process.exit(results.fail ? 1 : 0);
