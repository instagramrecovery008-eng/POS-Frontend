/**
 * Business Type → Capability resolution (UI mirror).
 *
 * The AUTHORITATIVE source is the backend
 * (restaurant-pos-backend/src/utils/businessCapabilities.js) — the settings API
 * returns `capabilities` resolved server-side from the platform businessType.
 * This module mirrors the same mapping so onboarding (which runs BEFORE a
 * tenant exists) and any component without a settings round-trip can resolve
 * capabilities locally. Never trust these for security decisions; the backend
 * re-derives and enforces them server-side.
 *
 * featureVisible = businessCapability && planCapability && userPermission
 */

export const BUSINESS_CAPABILITIES = {
  RESTAURANT: {
    food: true, dietary: true, kitchen: true, kot: true,
    tables: true, floors: true, menu: true, products: false,
    barcode: true, inventory: true, stock: true, variants: false,
    customers: true,
  },
  // CAFE/BAR are BASIC_POS food businesses (§11): counter workflow with
  // kitchen/KOT, no dine-in seating (tables/floors off — same as BAKERY,
  // FOOD_TRUCK, CLOUD_KITCHEN). RESTAURANT keeps its full table workflow.
  CAFE: {
    food: true, dietary: true, kitchen: true, kot: true,
    tables: false, floors: false, menu: true, products: false,
    barcode: true, inventory: true, stock: true, variants: false,
    customers: true,
  },
  BAR: {
    food: true, dietary: true, kitchen: true, kot: true,
    tables: false, floors: false, menu: true, products: false,
    barcode: true, inventory: true, stock: true, variants: false,
    customers: true,
  },
  FOOD_TRUCK: {
    food: true, dietary: true, kitchen: true, kot: true,
    tables: false, floors: false, menu: true, products: false,
    barcode: true, inventory: true, stock: true, variants: false,
    customers: true,
  },
  CLOUD_KITCHEN: {
    food: true, dietary: true, kitchen: true, kot: true,
    tables: false, floors: false, menu: true, products: false,
    barcode: true, inventory: true, stock: true, variants: false,
    customers: true,
  },
  FOOD_COURT: {
    food: true, dietary: true, kitchen: true, kot: true,
    tables: true, floors: true, menu: true, products: false,
    barcode: true, inventory: true, stock: true, variants: false,
    customers: true,
  },
  // BAKERY is a BASIC_POS food business (café/bakery/bar/food-truck/cloud-
  // kitchen family): it prepares food, so the production workflow (KOT →
  // kitchen → Active Orders → Ready → Bill) applies when the tenant runs in
  // production mode. Tables/floors stay OFF — no dine-in seating workflow.
  BAKERY: {
    food: true, dietary: true, kitchen: true, kot: true,
    tables: false, floors: false, menu: true, products: false,
    barcode: true, inventory: true, stock: true, variants: false,
    customers: true,
  },
  CLOTHING: {
    food: false, dietary: false, kitchen: false, kot: false,
    tables: false, floors: false, menu: false, products: true,
    barcode: true, inventory: true, stock: true, variants: true,
    customers: true,
  },
  SUPERMARKET: {
    food: false, dietary: false, kitchen: false, kot: false,
    tables: false, floors: false, menu: false, products: true,
    barcode: true, inventory: true, stock: true, variants: false,
    customers: true,
  },
  GROCERY: {
    food: false, dietary: false, kitchen: false, kot: false,
    tables: false, floors: false, menu: false, products: true,
    barcode: true, inventory: true, stock: true, variants: false,
    customers: true,
  },
  ELECTRONICS: {
    food: false, dietary: false, kitchen: false, kot: false,
    tables: false, floors: false, menu: false, products: true,
    barcode: true, inventory: true, stock: true, variants: true,
    customers: true,
  },
  FURNITURE: {
    food: false, dietary: false, kitchen: false, kot: false,
    tables: false, floors: false, menu: false, products: true,
    barcode: true, inventory: true, stock: true, variants: true,
    customers: true,
  },
  HARDWARE: {
    food: false, dietary: false, kitchen: false, kot: false,
    tables: false, floors: false, menu: false, products: true,
    barcode: true, inventory: true, stock: true, variants: false,
    customers: true,
  },
  COSMETICS: {
    food: false, dietary: false, kitchen: false, kot: false,
    tables: false, floors: false, menu: false, products: true,
    barcode: true, inventory: true, stock: true, variants: true,
    customers: true,
  },
  STATIONERY: {
    food: false, dietary: false, kitchen: false, kot: false,
    tables: false, floors: false, menu: false, products: true,
    barcode: true, inventory: true, stock: true, variants: false,
    customers: true,
  },
  JEWELLERY: {
    food: false, dietary: false, kitchen: false, kot: false,
    tables: false, floors: false, menu: false, products: true,
    barcode: true, inventory: true, stock: true, variants: true,
    customers: true,
  },
  OTHER: {
    food: false, dietary: false, kitchen: false, kot: false,
    tables: false, floors: false, menu: false, products: true,
    barcode: true, inventory: true, stock: true, variants: false,
    customers: true,
  },
  HOTEL: { // legacy value — stays readable, resolves to generic retail
    food: false, dietary: false, kitchen: false, kot: false,
    tables: false, floors: false, menu: false, products: true,
    barcode: true, inventory: true, stock: true, variants: false,
    customers: true,
  },
};

const DEFAULT_CAPABILITIES = BUSINESS_CAPABILITIES.OTHER;

/** Resolve capabilities for a business type (never throws). */
export function getBusinessCapabilities(businessType) {
  if (!businessType || typeof businessType !== "string") return DEFAULT_CAPABILITIES;
  return BUSINESS_CAPABILITIES[businessType.trim().toUpperCase()] || DEFAULT_CAPABILITIES;
}

/**
 * Is this business type a BASIC_POS food business (café/bakery/bar/food-truck/
 * cloud-kitchen family)? These are the verticals the "Enable Basic POS Quick
 * Billing" toggle applies to — production mode (OFF) vs quick billing (ON).
 * Retail QUICK_BILLING verticals are never BASIC_POS food businesses.
 * Mirrors the authoritative backend utils/businessCapabilities.js.
 */
export function isBasicPosFoodBusiness(businessType) {
  const key = String(businessType || "").trim().toUpperCase();
  const map = {
    RESTAURANT: "RESTAURANT",
    FOOD_COURT: "RESTAURANT",
    CAFE: "BASIC_POS",
    BAR: "BASIC_POS",
    BAKERY: "BASIC_POS",
    FOOD_TRUCK: "BASIC_POS",
    CLOUD_KITCHEN: "BASIC_POS",
  };
  return map[key] === "BASIC_POS";
}

/**
 * §2/§5/§12 — ONE centralized workflow-mode predicate (sidebar, route guard
 * and pages MUST all use this — no divergent local implementations).
 *
 * A food business with kitchen capability runs the PRODUCTION workflow
 * (Order → KOT → Active Orders → Ready → Bill) exactly when it is a BASIC_POS
 * food business with "Enable Basic POS Quick Billing" OFF. Everything else
 * (Quick Billing ON, retail QUICK_BILLING, restaurants) is NOT production:
 * restaurants keep their own separate flow and retail always direct-pays.
 */
export function isBasicPosProductionMode(settings) {
  const s = settings || {};
  const caps = s.capabilities || getBusinessCapabilities(s.businessType);
  return caps.kitchen === true && isBasicPosFoodBusiness(s.businessType) && s.enableCounterSale !== true;
}

/**
 * Direct-payment entry (POS cart → PAYMENT → complete): quick-billing BASIC_POS
 * or retail QUICK_BILLING. Restaurants keep their own flow (they are
 * tablesCapable and are evaluated before this predicate is consulted).
 */
export function isQuickBillingMode(settings) {
  const s = settings || {};
  const caps = s.capabilities || getBusinessCapabilities(s.businessType);
  if (caps.kitchen === true && !isBasicPosFoodBusiness(s.businessType)) return false; // restaurant
  return !isBasicPosProductionMode(s);
}

/** Catalog naming: food verticals say "Menu", retail says "Products". */
export function catalogNaming(businessType) {
  const c = getBusinessCapabilities(businessType);
  if (c.menu) return { catalogLabel: "Menu & Stock", itemLabel: "Menu Items", collectionLabel: "Menu" };
  return { catalogLabel: "Products & Stock", itemLabel: "Products", collectionLabel: "Products" };
}

/**
 * Which internal UserRole values are VISIBLE/SELECTABLE for this business
 * type — mirrors the authoritative backend
 * (restaurant-pos-backend/src/utils/businessCapabilities.js → getVisibleStaffRoles).
 * ONE authoritative mapping for user-facing staff-role availability (Staff
 * Roster Add/Edit, staff-discount chips). UX/display only: the backend
 * re-derives and enforces this server-side. MANAGER/CASHIER exist in every
 * vertical; KITCHEN only where the kitchen capability exists; WAITER only
 * where a service/waiter workflow (tables/floors) exists.
 */
export function getVisibleStaffRoles(businessType) {
  const c = getBusinessCapabilities(businessType);
  const roles = ["MANAGER", "CASHIER"];
  if (c.kitchen === true) roles.push("KITCHEN");
  if (c.tables === true || c.floors === true) roles.push("WAITER");
  return roles;
}

/**
 * Which internal UserRole values may RECEIVE a staff discount — visibility
 * and receivability share ONE list (see getVisibleStaffRoles).
 */
export function staffDiscountRoles(businessType) {
  return getVisibleStaffRoles(businessType);
}
