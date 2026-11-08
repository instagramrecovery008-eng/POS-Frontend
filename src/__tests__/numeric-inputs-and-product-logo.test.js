/**
 * Numeric inputs + product logo upload — regression tests.
 *
 *  1. The shared numeric helper (sanitizeNumeric / toNumber).
 *  2. Floor / table forms: typing 3 stays 3, clearing stays empty, values are
 *     converted + validated only at submit.
 *  3. Menu form: prices allow decimals, stock/prep time/display order are
 *     integer-only, negatives are rejected before the API call.
 *  4. Super Admin products: logo upload/replace/remove + integer display order.
 *  5. Login product cards: square, contained logo, uploaded image rendered.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

let pass = 0, fail = 0;
const section = (t) => console.log(`\n${'='.repeat(68)}\n  ${t}\n${'='.repeat(68)}`);
const sub = (t) => console.log(`\n-- ${t}`);
const check = (cond, msg) => { process.stdout.write(cond ? '  ✅ ' : '  ❌ '); console.log(msg); cond ? pass++ : fail++; };
const eq = (actual, expected, label) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  process.stdout.write(ok ? '  ✅ ' : '  ❌ ');
  console.log(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  ok ? pass++ : fail++;
};

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// ═══ 1. SHARED HELPER ═══════════════════════════════════════════════════════
section('1. Shared numeric input helper');
const { sanitizeNumeric, toNumber } = await import(pathToFileURL(path.join(ROOT, 'utils/numericHelpers.ts')).href);

sub('sanitizeNumeric — keeps the typed text, drops only padding zeros');
eq(sanitizeNumeric('3'), '3', 'typing 3 stays 3 (never 03)');
eq(sanitizeNumeric('03'), '3', '"03" becomes "3"');
eq(sanitizeNumeric('003'), '3', '"003" becomes "3"');
eq(sanitizeNumeric('00219'), '219', '"00219" becomes "219"');
eq(sanitizeNumeric('0'), '0', 'a lone zero is preserved');
eq(sanitizeNumeric('0.5'), '0.5', '"0.5" is preserved');
eq(sanitizeNumeric('.5'), '0.5', '".5" becomes "0.5"');
eq(sanitizeNumeric(''), '', 'an empty field stays empty (never coerced to 0)');
eq(sanitizeNumeric(null), '', 'null becomes an empty string');
eq(sanitizeNumeric('12.75'), '12.75', 'decimals are preserved verbatim');

sub('toNumber — finite only, empty means 0 at the submit boundary');
eq(toNumber('3'), 3, '"3" → 3');
eq(toNumber('03'), 3, '"03" → 3');
eq(toNumber('12.75'), 12.75, '"12.75" → 12.75');
eq(toNumber(''), 0, 'empty → 0 (submit boundary only)');
eq(toNumber('abc'), 0, 'malformed text never yields NaN');
eq(toNumber(Infinity), 0, 'Infinity never reaches the API');
eq(toNumber(-3), -3, 'negatives pass through (the form/schema rejects them)');

// ═══ 2. FLOOR / TABLE FORMS ═════════════════════════════════════════════════
section('2. Floor / table designer — leading zeros and clearing');
const tablePage = read('features/masters/table/pages/TablePage.jsx');

sub('state is text, not a pre-formatted number');
check(/const \[tableNum, setTableNum\] = useState\('1'\)/.test(tablePage), 'table number state is a string');
check(/const \[tableSeats, setTableSeats\] = useState\('4'\)/.test(tablePage), 'capacity state is a string');
check(/const \[floorSortOrder, setFloorSortOrder\] = useState\('0'\)/.test(tablePage), 'display order state is a string');
check(/onChange=\{\(e\) => setTableNum\(sanitizeNumeric\(e\.target\.value\)\)\}/.test(tablePage),
  'the table number input stores the sanitized STRING (no toNumber per keystroke)');
check(/onChange=\{\(e\) => setTableSeats\(sanitizeNumeric\(e\.target\.value\)\)\}/.test(tablePage),
  'the capacity input stores the sanitized STRING');
check(/onChange=\{\(e\) => setFloorSortOrder\(sanitizeNumeric\(e\.target\.value\)\)\}/.test(tablePage),
  'the display order input stores the sanitized STRING');
check(!/setTableNum\(toNumber\(sanitizeNumeric/.test(tablePage), 'no per-keystroke numeric conversion for the table number');
check(!/setTableSeats\(toNumber\(sanitizeNumeric/.test(tablePage), 'no per-keystroke numeric conversion for capacity');
check(tablePage.includes('padStart'), 'existing DISPLAY padding (e.g. "Table 01" label) is untouched');

sub('conversion + validation happen once, on submit');
check(/const rawTableNo = String\(tableNum\)\.trim\(\)/.test(tablePage), 'the submit handler reads the raw text');
check(/if \(!\/\^\\d\+\$\/\.test\(rawTableNo\)\)/.test(tablePage), 'table numbers must be whole numbers');
check(/if \(!\/\^\\d\+\$\/\.test\(rawSeats\)\)/.test(tablePage), 'capacity must be a whole number');
check(/errs\.capacity = 'Capacity must be at least 1\.'/.test(tablePage), 'a zero/negative capacity is rejected with a field error');
check(/tableNo: tableNoValue/.test(tablePage), 'the API receives the converted table number');
check(/capacity: capacityValue/.test(tablePage), 'the API receives the converted capacity');
check(/const tableNoValue = String\(Number\(rawTableNo\)\)/.test(tablePage), '"3" is submitted as "3" (never padded)');
check(/setFloorSortOrder\(String\(f\.sortOrder \?\? 0\)\)/.test(tablePage), 'editing a floor preserves its stored display order');
check(/setTableNum\(String\(tbl\.tableNo \?\? tbl\.number \?\? ''\)\)/.test(tablePage), 'editing a table preserves its stored number');

// ═══ 3. MENU FORM ═══════════════════════════════════════════════════════════
section('3. Menu form — decimals vs integers');
const menuPage = read('features/masters/menu/pages/MenuPage.jsx');

sub('numeric state is text');
check(/const \[itemPrice, setItemPrice\] = useState\('150'\)/.test(menuPage), 'price state is a string');
check(/const \[itemStockQty, setItemStockQty\] = useState\('50'\)/.test(menuPage), 'stock quantity state is a string');
check(/const \[itemPrepTime, setItemPrepTime\] = useState\('10'\)/.test(menuPage), 'preparation time state is a string');
check(/const \[itemTax, setItemTax\] = useState\('5'\)/.test(menuPage), 'tax state is a string');
check(/const \[catForm, setCatForm\] = useState\(\{ name: '', sortOrder: '0'/.test(menuPage), 'category display order state is a string');
check(!/useState\(150\)/.test(menuPage), 'no numeric initial value that would reformat typed text');

sub('submit-boundary rules');
check(/const priceNum = Number\(itemPrice\)/.test(menuPage), 'the price is converted once at submit');
check(/priceNum <= 0/.test(menuPage), 'a zero/negative price is rejected');
check(/Number\.isFinite\(priceNum\)/.test(menuPage), 'NaN / Infinity prices are rejected');
check(/if \(itemAcPrice !== '' && \(!Number\.isFinite\(Number\(itemAcPrice\)\) \|\| Number\(itemAcPrice\) < 0\)\)/.test(menuPage),
  'a negative AC price is rejected');
// Non-AC is the REQUIRED price in Restaurant mode (there is no Base Price), so
// it is rejected unless it is a finite number greater than zero.
check(/const nonAcNum = Number\(itemNonAcPrice\)/.test(menuPage)
  && /nonAcNum <= 0/.test(menuPage)
  && /Number\.isFinite\(nonAcNum\)/.test(menuPage),
  'a negative (or zero) Non-AC price is rejected');
check(/if \(!\/\^\\d\+\$\/\.test\(raw\)\) \{/.test(menuPage), 'integer-only fields reject decimals/negatives');
check(/taxNum > 100/.test(menuPage), 'tax % is bounded to 0–100');
check(/if \(rawSort !== '' && !\/\^\\d\+\$\/\.test\(rawSort\)\)/.test(menuPage), 'category display order must be a whole number');
check(/if \(!Number\.isFinite\(taxNum\) \|\| taxNum < 0 \|\| taxNum > 100\)/.test(menuPage), 'the tax check is NaN-safe');

// ═══ 4. SUPER ADMIN PRODUCTS — LOGO UPLOAD ══════════════════════════════════
section('4. Super Admin products — image upload / replace / remove');
const products = read('features/super-admin/pages/ProductsManagement.jsx');
const superAdminApi = read('api/superAdmin.api.js');

sub('upload control + preview');
check(/type="file"/.test(products), 'the form renders a file input');
check(/accept="image\/png,image\/jpeg,image\/webp"/.test(products), 'PNG / JPG / WebP are accepted');
check(/const handleLogoFile = async \(e\)/.test(products), 'a file-change handler uploads the image');
check(/URL\.createObjectURL\(file\)/.test(products), 'a local preview is shown before saving');
check(/alt="Product logo preview"/.test(products), 'the preview is rendered as an image');
check(/Replace image/.test(products), 'the user can replace an existing image');
check(/Remove/.test(products), 'the user can remove the image');
check(/onClick=\{handlePickLogo\}/.test(products), 'the upload button opens the file picker');

sub('client-side validation');
check(/if \(!ALLOWED_LOGO_TYPES\.includes\(file\.type\)\)/.test(products), 'file type is validated client-side');
check(/if \(file\.size > MAX_LOGO_BYTES\)/.test(products), 'file size is validated client-side');
check(/const MAX_LOGO_BYTES = 2 \* 1024 \* 1024;/.test(products), 'the limit is 2 MB');
check(/Image size must be less than 2MB\./.test(products), 'an over-size file shows a useful error');

sub('storage + persistence (no base64 in the record)');
check(/superAdminApi\.uploadProductLogo\(editing\.id, fd\)/.test(products), 'the file is uploaded via the multipart endpoint');
check(/fd\.append\('logo', file\)/.test(products), 'the multipart field is named logo');
check(/!trimmedLogo\.startsWith\('blob:'\) \? trimmedLogo : null/.test(products), 'a temporary blob: preview is never persisted');
check(!/data:image/.test(products), 'no base64 data URI is stored in the product record');
check(/await superAdminApi\.removeProductLogo\(editing\.id\)/.test(products), 'removal calls the delete-logo endpoint');
check(/uploadProductLogo: \(id, formData\) =>/.test(superAdminApi), 'the API client exposes the upload endpoint');
check(/removeProductLogo: \(id\) =>/.test(superAdminApi), 'the API client exposes the remove endpoint');

sub('display + fallback');
check(/<ProductLogo logo=\{p\.logo\} name=\{p\.name\} \/>/.test(products), 'the saved image is shown in the product list');
check(/onError=\{\(\) => setFailed\(true\)\}/.test(products), 'a broken image falls back to the initial');
check(/\(name \|\| '\?'\)\.trim\(\)\.charAt\(0\)\.toUpperCase\(\)/.test(products), 'the fallback is the product initial');

sub('display order (integer only)');
check(/const \[form, setForm\] = useState\(EMPTY_FORM\);/.test(products) && /sortOrder: '0'/.test(products), 'display order state is text');
check(/onChange=\{\(e\) => setForm\(\{ \.\.\.form, sortOrder: sanitizeNumeric\(e\.target\.value\) \}\)\}/.test(products),
  'display order keeps the typed text');
check(/errs\.sortOrder = 'Display order must be a whole number \(0 or more\)\.'/.test(products), 'decimals/negatives are rejected');
check(/sortOrder: toNumber\(sanitizeNumeric\(form\.sortOrder\)\)/.test(products), 'the API receives a converted number');

sub('permissions');
check(/router\.use\(protect, authorize\("SUPER_ADMIN"\)\)/.test(read('../../backend/src/routes/company-product.routes.js')),
  'product routes are SUPER_ADMIN-only');
const uploadRoutes = read('../../backend/src/routes/company-product-upload.routes.js');
check(/protect/.test(uploadRoutes) && /authorize\("SUPER_ADMIN"\)/.test(uploadRoutes), 'logo upload requires SUPER_ADMIN');

// ═══ 5. LOGIN PRODUCT CARDS ═════════════════════════════════════════════════
section('5. Login product cards — uploaded images, contained, responsive');
const card = read('components/product/ProductCard.jsx');
const loginPage = read('features/auth/pages/LoginPage.jsx');

check(/const logoSrc = resolveAssetUrl\(logo\)/.test(card), 'the card resolves the stored logo path against the API origin');
check(/src=\{logoSrc\}/.test(card), 'the card renders the product logo path returned by the API');
check(/useState\(false\)/.test(card) && /\{logoSrc && !imgError \? \(/.test(card), 'a missing/failed image falls back to initials');

sub('self-hosted asset paths resolve to the API origin');
const assetUrl = read('utils/assetUrl.js');
check(/value\.startsWith\('\/uploads\/'\)/.test(assetUrl), 'only backend /uploads paths are rewritten');
check(/replace\(\/\\\/api\\\/\?\$\/\s*,\s*''\)/.test(assetUrl), 'the API origin is the base URL without its /api suffix');
check(/\^\(https\?:\)\?\\\/\\\//.test(assetUrl), 'absolute URLs are passed through');
check(/\(blob:\|data:\)/.test(assetUrl), 'blob/data previews are passed through');
check(/resolveAssetUrl\(imagePreview\)/.test(read('features/super-admin/pages/ProductsManagement.jsx')), 'the Super Admin preview resolves stored paths');
check(/const src = resolveAssetUrl\(logo\)/.test(read('features/super-admin/pages/ProductsManagement.jsx')), 'the product list resolves stored paths');
check(/const src = resolveAssetUrl\(logo\)/.test(loginPage), 'the login business logo resolves the tenant logo path');
check(/min-h-\[154px\]/.test(card) && /flex-col/.test(card), 'cards share a consistent vertical layout');
check(/object-contain/.test(card), 'the logo uses object-fit: contain (never cropped)');
check(/grid-cols-2[\s\S]{0,80}sm:grid-cols-3[\s\S]{0,80}xl:grid-cols-4/.test(loginPage),
  'the product grid is responsive (2 / 3 / 4 columns)');
check(!/overflow-x-auto/.test(loginPage), 'the grid wraps instead of scrolling horizontally');

sub('transparent Infinixo logo, icon only');
check(/logo: '\/infinixo-logo\.png'/.test(read('config/company.js')), 'the configured asset is the real Infinixo PNG');
check(fs.existsSync(path.join(ROOT, '../public/infinixo-logo.png')), 'the PNG asset exists on disk');
check(/object-contain/.test(loginPage), 'the logo is contained, never stretched');
check(!/bg-white[^\n]{0,40}<img[^\n]{0,40}infinixo/.test(loginPage), 'the logo is not placed on a white plate');
check(/if \(failed\) return null;/.test(read('components/common/BrandLogo.jsx')),
  'a failed brand asset renders nothing (no broken-image glyph)');

console.log(`\n  RESULTS\n  Total: ${pass + fail}   Failed: ${fail} ${fail ? '❌' : '✅'}\n`);
process.exit(fail ? 1 : 0);
