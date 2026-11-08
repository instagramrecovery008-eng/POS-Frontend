/**
 * Document icons + product card image presentation.
 *   node src/__tests__/document-icons-product-card.test.js
 * Source-level + execution checks (no browser).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

let passed = 0;
let failed = 0;
const check = (cond, name) => { if (cond) passed++; else { failed++; console.error('  FAIL:', name); } };

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.resolve(here, '..', rel), 'utf8');

// ── 1. Central document-icon map ─────────────────────────────────────────────
const icons = read('utils/documentIcons.js');
check(/kot: Ticket,/.test(icons), 'KOT → Ticket icon');
check(/counterSale: ShoppingCart,/.test(icons), 'Counter sale → ShoppingCart icon');
check(/salesInvoice: FileText,/.test(icons), 'Sales invoice → FileText icon');
check(/purchaseOrder: ClipboardList,/.test(icons), 'Purchase order → ClipboardList icon');
check(/receipt: ReceiptText,/.test(icons), 'Receipt → ReceiptText icon');
check(!/UtensilsCrossed|ChefHat|Utensils|Pizza|Coffee/.test(icons.replace(/\/\*[\s\S]*?\*\//g, '')), 'document icon map uses no food/restaurant glyph');
check(/COUNTER_SALE': return DOCUMENT_ICONS\.counterSale/.test(icons.replace(/'/g, "'")) || /case 'COUNTER_SALE': return DOCUMENT_ICONS\.counterSale/.test(icons), 'COUNTER_SALE orders map to the counter-sale icon');

// ── 2. Where the icons are used ──────────────────────────────────────────────
const sidebar = read('components/layout/sidebar/Sidebar.jsx');
check(/label: 'Kitchen Tickets', icon: DOCUMENT_ICONS\.kot/.test(sidebar), 'sidebar: Kitchen Tickets uses the KOT ticket icon');
check(!/UtensilsCrossed/.test(sidebar), 'sidebar: no cutlery icon');
check(/setting: 'enableKitchen'/.test(sidebar.split("label: 'Kitchen Tickets'")[1].split('\n')[0]), 'sidebar: KOT entry stays gated by enableKitchen (restaurant businesses only)');
check(/icon: ShoppingCart/.test(sidebar) && /POS Ordering/.test(sidebar), 'sidebar: POS ordering / counter sale uses the cart icon');
check(!/UtensilsCrossed/.test(read('features/orders/pages/ActiveOrdersPage.jsx')), 'active orders: no cutlery icon');
check(/DOCUMENT_ICONS\.kot/.test(read('features/settings/pages/SettingsPage.jsx')), 'settings: Kitchen & KOT uses the ticket icon');
check(/DOCUMENT_ICONS\.kot/.test(read('features/reports/components/KitchenReports.jsx')), 'reports: KOT register uses the ticket icon');
check(/DOCUMENT_ICONS\.kot/.test(read('features/dashboard/pages/DashboardPage.jsx')) && /DOCUMENT_ICONS\.counterSale/.test(read('features/dashboard/pages/DashboardPage.jsx')), 'dashboard: KOT vs counter-sale notification icons');
const pos = read('features/pos/workspace/pages/PosWorkspace.jsx');
check(!/UtensilsCrossed/.test(pos), 'POS workspace: no cutlery icon');
check(/rule\[1\] : Package/.test(read('features/pos/workspace/components/TakeOrderWizard.jsx')), 'unmatched categories fall back to the generic Package icon');

// ── 3. Product image presentation ────────────────────────────────────────────
const img = read('components/common/ProductImage.jsx');
check(/object-contain/.test(img), 'product images use object-contain (never cropped/stretched)');
check(/loading="lazy"/.test(img) && /decoding="async"/.test(img), 'product images are lazy-loaded and decoded async');
check(/optimizedImageUrl\(/.test(img), 'product images use the optimized/cached rendition');
check(/onError=\{\(\) => setFailed\(true\)\}/.test(img) && /PLACEHOLDER_IMAGE/.test(img), 'broken/missing images fall back to the placeholder');
check(/useEffect\(\(\) => \{ setFailed\(false\); \}, \[src\]\)/.test(img), 'a new image URL gets a fresh chance to load');

const ph = read('lib/imagePlaceholder.ts');
check(/NO IMAGE/.test(ph) && !/ellipse|circle/.test(ph), 'placeholder is a neutral package outline (no food/face imagery)');

// ── 4. POS product card ──────────────────────────────────────────────────────
check(/<ProductImage src=\{item\.image\}/.test(pos), 'POS card renders the shared ProductImage');
check(!/className="w-full h-full object-cover" referrerPolicy/.test(pos), 'POS card no longer crops with object-cover');
check((pos.match(/formatCurrency\(item\.price\)/g) || []).length >= 1, 'POS card price uses the company currency formatter');
check(!/absolute bottom-1\.5 right-1\.5 bg-slate-900\/80/.test(pos), 'no price badge covers the product photo');
check(/item\.minStock \?\? 10/.test(pos), 'low-stock flag uses the product\'s own reorder level');
check(/\} left/.test(pos) && /Out of stock/.test(pos) && /Low Stock/.test(pos), 'POS card shows stock, out-of-stock and low-stock indicator');
check(/item\.subcategoryName \|\| item\.category/.test(pos), 'POS card shows category/subcategory context');
check(/onClick=\{\(\) => addToCart\(item\)\}/.test(pos) && /filteredItems\.map/.test(pos), 'tap-to-add and item filtering are unchanged');

// ── 5. Image URL optimization (execution) ────────────────────────────────────
// assetUrl.js imports a Vite-only config; load it with that one import stubbed.
const stubbed = read('utils/assetUrl.js').replace("import API_BASE_URL from '../config/apiConfig';", "const API_BASE_URL = 'http://localhost:5001/api';");
const tmp = path.join(os.tmpdir(), `assetUrl-test-${process.pid}.mjs`);
fs.writeFileSync(tmp, stubbed);
const { optimizedImageUrl } = await import(pathToFileURL(tmp).href);
fs.unlinkSync(tmp);

const cdn = 'https://res.cloudinary.com/demo/image/upload/v1794150831/menu/1/abc.jpg';
check(optimizedImageUrl(cdn, 360) === 'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_360,c_limit/v1794150831/menu/1/abc.jpg', 'Cloudinary URLs get auto format/quality + width cap');
const already = 'https://res.cloudinary.com/demo/image/upload/w_300,c_fill/v1/abc.jpg';
check(optimizedImageUrl(already, 360) === already, 'URLs that already carry a transformation are left alone');
check(optimizedImageUrl('/uploads/menu/1/a.jpg', 360).endsWith('/uploads/menu/1/a.jpg'), 'local uploads resolve against the API origin');
check(optimizedImageUrl('data:image/svg+xml;charset=utf-8,x', 360).startsWith('data:'), 'data: URLs are untouched');
check(optimizedImageUrl('', 360) === '' && optimizedImageUrl(null, 360) === '', 'empty/null input is safe');

console.log(`RESULTS: PASSED ${passed}  FAILED ${failed}`);
if (failed) process.exit(1);
