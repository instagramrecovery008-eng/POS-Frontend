/**
 * Dietary mode persistence — frontend regression suite.
 * Standalone (repo pattern): pure-function imports + source-invariant checks.
 *
 * Covers:
 *   1. Menu filter options derive from the persisted restaurant mode
 *      (Veg Only is never offered Veg + Non-Veg / Non-Veg Only)
 *   2. The selected filter is clamped to the restaurant ceiling
 *   3. MenuPage uses the derived options + locked filter for Veg Only
 *   4. The settings store never resets the persisted mode to the default
 *   5. POS Settings only marks the PERSISTED value as active
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  dietaryFilterOptions,
  clampDietaryFilter,
  filterMenuItems,
} from '../utils/menuHierarchy.js';

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
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  process.stdout.write(pass ? '  ✅ ' : '  ❌ ');
  console.log(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  pass ? results.pass++ : results.fail++;
}

// ═══════════════════════════════════════════════
section('1. Filter options derive from the persisted restaurant mode');
const vegOnlyOpts = dietaryFilterOptions('VEG_ONLY');
eq(vegOnlyOpts, [{ value: 'VEG', label: 'Veg Only' }], 'Veg Only → a single Veg Only option');
check(!vegOnlyOpts.some(o => o.value === 'All'), 'Veg Only never offers "Veg + Non-Veg"');
check(!vegOnlyOpts.some(o => o.value === 'NON_VEG'), 'Veg Only never offers "Non-Veg Only"');

const bothOpts = dietaryFilterOptions('VEG_AND_NON_VEG');
eq(bothOpts.map(o => o.value), ['All', 'VEG', 'NON_VEG'], 'Veg + Non-Veg keeps the three options');
eq(bothOpts.map(o => o.label), ['Veg + Non-Veg', 'Veg Only', 'Non-Veg Only'], 'labels unchanged');
eq(dietaryFilterOptions(undefined).map(o => o.value), ['All', 'VEG', 'NON_VEG'], 'missing value → backward-compatible default');
eq(dietaryFilterOptions(null).map(o => o.value), ['All', 'VEG', 'NON_VEG'], 'null value → backward-compatible default');

// ═══════════════════════════════════════════════
section('2. The selected filter is clamped to the restaurant ceiling');
eq(clampDietaryFilter('All', 'VEG_ONLY'), 'VEG', "'All' is clamped to VEG in a Veg Only restaurant");
eq(clampDietaryFilter('NON_VEG', 'VEG_ONLY'), 'VEG', "'Non-Veg Only' is clamped to VEG");
eq(clampDietaryFilter('VEG', 'VEG_ONLY'), 'VEG', "'Veg Only' stays Veg Only");
eq(clampDietaryFilter('All', 'VEG_AND_NON_VEG'), 'All', 'Veg + Non-Veg preserves the selection');
eq(clampDietaryFilter('NON_VEG', 'VEG_AND_NON_VEG'), 'NON_VEG', 'Veg + Non-Veg preserves Non-Veg Only');
eq(clampDietaryFilter(undefined, 'VEG_AND_NON_VEG'), 'All', 'missing selection → All (Veg + Non-Veg)');
eq(clampDietaryFilter('', 'VEG_AND_NON_VEG'), 'All', 'empty selection → All (Veg + Non-Veg)');

// A clamped Veg-only view also filters out prohibited items (local filter).
const menu = [
  { name: 'Paneer Tikka', category: 'Starters', dietaryType: 'VEG' },
  { name: 'Chicken Tikka', category: 'Starters', dietaryType: 'NON_VEG' },
];
eq(filterMenuItems(menu, { dietaryFilter: clampDietaryFilter('All', 'VEG_ONLY') }).map(i => i.name),
  ['Paneer Tikka'], 'the clamped Veg Only view hides non-vegetarian items');
eq(filterMenuItems(menu, { dietaryFilter: clampDietaryFilter('All', 'VEG_AND_NON_VEG') }).length,
  2, 'the Veg + Non-Veg view keeps both');

// ═══════════════════════════════════════════════
section('3. MenuPage derives the filter from the persisted mode');
const menuPage = read('features/masters/menu/pages/MenuPage.jsx');
check(menuPage.includes('dietaryFilterOptions(settings.dietaryMode)'),
  'filter options come from settings.dietaryMode (the persisted value)');
check(menuPage.includes('clampDietaryFilter'), 'the selection is clamped when the mode changes');
check(menuPage.includes('setFilterDietary((prev) => clampDietaryFilter(prev, settings.dietaryMode))'),
  'the clamp re-applies when the mode arrives after mount');
check(menuPage.includes('disabled={restaurantVegOnly}'), 'a Veg Only restaurant cannot switch the filter');
check(!menuPage.includes('<option value="All">Veg + Non-Veg</option>'), 'the hardcoded filter options are gone');
check(/dietaryFilterChoices\.map\(\(opt\)/.test(menuPage), 'the options are rendered from the derived list');
check(menuPage.includes('const restaurantVegOnly = (settings.dietaryMode') ,
  'the Veg Only flag comes from the persisted mode');
check(menuPage.includes('const effectiveVeg = restaurantVegOnly ? true : itemVeg'),
  'Add/Edit Menu Item forces VEG for a Veg Only restaurant');

// ═══════════════════════════════════════════════
section('4. The settings store never resets the persisted mode');
const store = read('store/settingsStore.js');
check(store.includes("dietaryMode: s.dietaryMode === 'VEG_ONLY' || s.dietaryMode === 'VEG_AND_NON_VEG'"),
  'the store keeps the API value and only falls back when it is absent');
check(store.includes("dietaryMode: s.dietaryMode === 'VEG_ONLY' ? 'VEG_ONLY' : 'VEG_AND_NON_VEG'"),
  'a settings SAVE writes back the store value (Veg Only survives a round-trip)');
check(store.includes("dietaryMode: 'VEG_AND_NON_VEG'"), 'the store default stays Veg + Non-Veg (backward compatible)');
const presetsBlock = store.slice(store.indexOf('const BUSINESS_MODE_PRESETS'), store.indexOf('// ── Business-mode normalization'));
check(presetsBlock.length > 100 && !presetsBlock.includes('dietaryMode'),
  'business-mode presets do NOT contain dietaryMode (no silent reset on store init)');

// ═══════════════════════════════════════════════
section('5. POS Settings only marks the persisted value active');
const settingsPage = read('features/settings/pages/SettingsPage.jsx');
check(settingsPage.includes('disabled={loading}'), 'the dietary control is disabled while settings load');
check(settingsPage.includes('!loading && (settings.dietaryMode || \'VEG_AND_NON_VEG\') === value'),
  'nothing is highlighted as active before the persisted value arrives');
check(settingsPage.includes("handleFieldChange('dietaryMode', value)"), 'changing the mode saves through the existing flow');
// Veg Only is the SAVED configuration: POS Settings must present it as active
// and must NOT offer the broader Veg + Non-Veg option to that restaurant.
check(settingsPage.includes('const vegOnlyLocked = !loading && settings.dietaryMode === \'VEG_ONLY\''),
  'the locked state is derived from the persisted Veg Only value');
check(/vegOnlyLocked\s*\?/.test(settingsPage), 'the mode choices are gated by the persisted value');
check(settingsPage.includes('aria-label="Active dietary menu mode: Veg Only'),
  'the active Veg Only state is announced to assistive tech');
check(settingsPage.includes('cannot be broadened here'), 'clear text explains who controls the dietary configuration');
check(settingsPage.includes("[['VEG_ONLY', 'Veg Only'], ['VEG_AND_NON_VEG', 'Veg + Non-Veg']]"),
  'Veg + Non-Veg restaurants keep both configurable modes');

// ═══════════════════════════════════════════════
section('6. Login payload carries the persisted mode');
const authController = readFileSync(path.join(SRC, '..', '..', 'backend/src/controllers/auth.controller.js'), 'utf8');
check(/select: \{[^}]*dietaryMode: true/.test(authController), 'the login settings snapshot includes dietaryMode');
check(read('components/layout/app-shell/AppShell.jsx').includes('fetchSettings()'),
  'the app shell loads the full settings (incl. dietaryMode) after login/session restore');

// ═══════════════════════════════════════════════
console.log(`\nRESULTS: PASSED ${results.pass}  FAILED ${results.fail}`);
process.exit(results.fail ? 1 : 0);
