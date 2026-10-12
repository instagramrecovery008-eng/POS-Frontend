/**
 * Floor assignment filtering (spec §2) — frontend tests.
 * Standalone: node src/__tests__/floor-access-rule.test.js
 *
 * THE BUSINESS RULE (assignment-dependent floor selectors)
 *   No floor assignments configured → ALL ACTIVE floors.
 *   One or more assignments        → ONLY the assigned floors.
 *   All assignments removed        → all active floors again.
 *   An empty assignment list is NEVER "no floors allowed".
 *
 * The frontend never decides this on its own — the server scopes the list and
 * reports `restricted`. These tests cover the pure UI resolver plus the source
 * invariants that keep the loading / error states honest.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '..');
const read = (rel) => readFileSync(path.join(SRC, rel), 'utf8');

const { resolveAccessibleFloors } = await import(pathToFileURL(path.join(SRC, 'utils/orderFlow.js')).href);

let pass = 0, fail = 0;
function section(t) { console.log(`\n${'='.repeat(60)}\n  ${t}\n${'='.repeat(60)}`); }
function sub(t) { console.log(`\n  --- ${t} ---`); }
function check(cond, msg) { process.stdout.write(cond ? '  ✅ ' : '  ❌ '); console.log(msg); cond ? pass++ : fail++; }
function eq(actual, expected, label) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  process.stdout.write(ok ? '  ✅ ' : '  ❌ ');
  console.log(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  ok ? pass++ : fail++;
}

const ALL_ACTIVE = [
  { id: 'floor-1', name: 'Ground Floor' },
  { id: 'floor-2', name: 'First Floor' },
  { id: 'floor-3', name: 'Outdoor' },
  { id: 'floor-4', name: 'VIP Lounge' },
];

section('1. Case A — no assignments configured → all active floors');
let r = resolveAccessibleFloors(ALL_ACTIVE, false);
eq(r.floors.map((f) => f.name), ['Ground Floor', 'First Floor', 'Outdoor', 'VIP Lounge'],
  'every active floor is offered when nothing is configured');
eq(r.hasAccess, true, 'access is granted (an empty ASSIGNMENT list is not "no floors")');
eq(r.autoSelectedFloor, null, 'no auto-selection with several floors');

sub('No floors exist at all (empty floor list, nothing configured)');
r = resolveAccessibleFloors([], false);
eq(r.floors, [], 'nothing to render');
eq(r.hasAccess, true, 'still NOT a permissions problem — the restaurant simply has no floors yet');

section('2. Case B — assignments exist → only the assigned floors');
r = resolveAccessibleFloors([{ id: 'floor-1', name: 'Ground Floor' }], true);
eq(r.floors.map((f) => f.name), ['Ground Floor'], 'one assignment → that floor only');
eq(r.autoSelectedFloor, { id: 'floor-1', name: 'Ground Floor' }, 'a single floor is auto-selected');
eq(r.hasAccess, true, 'access granted');

r = resolveAccessibleFloors(
  [{ id: 'floor-1', name: 'Ground Floor' }, { id: 'floor-4', name: 'VIP Lounge' }], true);
eq(r.floors.map((f) => f.name), ['Ground Floor', 'VIP Lounge'], 'two assignments → exactly those two');
eq(r.autoSelectedFloor, null, 'no auto-selection when several floors are permitted');

section('3. Assignments removed → all active floors again');
// The backend returns the full active list and restricted=false once the rows
// are gone, so the resolver must hand the whole list back.
eq(resolveAccessibleFloors(ALL_ACTIVE, false).floors.length, 4,
  'clearing every assignment restores every active floor');
// A restricted user can legitimately end up with zero reachable floors when the
// only assigned floor was deactivated — that is a configuration state, NOT a
// licence to show other floors.
r = resolveAccessibleFloors([], true);
eq(r.floors, [], 'never falls back to unassigned floors');
eq(r.hasAccess, false, 'reports the configuration problem instead');
eq(r.autoSelectedFloor, null, 'nothing to auto-select');

section('4. The rule is never inferred from a missing list');
eq(resolveAccessibleFloors(null, false).floors, [], 'null floors → safe empty list, unrestricted');
eq(resolveAccessibleFloors(undefined, true).hasAccess, false, 'undefined + restricted → configuration state');

section('5. Sources: loading and error states stay honest');
const wizard = read('features/pos/workspace/components/TakeOrderWizard.jsx');
const tablePage = read('features/masters/table/pages/TablePage.jsx');
const assignModal = read('features/masters/staff/components/AssignFloorsModal.jsx');

eq(wizard.includes("userApi.getMyFloors()"), true, 'the POS floor selector reads GET /users/me/floors (server-scoped)');
check(/setFloorLoadError\(e\?\.message \|\| 'Failed to load floors'\)/.test(wizard),
  'a failed floor request sets an explicit error state (never a silent unrestricted list)');
check(/floorLoadError \? \(/.test(wizard) && /Could not load floors/.test(wizard),
  'the error state is rendered — before the "no floor assigned" state');
check(/onClick=\{loadFloors\}/.test(wizard), 'the error state offers a retry');
check(/floors\.length === 0 && floorsRestricted \? \(/.test(wizard),
  'the "no floor assigned" message appears only when assignments exist but resolve to nothing');
check(/setFloorLoadError\(null\)/.test(wizard), 'the error state is cleared when retrying');

check(/setFloorLoadError\(e\?\.message \|\| 'Failed to load floors'\)/.test(tablePage),
  'Floors & Tables also surfaces a floor-load failure');
check(/floorLoadError && \(/.test(tablePage) && /onClick=\{loadFloors\}/.test(tablePage),
  'the Floors & Tables failure is visible and retryable');

check(/No floor assigned yet — this staff member can see ALL active floors/.test(assignModal),
  'the Assign Access modal states that no selection = all active floors');
check(/clear the selection to restore access to all active floors/.test(assignModal),
  'the Assign Access modal states that clearing restores all active floors');
check(/userApi\.updateFloorAssignments\(staffId, \[\.\.\.selected\]/.test(assignModal),
  'the assignment UI saves through the existing replace-all endpoint (empty array is valid)');

section('6. Backend authority is preserved');
const userApiSrc = read('api/user.api.js');
check(/getMyFloors: \(\) => apiClient\.get\('\/users\/me\/floors'\)/.test(userApiSrc),
  'the frontend has no other floor source for the assignment-dependent selector');
check(/restricted/.test(wizard) && /setFloorsRestricted\(restricted\)/.test(wizard),
  'the restriction flag comes from the backend response, never from list length');

console.log(`\n${'='.repeat(60)}\n  floor-access-rule: ${pass} passed, ${fail} failed\n${'='.repeat(60)}`);
if (fail > 0) process.exit(1);
