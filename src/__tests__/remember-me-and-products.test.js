/**
 * Remember Me session persistence + login-page product registry UI.
 *
 * Static contract tests:
 *  1. Remember Me — WHERE the session lives (localStorage vs sessionStorage),
 *     never a password, and the auth-store/API interplay stays intact.
 *  2. Login page — data-driven "Our Products" (active-only public endpoint),
 *     safe link attributes, logo fallback, company-level branding.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

let pass = 0, fail = 0;
const section = (t) => console.log(`\n${'='.repeat(64)}\n  ${t}\n${'='.repeat(64)}`);
const sub = (t) => console.log(`\n-- ${t}`);
const check = (cond, msg) => { process.stdout.write(cond ? '  ✅ ' : '  ❌ '); console.log(msg); cond ? pass++ : fail++; };
const eq = (actual, expected, label) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  process.stdout.write(ok ? '  ✅ ' : '  ❌ ');
  console.log(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  ok ? pass++ : fail++;
};
// Tests live in src/__tests__/ — source paths resolve from src/.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// ═══ 1. REMEMBER ME ════════════════════════════════════════════════════════
section('1. REMEMBER ME — session persistence strategy');
const authStore = read('store/authStore.js');
const axiosSrc = read('api/axios.js');
const loginForm = read('features/auth/components/LoginForm.jsx');
const loginPage = read('features/auth/pages/LoginPage.jsx');

sub('Checkbox present and functional');
check(/id="remember-me"/.test(loginForm) && /type="checkbox"/.test(loginForm), 'Remember Me checkbox rendered in the login form');
check(/onRememberChange/.test(loginForm) && /onRememberChange=\{setRememberMe\}/.test(loginPage), 'checkbox state flows to the page and store handler');
check(/onSubmit\(userId\.trim\(\), password, rememberMe\)/.test(loginForm), 'the choice is passed to the login handler');
check(/rememberMe=\{rememberMe\}/.test(loginPage), 'the page feeds the store-backed value back into the form');

sub('Where the session lives (never its length)');
check(/sessionStorages/.test(authStore), 'storage selection helper exists (localStorage vs sessionStorage)');
check(/persistSession\(resp\.token, resp\.user, remember\)/.test(authStore), 'login persists through the remember-aware helper');
check(/sessionStorage/.test(authStore), 'unchecked → sessionStorage (cleared when the tab closes)');
check(/secondary\.removeItem/.test(authStore), 'the non-chosen storage is always cleared (no stale-session resurrection)');
check(!/expiresIn|jwtExpiration/i.test(authStore), 'Remember Me never extends JWT validity (backend expiry governs)');

sub('Credential hygiene unchanged');
check(!/localStorage\.setItem\([^)]*password/i.test(authStore), 'no password is written to localStorage');
check(!/sessionStorage\.setItem\([^)]*password/i.test(authStore), 'no password is written to sessionStorage');
check(/STORAGE_KEY_TOKEN/.test(authStore), 'token persistence preserved (existing secure strategy)');

sub('Session restore + expiry stay remember-aware');
check(/const token = loadStoredToken\(\)/.test(authStore), 'restoreSession reads via the remember-aware loader');
check(/clearPersistedSession\(\)/.test(authStore), 'logout and invalid-token paths clear BOTH storages');
check(/login: async \(email, password, rememberMe\)/.test(authStore), 'the auth store accepts the Remember Me choice');
check(/sessionStorage\.getItem\('pos_token'\)/.test(axiosSrc), 'the axios interceptor reads the token from either storage');
check(/pos:session-expired/.test(axiosSrc), 'the 401 session-expiry event survives (existing flow)');

// ═══ 2. PRODUCTS ON THE LOGIN PAGE ═════════════════════════════════════════
section('2. LOGIN PAGE — company branding + product registry');
const company = read('config/company.js');
const settingApi = read('api/setting.api.js');

sub('Company identity (multi-product, not restaurant-only)');
check(company.includes('Infinixo Technologies'), 'company name is Infinixo Technologies');
check(company.includes('Technology that moves your business forward.'), 'company tagline present');
check(company.includes('Your restaurant operations, all in one place.'), 'product headline present');
check(company.includes('/infinixo-logo.png'), 'real Infinixo logo asset referenced (frontend/public/infinixo-logo.png)');

sub('Data-driven "Our Products"');
check(settingApi.includes('/products/public'), 'the public product endpoint is consumed');
check(/getPublicProducts/.test(settingApi), 'the Setting API exposes the product registry fetch');
check(/setProducts\(list\)/.test(loginPage), 'the login page renders the live registry (not static config alone)');
check(/products: \[\]/.test(company), 'no fake products are invented (static fallback is empty)');

sub('Safe external links + graceful logo fallback');
check(/rel="noreferrer noopener"/.test(loginPage), 'product links carry noopener/noreferrer');
check(/e\.currentTarget\.style\.display = 'none'/.test(loginPage), 'a missing product/company logo degrades gracefully (no broken-image glyph)');
check(loginPage.includes('object-contain'), 'the company logo is contained — never stretched, cropped or overflowing');
check(/Secure Login/.test(loginPage), '"Secure Login" label retained on the login card');
check(/KlarGo POS/.test(loginPage), 'KlarGo POS remains clearly identified as the current product');

// ═══ 3. PRODUCT-FIRST LOGIN PANEL ══════════════════════════════════════════
section('3. LOGIN PAGE — KlarGo-first brand panel');
const loginDir = path.resolve(ROOT, 'features/auth/pages');
const loginPageSrc = fs.readFileSync(path.join(loginDir, 'LoginPage.jsx'), 'utf8');
const companySrc = fs.readFileSync(path.join(ROOT, 'config/company.js'), 'utf8');

sub('Product identity is primary, company identity secondary');
check(/headline:\s*'Your restaurant operations, all in one place\.'/.test(companySrc),
  'headline is the required product statement');
check(loginPageSrc.includes('{COMPANY.headline}'), 'the product headline is rendered on the panel');
check(/productName:\s*'KlarGo POS'/.test(companySrc) && loginPageSrc.includes('{COMPANY.productName}'),
  'KlarGo POS is displayed as the product title');
check(/productSubtitle:\s*'Smart restaurant operations, billing, inventory and team management'/.test(companySrc)
  && loginPageSrc.includes('{COMPANY.productSubtitle}'),
  'the product subtitle is rendered under the title');
check(companySrc.includes('Technology that moves your business forward.'),
  'the verified company tagline is retained');
check(/attribution:\s*'A product by Infinixo Technologies'/.test(companySrc), 'company attribution copy is configured');
check(loginPageSrc.includes('{COMPANY.attribution}'), 'the attribution is rendered');
check(/href=\{COMPANY\.website\}[\s\S]{0,160}rel="noreferrer noopener"/.test(loginPageSrc),
  'the attribution links to the verified company website (safe rel)');
check(companySrc.includes("website: 'https://infinixotech.com'"), 'the company website is the verified Infinixo domain');

sub('Official company logo — real asset, contained, never distorted');
const logoPath = path.resolve(ROOT, '../public/infinixo-logo.png');
check(fs.existsSync(logoPath), 'the official Infinixo logo asset exists (frontend/public/infinixo-logo.png)');
const logoBytes = fs.readFileSync(logoPath);
check(logoBytes.slice(1, 4).toString() === 'PNG', 'the logo file is a real PNG (not a placeholder)');
check(/logo:\s*'\/infinixo-logo\.png'/.test(companySrc), 'the panel uses the official logo asset path');
check(/function CompanyLogo/.test(loginPageSrc) && /<CompanyLogo logo=\{COMPANY\.logo\}/.test(loginPageSrc),
  'the company logo renders through a contained image component');
check(/max-h-6 max-w-full object-contain/.test(loginPageSrc), 'company logo is object-contain within max width/height (no stretching/overflow)');
check(/onError=\{\(\) => setFailed\(true\)\}/.test(loginPageSrc), 'a failed logo load is handled (no broken-image glyph)');
check(/const initials = \(name \|\| 'Infinixo Technologies'\)/.test(loginPageSrc),
  'a clean text wordmark/monogram is the fallback when the asset is unavailable');
check(/const PLATFORM_MARK = '\/klargo-icon\.png'/.test(loginPageSrc), 'the KlarGo POS product mark is separate from the company logo');
check(/const DEFAULT_LOGO = '\/klargo-logo\.png'/.test(loginPageSrc), 'the tenant logo fallback is separate from the company logo');
check(/COMPANY\.name/.test(loginPageSrc), 'the company name is shown next to the logo');

sub('Four KlarGo POS feature cards');
const featureCount = (loginPageSrc.match(/\{ icon: [A-Z][A-Za-z]+, title:/g) || []).length;
check(featureCount === 4, `exactly four feature cards are declared (found ${featureCount})`);
check(loginPageSrc.includes('Orders and billing'), 'feature: orders and billing');
check(loginPageSrc.includes('Floors, tables and kitchen tickets'), 'feature: floors, tables and kitchen tickets');
check(loginPageSrc.includes('Inventory, menu and staff'), 'feature: inventory, menu and staff');
check(loginPageSrc.includes('Sales reports and analytics'), 'feature: sales reports and analytics');
check(/FEATURES\.map\(/.test(loginPageSrc), 'the cards are rendered from the feature list');
check(/grid grid-cols-2 gap-2/.test(loginPageSrc), 'the four cards use a compact two-column grid');
check(/min-h-\[64px\]/.test(loginPageSrc), 'cards share a compact minimum height (visually balanced)');

sub('Our Products (rectangular strip, deduplicated)');
check(/Our Products/.test(loginPageSrc), '"Our Products" section heading present');
check(loginPageSrc.includes('Explore'), 'each product card offers an Explore affordance');
check(/visibleProducts\.map\(\(p\) =>/.test(loginPageSrc), 'cards are rendered from the deduplicated list');
check(/href=\{p\.url \|\| COMPANY\.website\}/.test(loginPageSrc), 'a card without a URL falls back to the verified company site (never a dead link)');
check(loginPageSrc.includes('p.isCurrent'), 'the current product (KlarGo POS) is visually distinguished');
check(/dedupeProducts\(products, COMPANY\.products\)/.test(loginPageSrc),
  'the live registry and the configured fallback are deduplicated');
check(/mt-1\.5 flex w-full gap-2 overflow-x-auto overscroll-x-contain/.test(loginPageSrc),
  'products render as a horizontal strip inside its own scroll container');
check(/w-56 shrink-0 items-center gap-2\.5 rounded-xl/.test(loginPageSrc),
  'each product is a compact rectangular card (not a large square)');
check(/\{p\.description && \([\s\S]{0,160}\{p\.description\}/.test(loginPageSrc),
  'each product card shows its short description when available');
check(/\{p\.logo \? \(/.test(loginPageSrc) && /max-h-full max-w-full object-contain/.test(loginPageSrc),
  'each product card shows a contained logo/icon (initial fallback otherwise)');

sub('Product identity sits ABOVE the company identity');
const idxProduct = loginPageSrc.indexOf('{COMPANY.productName}');
const idxHeadline = loginPageSrc.indexOf('{COMPANY.headline}');
const idxFeatures = loginPageSrc.indexOf('FEATURES.map');
const idxProducts = loginPageSrc.indexOf('Our Products');
const idxCompany = loginPageSrc.indexOf('{COMPANY.attribution}');
check(idxProduct > 0 && idxProduct < idxHeadline && idxHeadline < idxFeatures && idxFeatures < idxProducts && idxProducts < idxCompany,
  'panel order is: KlarGo branding → headline → features → products → company footer');
check(/A product by Infinixo Technologies|\{COMPANY\.attribution\}/.test(loginPageSrc) && idxCompany > idxProducts,
  'the Infinixo attribution is at the BOTTOM of the panel');

// ═══ 4. RESILIENCE, AUTH CONTRACT, MOBILE ═══════════════════════════════════
section('4. LOGIN PAGE — resilience, auth contract, mobile layout');

sub('A product-registry / branding failure never breaks sign-in');
check(/getPublicProducts: async \(\) => \{[\s\S]*?catch \{\s*return \[\];/.test(settingApi),
  'a failed products request resolves to an empty list (never throws)');
check(/if \(!cancelled && list && list\.length > 0\)/.test(loginPageSrc),
  'a failed/empty products response keeps the configured fallback');
check(/visibleProducts\.length > 0 && \(/.test(loginPageSrc), 'the products section is optional — it is skipped, not fatal');
check(/<LoginForm/.test(loginPageSrc), 'the login form always renders');
check(/catch \{\s*\/\/ Silently fail — use fallback branding/.test(loginPageSrc),
  'branding failures fall back silently');
check(/branding\.name \|\| COMPANY\.productName/.test(loginPageSrc), 'tenant branding falls back to KlarGo POS');
check(/logo \|\| DEFAULT_LOGO/.test(loginPageSrc), 'a missing tenant logo falls back to the KlarGo mark');
check(/function BusinessLogo/.test(loginPageSrc) && /object-contain/.test(loginPageSrc),
  'the tenant logo is contained inside a fixed shell');

sub('Login request format + role-based redirects unchanged');
check(/const email = userId\.includes\('@'\) \? userId : `\$\{userId\}@restaurant\.com`/.test(loginPageSrc),
  'a bare user id is still expanded to <id>@restaurant.com');
check(/await login\(email, password, remember\)/.test(loginPageSrc), 'the auth-store login contract is unchanged');
check(/setScreen\(resolveHomeScreen\(user, onboarding\)\)/.test(loginPageSrc), 'role-based redirect resolution is unchanged');
check(/if \(isUnlocked && user\)/.test(loginPageSrc), 'the redirect only runs for an unlocked session');
check(/useSettingsStore\.getState\(\)\.fetchSettings\(\)/.test(loginPageSrc), 'settings still load right after a successful login');
check(/setScreen\('register'\)/.test(loginPageSrc), 'Create Account still routes to registration');
check(/PolicyTextModal/.test(loginPageSrc), 'policy links/modals are preserved');
check(!/forgot[- ]?password/i.test(loginPageSrc), 'no invented Forgot Password flow');

sub('Mobile layout — stacked, no horizontal overflow');
check(/className="w-full max-w-\[420px\]/.test(loginPageSrc), 'the login card is fluid with a max width');
// The product strip is the ONLY horizontally scrollable surface (required by the
// design); the page itself must never scroll sideways.
const hScrollSurfaces = (loginPageSrc.match(/overflow-x-(auto|scroll)/g) || []).length;
check(hScrollSurfaces === 1, `only the products strip scrolls horizontally (${hScrollSurfaces})`);
check(/mt-1\.5 flex w-full gap-2 overflow-x-auto/.test(loginPageSrc),
  'that scroll container is the products strip, bounded by the panel width');
check(!/className="[^"]*(flex|min-h)[^"]*overflow-x-auto/.test(loginPageSrc.split('Our Products')[0] || ''),
  'no horizontal scrolling above the products section');
check(/hidden overflow-hidden bg-gradient-to-br[\s\S]{0,120}lg:flex/.test(loginPageSrc),
  'the brand panel is desktop-only (lg+); mobile stacks the form first');
check(/lg:hidden/.test(loginPageSrc), 'a compact mobile brand header replaces the panel on small screens');
check(/min-h-\[100dvh\] w-full flex-col/.test(loginPageSrc), 'the page stacks vertically on mobile with a dvh floor');

sub('Desktop fits 100dvh — no page scrolling, card never clipped');
check(/lg:h-\[100dvh\] lg:max-h-\[100dvh\][\s\S]{0,80}lg:overflow-hidden/.test(loginPageSrc),
  'the desktop root is exactly 100dvh tall and does not scroll');
check(/lg:grid-cols-\[minmax\(0,52fr\)_minmax\(0,48fr\)\]/.test(loginPageSrc),
  'the desktop layout is a two-column grid');
check(/lg:flex lg:min-h-0 lg:flex-col/.test(loginPageSrc),
  'the brand panel is a min-h-0 flex column (its footer stays inside the viewport)');
check(/lg:h-full lg:min-h-0/.test(loginPageSrc),
  'the sign-in column is bounded by the viewport height');
check(/px-8 py-7/.test(loginPageSrc) && !/p-10 xl:p-14|py-12/.test(loginPageSrc),
  'panel padding and page padding are reduced (compact layout)');
check(/rounded-2xl border border-slate-200 bg-white p-5 shadow-/.test(loginPageSrc),
  'the login card uses compact padding');
check(/flex flex-1 flex-col items-center justify-center/.test(loginPageSrc),
  'the login card stays centered in its column');

// ═══ 5. SUPER ADMIN PRODUCTS SCREEN ═════════════════════════════════════════
section('5. SUPER ADMIN — Products Management screen');
const productsScreen = read('features/super-admin/pages/ProductsManagement.jsx');
const superAdminApi = read('api/superAdmin.api.js');

sub('API client contract (unchanged endpoints)');
check(superAdminApi.includes("'/super-admin/products'"), 'list/create endpoint unchanged');
check(/updateProduct: \(id, data\) =>[\s\S]{0,120}\/super-admin\/products\/\$\{id\}/.test(superAdminApi), 'update endpoint unchanged');
check(/toggleProductStatus: \(id\) =>[\s\S]{0,140}\/toggle/.test(superAdminApi), 'activation toggle endpoint unchanged');
check(/deleteProduct: \(id\) =>[\s\S]{0,120}apiClient\.delete/.test(superAdminApi), 'delete endpoint unchanged');

sub('Loading / empty / error / success states');
check(/function ProductsSkeleton/.test(productsScreen) && /aria-busy="true"/.test(productsScreen),
  'a loading skeleton is rendered (accessible busy state)');
check(/No products yet\./.test(productsScreen), 'an explicit empty state is shown');
check(/loadError && products\.length === 0/.test(productsScreen), 'a distinct error state is rendered (never disguised as empty)');
check(productsScreen.includes('Failed to load products'), 'the error state explains the failure');
check(/onClick=\{load\}/.test(productsScreen), 'the error state offers Retry');
check(/function SuccessBanner/.test(productsScreen) && /role="status"/.test(productsScreen),
  'success notifications are announced');
check(/setNotice\(/.test(productsScreen), 'create/update/toggle/delete set a success notification');

sub('Accessible, keyboard-friendly, responsive management UI');
check(/aria-label="Search products"/.test(productsScreen), 'search input has an accessible label');
check(/aria-label=\{`Edit \$\{p\.name\}`\}/.test(productsScreen), 'row actions have accessible labels');
check(/aria-label=\{editing \?/.test(productsScreen), 'the add/edit dialog is labelled');
check(/role="dialog" aria-modal="true"/.test(productsScreen), 'modals are dialogs');
check(/role="switch"/.test(productsScreen) && /aria-checked=\{form\.isActive\}/.test(productsScreen),
  'the activation toggle is a switch with state');
check(/overflow-x-auto/.test(productsScreen) && /min-w-\[760px\]/.test(productsScreen),
  'the table scrolls inside its own container on narrow screens');
check(/Delete “\{confirmDelete\.name\}”\?/.test(productsScreen) && /cannot be undone/.test(productsScreen),
  'deletion requires an explicit confirmation');
check(/disabled=\{p\.isCurrent\}/.test(productsScreen), 'the current product cannot be deleted from the UI');
check(/disabled=\{busyId === p\.id \|\| p\.isCurrent\}/.test(productsScreen), 'the current product cannot be deactivated from the UI');

sub('Form validation (mirrors the backend)');
check(/u\.protocol === 'http:' \|\| u\.protocol === 'https:'/.test(productsScreen),
  'URL validation accepts http(s) only');
check(/\^\[a-z0-9\]\+\(\?:-\[a-z0-9\]\+\)\*\$/.test(productsScreen), 'slug validation is enforced client-side');
check(/if \(name\.length < 2\)/.test(productsScreen), 'short product names are rejected');
check(/setFieldErrors\(errs\)/.test(productsScreen), 'field-level errors are surfaced');
check(/const payload = \{[\s\S]{0,320}isActive: form\.isActive,/.test(productsScreen), 'the save payload matches the API contract');
check(!/localStorage|mockProducts|demoProducts/.test(productsScreen), 'no mock data and no client-side persistence substitute the API');

// ═══ 6. PRODUCT STRIP DEDUPE (pure function) ════════════════════════════════
section('6. PRODUCT STRIP — dedupe across registry + fallback');
const { dedupeProducts, productKey } = await import(pathToFileURL(path.join(ROOT, 'utils/productList.js')).href);

const registry = [
  { id: 1, slug: 'klargo-pos', name: 'KlarGo POS', isCurrent: true },
  { id: 7, slug: 'klargo-inventory', name: 'KlarGo Inventory' },
];
const fallback = [
  { id: 1, slug: 'klargo-pos', name: 'KlarGo POS', isCurrent: true },
  { id: 9, slug: 'klargo-inventory', name: 'KlarGo Inventory (duplicate)' },
];
eq(dedupeProducts(registry, fallback).map((p) => p.slug), ['klargo-pos', 'klargo-inventory'],
  'KlarGo POS is not duplicated when present in both sources');
eq(dedupeProducts(registry, []).length, 2, 'the live registry passes through unchanged');
eq(dedupeProducts([], fallback).length, 2, 'the fallback is used when the registry is empty (its own duplicates removed)');
eq(dedupeProducts([{ slug: 'a', name: 'A' }, { slug: 'A', name: 'A again' }]).length, 1,
  'matching is case-insensitive on the stable slug');
eq(dedupeProducts([{ name: 'Only Name' }, { name: 'Only Name' }]).length, 1,
  'products without a slug/id fall back to their (stable) name');
eq(dedupeProducts([{ name: 'No Slug', id: 3 }, { name: 'No Slug', id: 4 }]).length, 2,
  'distinct ids are distinct products even when the display name matches');
eq(dedupeProducts([{ id: 5 }, { name: '' }, null]).length, 0, 'entries without a usable identity are dropped');
eq(productKey({ slug: ' KlarGo-POS ', name: 'KlarGo POS' }), 'klargo-pos', 'the dedupe key is trimmed + lowercased');
eq(productKey({ id: 42, name: 'Fallback Id' }), '42', 'id is the key when no slug exists');
eq(dedupeProducts([], null, undefined).length, 0, 'missing sources never throw');

eq(dedupeProducts(registry, fallback)[0].isCurrent, true, 'the current product keeps its badge');

console.log(`\n  RESULTS\n  Total: ${pass + fail}   Failed: ${fail} ${fail ? '❌' : '✅'}\n`);
process.exit(fail ? 1 : 0);
