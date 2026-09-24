/**
 * Shared order-flow resolution helpers (Parts 7/8/9).
 *
 * ONE rule set for both order-entry surfaces:
 *   - Full Restaurant POS       (TakeOrderWizard)
 *   - Basic POS / Quick Billing (PosWorkspace)
 *
 * The frontend helpers only shape the UI flow (which steps to show, what to
 * auto-select). The BACKEND remains authoritative: disallowed order types are
 * 403'd by utils/orderAccess.js and unauthorized floors by utils/floorAccess.js
 * — frontend filtering is convenience only, never security.
 */

/**
 * Resolve which order types the user may place.
 *
 * @param {object} opts
 * @param {string|null} opts.role                 current user's backend role
 * @param {Array|null}  opts.assignedOrderTypes   from /users/me/permissions:
 *                                                  null = unrestricted (legacy/unassigned),
 *                                                  [] = DINE_IN only,
 *                                                  ['TAKEAWAY'] = DINE_IN + TAKEAWAY
 * @param {boolean}     opts.grantLoaded          true once the grant state resolved
 *                                                  (exempt roles resolve immediately)
 * @param {boolean}     opts.floorManagementOff   RestaurantSetting.enableFloorManagement === false
 * @returns {{ types: string[], showSelection: boolean, forcedType: string|null }}
 *   types          — order-type values the UI may offer ('dine_in' | 'takeaway')
 *   showSelection  — whether the Choose-Order-Type screen must render
 *   forcedType     — when selection is skipped, the resolved order type
 *
 * Cases (Part 8):
 *   A) DINE_IN only        → no selection screen, forcedType 'dine_in'
 *   B) TAKEAWAY only       → not reachable here unless floor mgmt off (dine-in
 *                             staff keep dine_in; takeaway grant adds choice)
 *   C) Both                → selection screen with both options
 *   D) Unrestricted        → selection screen with both options (existing behavior)
 *   Floor management OFF   → Basic POS rule: only takeaway-style billing is
 *                             offered (existing PosWorkspace behavior preserved).
 */
export function resolveAvailableOrderTypes({ role, assignedOrderTypes, grantLoaded, floorManagementOff }) {
  const upperRole = String(role || '').toUpperCase();
  const isExempt = ['ADMIN', 'SUPER_ADMIN', 'MANAGER'].includes(upperRole);

  // Floor management disabled → counter/quick-billing style: takeaway only.
  // (This mirrors the existing "Floor Management OFF — only Take Away" rule.)
  if (floorManagementOff) {
    return { types: ['takeaway'], showSelection: false, forcedType: 'takeaway' };
  }

  // Exempt roles keep the full choice (existing behavior).
  if (isExempt) {
    return { types: ['dine_in', 'takeaway'], showSelection: true, forcedType: null };
  }

  // Restricted staff: Dine In is default; the TAKEAWAY grant ADDS takeaway.
  // Grant not loaded yet → defer the decision (caller waits; no premature render).
  if (!grantLoaded) {
    return { types: [], showSelection: false, forcedType: null };
  }
  const hasTakeaway = Array.isArray(assignedOrderTypes) && assignedOrderTypes.includes('TAKEAWAY');
  if (hasTakeaway) {
    // Case C — both available → show selection.
    return { types: ['dine_in', 'takeaway'], showSelection: true, forcedType: null };
  }
  // Case A — DINE_IN only → skip the selection screen entirely.
  return { types: ['dine_in'], showSelection: false, forcedType: 'dine_in' };
}

/**
 * Resolve the floors the user may see/select in the wizard.
 *
 * @param {Array}  floors            floors returned by GET /users/me/floors
 *                                   (already server-scoped: restricted staff get only theirs)
 * @param {boolean} floorsRestricted true when the backend reported restricted=true
 * @returns {{ floors: Array, autoSelectedFloor: Object|null, hasAccess: boolean }}
 *   floors            — floors to render (already narrowed server-side)
 *   autoSelectedFloor — the single permitted floor when exactly one exists
 *                       (Part 7 req. 1: auto-select it; null otherwise)
 *   hasAccess         — false only when a RESTRICTED user has zero floors
 *                       (Part 7 req. 3: configuration message, never other floors)
 */
export function resolveAccessibleFloors(floors, floorsRestricted) {
  const list = Array.isArray(floors) ? floors : [];
  if (floorsRestricted && list.length === 0) {
    return { floors: [], autoSelectedFloor: null, hasAccess: false };
  }
  const auto = list.length === 1 ? list[0] : null;
  return { floors: list, autoSelectedFloor: auto, hasAccess: true };
}
