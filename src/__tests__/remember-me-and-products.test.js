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

// ═══ 2. BRANDING + PRODUCT REGISTRY ON THE LOGIN PAGE ══════════════════════
section('2. LOGIN PAGE — QWIKOUT branding + live product registry');
const company = read('config/company.js');
const settingApi = read('api/setting.api.js');
const productCardSrc = read('components/product/ProductCard.jsx');

sub('Company and product identity');
check(company.includes('Infinixo Technologies'), 'company name is Infinixo Technologies');
check(company.includes('Technology that moves your business forward.'), 'company tagline present');
check(company.includes('Every Sale, Every Table, One Workspace.'), 'exact product headline present');
check(company.includes('run your restaurant or retail counter from one reliable point of sale'), 'product description present');
check(company.includes('/infinixo-logo.png'), 'real Infinixo logo asset referenced');
check(/name: 'QWIKOUT POS'/.test(company), 'the exact brand spelling QWIKOUT POS is configured');
check(/logo: '\/qwikout-logo\.png'/.test(company), 'the single official logo asset is configured');
check(/logoAlt: 'QWIKOUT POS — Point of Sales by Infinixo Technologies'/.test(company),
  'the logo carries the full accessible alternative text');
check(!/KlarGo POS/.test(company), 'no legacy KlarGo POS name remains in the brand configuration');

sub('Live products come from the public registry (not hardcoded)');
check(settingApi.includes('/products/public'), 'the existing public product endpoint is consumed');
check(/getPublicProducts/.test(settingApi), 'the Setting API exposes the product registry fetch');
check(/throw new Error\(message\)/.test(settingApi), 'API failures are surfaced instead of being swallowed');
check(!/catch \{\s*return \[\]/.test(settingApi), 'the client no longer silently converts errors to an empty list');
check(/Array\.isArray\(json\?\.data\)/.test(settingApi), 'the response shape is validated');
check(/getPublicProducts/.test(loginPage) && /\.then\(\(list\)/.test(loginPage), 'the login page renders the live registry');
check(!/mockProducts|demoProducts|const PRODUCTS = \[/.test(loginPage), 'no placeholder products are invented');

sub('Product cards render and degrade correctly');
check(/productsStatus === 'loading'/.test(loginPage) && /aria-busy="true"/.test(loginPage),
  'a loading state is rendered (accessible busy state)');
check(/productsStatus === 'error'/.test(loginPage) && /Couldn&apos;t load the product catalog/.test(loginPage),
  'a distinct API failure state is rendered (never silently hidden)');
check(/setProductsRetry\(/.test(loginPage) && />\s*Retry\s*</.test(loginPage), 'the error state offers Retry');
check(/No products are published right now/.test(loginPage), 'an explicit empty state is rendered');
check(/products\.map\(\(product\)/.test(loginPage), 'cards are mapped from the API response');
check(/ProductCard/.test(loginPage), 'cards render through the shared ProductCard component');
check(/key=\{product\.id \|\| product\.slug \|\| product\.name\}/.test(loginPage),
  'the registry id/slug/name keys the cards (order preserved)');

sub('The product card only links to a real destination');
check(/new URL\(rawUrl\)/.test(productCardSrc) && /http:' \|\| parsed\.protocol === 'https:'/.test(productCardSrc),
  'only http(s) destinations are accepted');
check(!/COMPANY\.website/.test(productCardSrc), 'no fabricated fallback URL is used');
check(/<a[\s\S]{0,160}target="_blank"[\s\S]{0,80}rel="noreferrer noopener"/.test(productCardSrc),
  'valid destinations render a safe external link');
check(/<article className=\{cardClass\}/.test(productCardSrc), 'cards without a URL are non-interactive');
check(/isCurrent[\s\S]{0,120}border-\[#0866E8\]/.test(productCardSrc), 'the current product gets the brand blue accent');
check(/onError=\{\(\) => setImgError\(true\)\}/.test(productCardSrc), 'a missing product logo degrades gracefully');
check(/max-h-full max-w-full object-contain/.test(productCardSrc), 'the product logo is contained, never distorted');

// ═══ 3. LEFT BRANDING/DESIGN HIERARCHY ═════════════════════════════════════
section('3. LOGIN PAGE — left branding hierarchy (62%)');
const loginPageSrc = fs.readFileSync(path.join(ROOT, 'features/auth/pages/LoginPage.jsx'), 'utf8');
const companySrc = fs.readFileSync(path.join(ROOT, 'config/company.js'), 'utf8');

sub('Content order: logo → headline → description → features → products → attribution');
const idxLogo = loginPageSrc.indexOf('<BrandLogo');
const idxHeadline = loginPageSrc.indexOf('{COMPANY.headline}');
const idxDescription = loginPageSrc.indexOf('{COMPANY.description}');
const idxProducts = loginPageSrc.indexOf('Our Products');
const idxFeatures = loginPageSrc.indexOf('FEATURES.map');
const idxCompany = loginPageSrc.indexOf('{COMPANY.attribution}');
check(idxLogo > 0 && idxLogo < idxHeadline, 'the official logo sits above the headline');
check(idxHeadline < idxDescription && idxDescription < idxFeatures, 'headline and description precede the feature row');
check(idxFeatures < idxProducts && idxProducts < idxCompany, 'the feature row precedes the product section, attribution last');
check(/A product by Infinixo Technologies|\{COMPANY\.attribution\}/.test(loginPageSrc) && idxCompany > idxFeatures,
  'the Infinixo attribution is at the BOTTOM of the panel');

sub('Logo placement — exact asset, no plate, no repeated tagline');
check(/<BrandLogo\s+priority\s+className=/.test(loginPageSrc), 'the logo is the first element using the shared component');
check(!/<BrandLogo[\s\S]{0,160}surface="dark"/.test(loginPageSrc), 'the login logo has no white rectangular plate');
check(!loginPageSrc.includes('{COMPANY.productSubtitle}'), 'the logo tagline is not repeated beneath the logo');
check(/\{COMPANY\.headline\}/.test(loginPageSrc) && /headline:\s*'Every Sale, Every Table, One Workspace\.'/.test(companySrc),
  'the exact reference headline is rendered');
check(/\{COMPANY\.description\}/.test(loginPageSrc), 'the product description is rendered');
check(companySrc.includes("website: 'https://infinixotech.com'"), 'the verified Infinixo domain is used');
check(/attribution:\s*'A product by Infinixo Technologies'/.test(companySrc), 'attribution copy is configured');

sub('Logo asset integrity');
const qwikoutLogoPath = path.resolve(ROOT, '../public/qwikout-logo.png');
check(fs.existsSync(qwikoutLogoPath), 'the official QWIKOUT logo asset exists (frontend/public/qwikout-logo.png)');
const qwikoutBytes = fs.readFileSync(qwikoutLogoPath);
check(qwikoutBytes.slice(1, 4).toString() === 'PNG', 'the QWIKOUT logo is a real PNG (not a placeholder)');
const brandLogo = read('components/common/BrandLogo.jsx');
check(/src=\{BRAND\.logo\}/.test(brandLogo), 'every screen reuses the single configured logo asset');
check(/max-h-full max-w-full object-contain/.test(brandLogo), 'the logo uses object-contain (never stretched or cropped)');
check(/BRAND\.logoAlt/.test(brandLogo) && /QWIKOUT POS — Point of Sales by Infinixo Technologies/.test(company),
  'the logo alt text names the product and company');
check(/surface === 'dark'/.test(brandLogo) && /bg-white/.test(brandLogo),
  'the shared component keeps a neutral plate only where dark surfaces need one');

sub('“Our Products” heading + responsive 2/3/4-column grid');
check(/aria-labelledby="our-products-heading"/.test(loginPageSrc), 'the products section is labelled');
check(/>\s*Our Products\s*</.test(loginPageSrc), 'Our Products heading present');
check(/h-0\.5 w-8 rounded-full bg-gradient-to-r from-\[#0866E8\] to-\[#9228F5\]/.test(loginPageSrc),
  'the heading has the short blue→purple underline');
check(/grid-cols-2[\s\S]{0,80}sm:grid-cols-3[\s\S]{0,80}xl:grid-cols-4/.test(loginPageSrc),
  'cards use two columns on mobile, three on tablet, four on wide screens');

sub('Compact feature row');
check(/label: 'Orders & Billing'/.test(loginPageSrc), 'feature: Orders & Billing');
check(/label: 'Tables & KOT'/.test(loginPageSrc), 'feature: Tables & KOT');
check(!/label: 'Inventory'/.test(loginPageSrc), 'Inventory is not listed in this feature row (module untouched)');
check(/label: 'Reports'/.test(loginPageSrc), 'feature: Reports');
check(/FEATURES\.map\(/.test(loginPageSrc), 'the feature row is data-driven');
check(/flex flex-wrap items-center gap-x-5/.test(loginPageSrc), 'the features render as a compact wrapping row');

sub('Desktop 60/40 split, light surface');
check(/lg:grid-cols-\[minmax\(0,60fr\)_minmax\(0,40fr\)\]/.test(loginPageSrc), 'the desktop grid is 60/40');
check(/bg-\[#F5F8FF\]/.test(loginPageSrc) && /bg-\[#0866E8\]\/10/.test(loginPageSrc),
  'light blue-tinted surface with blue/purple accents');
check(!/bg-gradient-to-br/.test(loginPageSrc), 'no unnecessary dark gradient background');
check(/rounded-2xl border border-slate-200 bg-white p-5 shadow-/.test(loginPageSrc),
  'the login card is white with rounded corners, a border and a soft shadow');

// ═══ 4. RESILIENCE, LOGIN CARD, AUTH CONTRACT, RESPONSIVE ══════════════════
section('4. LOGIN CARD + resilience + responsive contracts');

sub('Login card hierarchy');
check(/\{displayName\}/.test(loginPageSrc), 'the tenant/workspace name is rendered (never hardcoded)');
check(/Secure Login/.test(loginPageSrc), 'the Secure Login indicator is retained');
check(/Sign in to your QWIKOUT POS workspace\./.test(loginPageSrc), 'the product sign-in line is rendered');
check(/<LoginForm/.test(loginPageSrc), 'the existing login form is used');
check(!/onForgotPassword/.test(loginPageSrc), 'no Forgot Password link is wired to the card');
check(!/Forgot Password/.test(loginForm), 'the Forgot Password link is removed from the login form');
check(/>\s*OR\s*</.test(loginPageSrc), 'the OR divider is present');
check(/Create New Account/.test(loginPageSrc), 'the outlined Create New Account action is present');
check(/Privacy Policy/.test(loginPageSrc) && /Terms of Service/.test(loginPageSrc), 'policy links are present');
check(/Infinixo Technologies\. All rights reserved\./.test(loginPageSrc), 'copyright is present');

sub('Password recovery link removed (no invented endpoint, no dead UI)');
check(!/forgotOpen/.test(loginPageSrc), 'the forgot-password dialog state is removed');
check(!/Forgot your password/.test(loginPageSrc), 'the recovery dialog is removed from the card');
check(!/forgotOpen|onForgotPassword/.test(loginForm), 'the form exposes no forgot-password control');

sub('Authentication contract unchanged');
check(/const email = userId\.includes\('@'\) \? userId : `\$\{userId\}@restaurant\.com`/.test(loginPageSrc),
  'a bare user id is still expanded to <id>@restaurant.com');
check(/await login\(email, password, remember\)/.test(loginPageSrc), 'the auth-store login contract is unchanged');
check(/setScreen\(resolveHomeScreen\(user, onboarding\)\)/.test(loginPageSrc), 'role-based redirect resolution is unchanged');
check(/if \(isUnlocked && user\)/.test(loginPageSrc), 'the redirect only runs for an unlocked session');
check(/useSettingsStore\.getState\(\)\.fetchSettings\(\)/.test(loginPageSrc), 'settings still load after login');
check(/setScreen\('register'\)/.test(loginPageSrc), 'Create Account still routes to registration');
check(/PolicyTextModal/.test(loginPageSrc), 'policy modals are preserved');
check(/getPublicProducts/.test(loginPageSrc) && /\.catch\(\(err\)/.test(loginPageSrc),
  'a product API failure is contained and never blocks sign-in');

sub('Responsive layout');
check(/min-h-\[100dvh\] w-full/.test(loginPageSrc), 'the page stacks vertically on mobile with a dvh floor');
check(/lg:grid lg:min-h-\[100dvh\]/.test(loginPageSrc), 'the desktop root is a grid with a dvh floor');
check(!/lg:h-\[100dvh\]|lg:max-h-\[100dvh\]/.test(loginPageSrc),
  'no fixed desktop height that would clip content');
check(/relative order-2 flex[^\"]*overflow-hidden bg-\[#F5F8FF\]/.test(loginPageSrc), 'the branding section stays visible on mobile');
check(!/relative hidden overflow-hidden/.test(loginPageSrc), 'the branding section is not hidden on small screens');
check(/order-1[^\"]*lg:order-2/.test(loginPageSrc), 'the login form is prioritized above the brand panel on mobile');
check(/lg:hidden">\s*<BrandLogo priority className="mx-auto/.test(loginPageSrc), 'a compact centered logo sits above the mobile form');
check(/w-full max-w-\[400px\]/.test(loginPageSrc), 'the login card is fluid with a max width');
check(!/overflow-x-(auto|scroll)/.test(loginPageSrc), 'nothing scrolls horizontally');
check(!/lg:overflow-y-auto/.test(loginPageSrc), 'no internal desktop panel scrollbars (natural document flow)');


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
