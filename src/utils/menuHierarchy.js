/**
 * Shared Category → Subcategory → Item hierarchy helpers (Parts 1/2/9).
 *
 * ONE filtering rule set for every menu-browsing surface:
 *   - Menu & Inventory Manager   (features/masters/menu/pages/MenuPage.jsx)
 *   - POS Ordering wizard        (features/pos/workspace/components/TakeOrderWizard.jsx)
 *   - Basic POS / Quick Billing  (features/pos/workspace/pages/PosWorkspace.jsx)
 *
 * Selection semantics shared by all surfaces:
 *   selectedCategory    : 'All' or the exact category name
 *   selectedSubcategory : 'All' | 'NONE' (no subcategory) | String(subcategory.id)
 *   Changing category MUST reset selectedSubcategory to 'All' (enforced by the
 *   selectCategory/selectSubcategory handlers below).
 */

/** Sentinel values for the subcategory tab row. */
export const SUBCATEGORY_ALL = 'All';
export const SUBCATEGORY_NONE = 'NONE';

/**
 * Active subcategories that belong to the given category, sorted for tab order.
 * `subcategories` rows carry: { id, name, categoryId, categoryName, isActive, sortOrder }.
 * Reuses already-loaded data — no per-tab-click fetch (Part 1 req. 14).
 */
export const subcategoriesForCategory = (subcategories, categoryName) =>
  (subcategories || [])
    .filter((s) => s && s.isActive !== false && s.categoryName === categoryName)
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || String(a.name).localeCompare(String(b.name)));

/**
 * True when the category has at least one item without a subcategory — drives
 * the "No Subcategory" tab visibility (Part 1 req. 5).
 */
export const categoryHasUnassignedItems = (items, categoryName) =>
  categoryName !== 'All' &&
  (items || []).some((m) => m.category === categoryName && !m.subcategoryId);

/**
 * Unified menu filter: category + subcategory + search + dietary together
 * (Part 1 req. 8 / Part 2 req. 5). Search matches item name, category,
 * subcategory name and SKU (POS surfaces may additionally match barcode via
 * `extraMatch`). Always pass a matcher list item shape with:
 * { name, category, subcategoryId, subcategoryName, sku?, dietaryType? }.
 */
export const filterMenuItems = (items, opts = {}) => {
  const {
    selectedCategory = 'All',
    selectedSubcategory = 'All',
    searchQuery = '',
    dietaryFilter = 'All',
    extraMatch = null,
  } = opts;

  const q = String(searchQuery || '').trim().toLowerCase();
  const subId =
    selectedSubcategory !== 'All' && selectedSubcategory !== 'NONE'
      ? Number(selectedSubcategory)
      : null;

  return (items || []).filter((item) => {
    // 1. Category
    if (selectedCategory !== 'All' && item.category !== selectedCategory) return false;

    // 2. Subcategory ('All' | 'NONE' | numeric id)
    if (selectedSubcategory === 'NONE') {
      if (item.subcategoryId) return false;
    } else if (subId !== null && Number(item.subcategoryId) !== subId) {
      return false;
    }

    // 3. Dietary (VEG | NON_VEG | All)
    if (dietaryFilter && dietaryFilter !== 'All' && item.dietaryType !== dietaryFilter) {
      // Legacy items may only carry isVeg
      const legacyVeg = item.isVeg !== false;
      const itemDietary = item.dietaryType || (legacyVeg ? 'VEG' : 'NON_VEG');
      if (itemDietary !== dietaryFilter) return false;
    }

    // 4. Search — name, category, subcategory name, SKU
    if (q) {
      const haystack = [
        item.name,
        item.category,
        item.subcategoryName,
        item.sku,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) {
        // 5. Surface-specific extras (e.g. barcode on POS surfaces)
        if (typeof extraMatch === 'function' && extraMatch(item, q)) return true;
        return false;
      }
    }
    return true;
  });
};

/**
 * Live subcategory tabs (with item counts) for the selected category.
 * Returns [{ id, name, count, hasItems }] — used to render the tab row without
 * recomputing per render in the consuming component.
 */
export const subcategoryTabsFor = (items, subcategories, categoryName) => {
  const tabs = subcategoriesForCategory(subcategories, categoryName).map((s) => ({
    id: String(s.id),
    name: s.name,
    // Type-safe count: API item.subcategoryId is a Number while tab id is a
    // String — strict === would silently count 0 for every subcategory tab.
    count: (items || []).filter((m) => m.subcategoryId != null && Number(m.subcategoryId) === Number(s.id)).length,
  }));
  if (categoryHasUnassignedItems(items, categoryName)) {
    tabs.push({
      id: SUBCATEGORY_NONE,
      name: 'No Subcategory',
      count: (items || []).filter((m) => m.category === categoryName && !m.subcategoryId).length,
    });
  }
  return tabs;
};
