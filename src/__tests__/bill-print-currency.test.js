/**
 * Printed bill currency — renders the REAL generateBillHtml / openBillPrintPreview
 * pipeline in Node. Verifies bills show the bill's own ISO currency (AED / INR /
 * USD), that a reprint keeps its ORIGINAL currency after the company changes
 * its setting, and that nothing falls back to a hardcoded symbol.
 *   node src/__tests__/bill-print-currency.test.js
 */
import { generateBillHtml } from '../services/printService.js';
import { setActiveCurrency } from '../lib/utils.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let passed = 0;
let failed = 0;
const check = (cond, name) => { if (cond) passed++; else { failed++; console.error('  FAIL:', name); } };
const text = (html) => html.replace(/ /g, ' ');

const bill = (currency) => ({
  restaurantName: 'Test Co', billNo: 'BILL-7', orderNo: 'ORD-1', orderType: 'COUNTER_SALE',
  items: [{ quantity: 3, price: 28, total: 84, menuItem: { name: 'Contact Adhesive 1L' } }],
  subtotal: 84, taxAmount: 4.2, discount: 0, serviceCharge: 0, roundOff: -0.2,
  grandTotal: 88, paidAmount: 88, balanceAmount: 0,
  payments: [{ paymentMethod: 'CASH', amount: 88 }],
  currency, date: new Date('2026-11-08T10:00:00Z'),
});

// ── IMBA (AED) ──
setActiveCurrency('AED');
let html = text(generateBillHtml(bill('AED')));
check(html.includes('AED 88.00'), 'AED invoice: grand total "AED 88.00"');
check(html.includes('AED 84.00'), 'AED invoice: line total');
check(!html.includes('₹'), 'AED invoice: no rupee');

// ── INR company ──
setActiveCurrency('INR');
html = text(generateBillHtml(bill('INR')));
check(html.includes('₹88.00') && !html.includes('AED'), 'INR invoice shows ₹');

// ── USD company ──
setActiveCurrency('USD');
html = text(generateBillHtml(bill('USD')));
check(html.includes('$88.00') && !html.includes('₹') && !html.includes('AED'), 'USD invoice shows $');

// ── Reprint keeps the TRANSACTION currency, even after the company switches ──
setActiveCurrency('USD'); // company changed its currency to USD later
html = text(generateBillHtml(bill('AED'))); // old bill, stamped AED
check(html.includes('AED 88.00') && !html.includes('$'), 'reprint of an AED bill still prints AED after the company moved to USD');
setActiveCurrency('AED');
html = text(generateBillHtml(bill('INR')));
check(html.includes('₹88.00') && !html.includes('AED'), 'reprint of an INR bill still prints ₹ while the company is on AED');

// ── Other currencies / precision ──
html = text(generateBillHtml({ ...bill('JPY'), grandTotal: 1650, paidAmount: 1650, subtotal: 1500, taxAmount: 150, items: [{ quantity: 1, price: 1500, total: 1500, menuItem: { name: 'X' } }], payments: [{ paymentMethod: 'CASH', amount: 1650 }], roundOff: 0 }));
check(html.includes('¥1,650'), 'JPY has no decimals');

// ── The normalizer carries the bill currency through the real preview path ──
const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.resolve(here, '../services/printService.js'), 'utf8');
check(/currency: bill\.currency \|\| raw\.currency \|\| identity\.currency/.test(src), 'normalizer reads the bill\'s issued-in currency');
check(/currency: normalized\.currency \|\| restaurantConfig\.currency \|\| getActiveCurrency\(\)/.test(src), 'preview prefers issued-in currency, then the company currency');
check(!src.includes('₹') && !src.includes("'Asia/Kolkata'"), 'printService has no hardcoded ₹ / Asia/Kolkata');
const billing = fs.readFileSync(path.resolve(here, '../features/billing/pages/BillingPage.jsx'), 'utf8');
check(/currency: src\.currency \|\| bill\?\.currency/.test(billing), 'BillingPage passes the bill currency to print');
const active = fs.readFileSync(path.resolve(here, '../features/orders/pages/ActiveOrdersPage.jsx'), 'utf8');
check(/currency: billData\?\.currency \|\| settings\?\.currency/.test(active), 'ActiveOrders reprint passes the bill currency');

console.log(`RESULTS: PASSED ${passed}  FAILED ${failed}`);
if (failed) process.exit(1);
