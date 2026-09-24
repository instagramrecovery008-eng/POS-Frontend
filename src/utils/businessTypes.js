/**
 * Business Type ↔ Plan Mode helpers (UI display only).
 *
 * The AUTHORITATIVE mapping lives on the backend
 * (restaurant-pos-backend/src/utils/businessMode.js) — every plan assignment
 * is re-validated server-side. This module mirrors that mapping purely so the
 * UI can filter plan cards and label modes without a round-trip. Never trust
 * these values for security decisions; the backend rejects incompatible
 * combinations with: "Selected plan is not available for the selected
 * business type."
 *
 * The THREE plan modes (internal enum values = Prisma BusinessMode):
 *   RESTAURANT     — full restaurant ops (tables/floors/KOT/kitchen)
 *   BASIC_POS      — food-business quick billing (café/bar/bakery/…)
 *   QUICK_BILLING  — retail quick billing (supermarket/clothing/electronics/…)
 */

export const BUSINESS_TYPES = [
  // Food service
  { value: "RESTAURANT", label: "Restaurant", group: "Food Service", mode: "RESTAURANT" },
  { value: "FOOD_COURT", label: "Food Court", group: "Food Service", mode: "RESTAURANT" },
  { value: "CAFE", label: "Café", group: "Food Service", mode: "BASIC_POS" },
  { value: "BAKERY", label: "Bakery", group: "Food Service", mode: "BASIC_POS" },
  { value: "BAR", label: "Bar / Pub", group: "Food Service", mode: "BASIC_POS" },
  { value: "FOOD_TRUCK", label: "Food Truck / Quick Service", group: "Food Service", mode: "BASIC_POS" },
  { value: "CLOUD_KITCHEN", label: "Cloud Kitchen", group: "Food Service", mode: "BASIC_POS" },
  // Retail
  { value: "SUPERMARKET", label: "Supermarket / Grocery", group: "Retail", mode: "QUICK_BILLING" },
  { value: "GROCERY", label: "Grocery Store", group: "Retail", mode: "QUICK_BILLING" },
  { value: "CLOTHING", label: "Retail / Clothing", group: "Retail", mode: "QUICK_BILLING" },
  { value: "ELECTRONICS", label: "Electronics Store", group: "Retail", mode: "QUICK_BILLING" },
  { value: "FURNITURE", label: "Furniture Store", group: "Retail", mode: "QUICK_BILLING" },
  { value: "HARDWARE", label: "Hardware Store", group: "Retail", mode: "QUICK_BILLING" },
  { value: "COSMETICS", label: "Cosmetics Store", group: "Retail", mode: "QUICK_BILLING" },
  { value: "STATIONERY", label: "Stationery Store", group: "Retail", mode: "QUICK_BILLING" },
  { value: "JEWELLERY", label: "Jewellery Store", group: "Retail", mode: "QUICK_BILLING" },
  { value: "OTHER", label: "Other", group: "Retail", mode: "QUICK_BILLING" },
  // HOTEL removed from new-selection UIs (spec §14). Legacy HOTEL records in
  // the database stay readable — the enum value is not deleted.
];

/** The three plan modes (internal enum values, UI order). */
export const PLAN_MODES = ["RESTAURANT", "BASIC_POS", "QUICK_BILLING"];

/** Mirror of the backend resolveBusinessMode(). Unknown → QUICK_BILLING. */
export function resolveBusinessMode(businessType) {
  if (!businessType) return "QUICK_BILLING";
  const found = BUSINESS_TYPES.find((t) => t.value === businessType);
  if (found) return found.mode;
  // Non-mirror types (e.g. legacy HOTEL) — retail-flavored, never Restaurant.
  return businessType === "RESTAURANT" || businessType === "FOOD_COURT" ? "RESTAURANT" : "QUICK_BILLING";
}

/** Human label for a plan mode (user-facing copy, not the enum). */
export function modeLabel(mode) {
  switch (String(mode || "").toUpperCase()) {
    case "RESTAURANT":
      return "Restaurant Mode";
    case "BASIC_POS":
      return "Basic POS";
    case "QUICK_BILLING":
      return "Basic / Quick Billing";
    default:
      return "Basic / Quick Billing";
  }
}

/** Short badge label (fits table/card chips). */
export function modeBadge(mode) {
  switch (String(mode || "").toUpperCase()) {
    case "RESTAURANT":
      return "RESTAURANT";
    case "BASIC_POS":
      return "BASIC POS";
    case "QUICK_BILLING":
      return "QUICK BILLING";
    default:
      return "QUICK BILLING";
  }
}

/**
 * Keep only plans compatible with the given business type.
 * A plan without a businessMode is treated as RESTAURANT (legacy default).
 * opts.includePlanId — a plan id that is ALWAYS kept (the tenant's current
 * plan): legacy tenants keep seeing/renewing their own plan even after a
 * mapping change re-categorized their business type (mirrors the backend's
 * isCurrentPlan exemption).
 * NOTE: the backend already filters plan lists server-side — this is a
 * display-layer safety net, never the only gate.
 */
export function filterPlansForBusinessType(plans, businessType, opts = {}) {
  const mode = resolveBusinessMode(businessType);
  const keepId = opts.includePlanId != null ? Number(opts.includePlanId) : null;
  return (plans || []).filter(
    (p) => (p.businessMode || "RESTAURANT") === mode || (keepId !== null && Number(p.id) === keepId)
  );
}

/** Group label for a business type (mirrors the backend config groups). */
export function businessTypeGroup(businessType) {
  const found = BUSINESS_TYPES.find((t) => t.value === businessType);
  return found ? found.group : "Other";
}
