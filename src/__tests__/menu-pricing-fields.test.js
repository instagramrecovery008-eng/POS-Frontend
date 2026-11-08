/**
 * Restaurant menu pricing — Add/Edit form contract.
 *
 * A restaurant tenant must see ONLY Non-AC Price and AC Price. The Base Price
 * field is gone (the backend derives the stored base from Non-AC), while every
 * other business type keeps its existing single Price field.
 *
 * Standalone: node src/__tests__/menu-pricing-fields.test.js
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '..');
const read = (rel) => readFileSync(path.join(SRC, rel), 'utf8');

const results = { pass: 0, fail: 0 };
function section(title) { console.log(`\n${'='.repeat(60)}\n  ${title}\n${'='.repeat(60)}`); }
function check(cond, msg) { process.stdout.write(cond ? '  ✅ ' : '  ❌ '); console.log(msg); cond ? results.pass++ : results.fail++; }

const menuPage = read('features/masters/menu/pages/MenuPage.jsx');

section('1. No Base Price field exists anywhere in the menu form');
// Comments may mention the removed field; what matters is that no label TEXT
// is rendered (a JSX label always puts the words right after `>`).
check(!/>Base Price/.test(menuPage), 'the label "Base Price" is not rendered');
check(!/'Base Price'/.test(menuPage), 'no conditional Base Price label remains');

section('2. Restaurant tenants get exactly Non-AC + AC');
check(/Non-AC Price \(\{currency\}\) \*/.test(menuPage), 'Non-AC Price is rendered and marked required');
check(/AC Price \(\{currency\}\)/.test(menuPage), 'AC Price is rendered');
const restaurantBlock = menuPage.slice(
  menuPage.indexOf('{acNonAcPricing ? ('),
  menuPage.indexOf(') : (', menuPage.indexOf('{acNonAcPricing ? ('))
);

check(restaurantBlock.includes('Non-AC Price') && restaurantBlock.includes('AC Price'),
  'both price fields live in the restaurant branch');
check(!/Price \(\{currency\}\) \*?</.test(restaurantBlock.replace(/Non-AC Price|AC Price/g, '')),
  'the restaurant branch has no third, generic Price field');

section('3. Other business types keep the single Price field');
// The non-restaurant branch is the `) : (` arm of the same ternary — a fixed
// window past it is enough to assert what that arm renders.
const otherStartIdx = menuPage.indexOf(') : (', menuPage.indexOf('{acNonAcPricing ? ('));
const otherBlock = menuPage.slice(otherStartIdx, otherStartIdx + 900);
check(/>Price \(\{currency\}\) \*/.test(otherBlock), 'the non-restaurant branch renders the original Price field');
check(!/Non-AC Price/.test(otherBlock), 'the non-restaurant branch has no AC / Non-AC fields');

section('4. Submission derives the stored base price');
check(/price: acNonAcPricing \? toNumber\(itemNonAcPrice\) : toNumber\(itemPrice\)/.test(menuPage),
  'restaurant payloads send the Non-AC price as the base price');
check(/nonAcPrice: toNumber\(itemNonAcPrice\)/.test(menuPage), 'the Non-AC price is always submitted');
check(/acPrice: itemAcPrice === '' \? null : toNumber\(itemAcPrice\)/.test(menuPage),
  'a blank AC price is submitted as null (backend mirrors the base)');

section('5. Validation matches the visible fields');
check(/Please enter a Non-AC price greater than 0/.test(menuPage),
  'restaurant validation requires a Non-AC price');
check(/if \(acNonAcPricing\) \{[\s\S]{0,700}else \{[\s\S]{0,400}Please enter a price greater than 0/.test(menuPage),
  'the single-price validation is kept for other business types');

section('6. Editing prefills both prices (no base-price dependency)');
check(/setItemNonAcPrice\(item\.nonAcPrice != null \? String\(item\.nonAcPrice\) : ''\)/.test(menuPage),
  'the edit handler prefills the Non-AC price');
check(/setItemAcPrice\(item\.acPrice != null \? String\(item\.acPrice\) : ''\)/.test(menuPage),
  'the edit handler prefills the AC price');

console.log(`\n${'='.repeat(60)}`);
console.log(`RESULTS: PASSED ${results.pass}  FAILED ${results.fail}`);
if (results.fail) process.exit(1);
