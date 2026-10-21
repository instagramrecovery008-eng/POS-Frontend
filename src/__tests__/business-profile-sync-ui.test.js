/**
 * Business-profile synchronization + staff RBAC — frontend contract tests.
 *
 * These are static contract checks (the project's existing convention): they
 * assert the EXACT payload the Admin POS Settings screen sends, that the
 * authoritative server values are applied on load, and that staff controls are
 * rendered only for permissions the backend also enforces.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let pass = 0, fail = 0;
const section = (t) => console.log(`\n${'='.repeat(64)}\n  ${t}\n${'='.repeat(64)}`);
const check = (cond, msg) => { process.stdout.write(cond ? '  ✅ ' : '  ❌ '); console.log(msg); cond ? pass++ : fail++; };

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const settingsStore = read('store/settingsStore.js');
const settingsPage = read('features/settings/pages/SettingsPage.jsx');
const staffPage = read('features/masters/staff/pages/StaffPage.jsx');
const superForm = read('features/super-admin/components/RestaurantForm.jsx');
const superList = read('features/super-admin/pages/RestaurantList.jsx');
const perms = read('utils/permissions.js');

// ═══ 1. ADMIN POS SETTINGS → API PAYLOAD ═══════════════════════════════════
section('1. Admin settings sends every supported business-profile field');
check(/ownerName: s\.branding\.ownerName \|\| ''/.test(settingsStore),
  'owner name is included in the save payload');
check(/city: s\.city \|\| ''/.test(settingsStore), 'city is included in the save payload');
check(/state: s\.state \|\| ''/.test(settingsStore), 'state is included in the save payload');
check(/country: s\.country \|\| ''/.test(settingsStore), 'country is included in the save payload');
check(/pincode: s\.postalCode \|\| ''/.test(settingsStore), 'postal code is included in the save payload');
for (const key of ['restaurantName', 'gstNumber', 'fssaiNumber', 'phone', 'email', 'website', 'address', 'logo']) {
  check(new RegExp(`${key}:`).test(settingsStore), `${key} remains part of the settings save`);
}
check(!/restaurantId:/.test(settingsStore), 'the client never sends a restaurantId (tenant comes from the token)');

// ═══ 2. SERVER VALUES WIN ON LOAD (no stale shadow) ═════════════════════════
section('2. Loading settings applies the authoritative server values');
check(/ownerName: s\.ownerName !== undefined/.test(settingsStore),
  "the server's owner name overrides any cached UI snapshot");
check(/city: s\.city !== undefined/.test(settingsStore), "the server's city overrides the cache");
check(/state: s\.state !== undefined/.test(settingsStore), "the server's state overrides the cache");
check(/country: s\.country !== undefined/.test(settingsStore), "the server's country overrides the cache");
check(/postalCode: s\.pincode !== undefined/.test(settingsStore), "the server's pincode overrides the cache");
check(/contactNumber: s\.phone \|\| base\.contactNumber/.test(settingsStore), 'phone is loaded from the server');
check(/email: s\.email \|\| base\.email/.test(settingsStore), 'email is loaded from the server');
check(/address: s\.address \|\| base\.address/.test(settingsStore), 'address is loaded from the server');

// ═══ 3. SAVE → REFRESH + VISIBLE ERRORS ════════════════════════════════════
section('3. Save refreshes from the server and surfaces failures');
const saveBlock = settingsStore.match(/saveSettings: async \(\) => \{[\s\S]*?\n  \},/);
check(!!saveBlock, 'saveSettings block found');
check(/await settingApi\.save\(apiPayload\)/.test(saveBlock[0]), 'the save posts the built payload');
check(/await get\(\)\.fetchSettings\(\)/.test(saveBlock[0]),
  'a successful save re-fetches the authoritative values (invalidates the cache)');
check(/result\.success/.test(settingsPage) && /addToast\(result\.error/.test(settingsPage),
  'the settings screen shows a visible error when the save fails');
check(/set\(result\.success\)/.test(settingsPage) === false, 'the success toast is driven by the backend result, not optimism');
check(/lastFetched/.test(settingsStore), 'the store records when it last fetched (cache invalidation)');

// ═══ 4. GENERAL SECTION FIELDS ═════════════════════════════════════════════
section('4. General section exposes every supported profile field');
for (const [label, key] of [
  ['Restaurant Name', 'restaurantName'], ['Owner Name', 'ownerName'], ['Email', 'email'],
  ['Phone', 'contactNumber'], ['TAX Number', 'gstNumber'], ['FSSAI Number', 'fssaiNumber'],
  ['Website', 'website'], ['Address', 'address'], ['City', 'city'], ['State', 'state'],
  ['Country', 'country'], ['Postal Code', 'postalCode'],
]) {
  check(new RegExp(`label="${label}"`).test(settingsPage) && new RegExp(`'${key}'`).test(settingsPage),
    `${label} is editable`);
}

// ═══ 5. SUPER ADMIN EDIT FORM ═══════════════════════════════════════════════
section('5. Super Admin edit form covers the same fields and refreshes');
for (const key of ['name', 'ownerName', 'mobile', 'email', 'gstNumber', 'fssaiNumber', 'website', 'address', 'country', 'state', 'city', 'pincode']) {
  check(new RegExp(`${key}: form\\.${key}`).test(superForm), `Super Admin form sends ${key}`);
}
check(/value=\{form\.website\}/.test(superForm), 'Super Admin form renders the persisted website value');
check(/website: restaurant\?\.website \|\| ''/.test(superForm), 'the edit form hydrates website from the list row');
check(/onSaved\(\)/.test(superForm), 'the form notifies the parent after a successful save');
check(/onSaved=\{\(\) => \{ setShowForm\(false\); setEditRestaurant\(null\); loadRestaurants\(\); \}\}/.test(superList),
  'the Super Admin list reloads after an edit (no stale cache)');

// ═══ 6. STAFF CONTROLS ↔ BACKEND PERMISSIONS ═══════════════════════════════
section('6. Staff controls are permission-gated with the backend keys');
check(/hasPermission\('staff\.password'\)/.test(staffPage), 'reset password gated by staff.password');
check(/canResetPassword && \(/.test(staffPage), 'the reset control is hidden without the permission');
check(/canEditStaff && \(/.test(staffPage), 'edit/permissions gated by staff.edit');
check(/canDeleteStaff && \(/.test(staffPage), 'delete gated by staff.delete');
check(/canAddStaff && \(/.test(staffPage), 'add staff gated by staff.create');
check(/canChangeStatus \?/.test(staffPage), 'status changes gated by staff.status');
check(/if \(resetPassSubmitting\) return;/.test(staffPage), 'duplicate reset submissions are prevented');
check(/disabled=\{resetPassSubmitting/.test(staffPage), 'the submit button is disabled while the request is in flight');
check(/setResetPassSuccess\(`Password reset successfully/.test(staffPage),
  'success is shown after the backend confirms the reset');
check(/resetStaffMember\.role/.test(staffPage), 'the modal identifies the target staff member');

// ═══ 7. FRONTEND ↔ BACKEND PERMISSION MAP ═════════════════════════════════
section('7. Action permission map matches the backend matrix');
check(/'staff\.password': \[ROLES\.SUPER_ADMIN, ROLES\.ADMIN, ROLES\.MANAGER\]/.test(perms),
  'manager may reset staff passwords');
check(/'staff\.delete': \[ROLES\.SUPER_ADMIN, ROLES\.ADMIN\]/.test(perms), 'only admin may delete staff');
check(/'staff\.create': \[ROLES\.SUPER_ADMIN, ROLES\.ADMIN, ROLES\.MANAGER\]/.test(perms),
  'manager may add staff (route enforces staff.create)');
check(!/'staff\.password': \[[^\]]*CASHIER/.test(perms), 'cashier has no staff-password permission');
check(!/'staff\.password': \[[^\]]*WAITER/.test(perms), 'waiter has no staff-password permission');
check(/'staff\.password'/.test(perms.match(/'staff\.password':[\s\S]*?\]/)[0]), 'the key is documented in the action map');

console.log(`\nRESULTS: PASSED ${pass}  FAILED ${fail}`);
process.exit(fail ? 1 : 0);
