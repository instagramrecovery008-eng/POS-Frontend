import { SUBCATEGORY_ALL, SUBCATEGORY_NONE } from './menuHierarchy.js';

/**
 * Resolve the default Category + Subcategory for the Add/Edit Item form from
 * the Menu & Stock view's CURRENT selection (Part 2).
 *
 * Rules:
 *   • A specific category is preselected. When the view is on "All", the
 *     existing default (the first category) is used and no subcategory applies.
 *   • A specific subcategory is preselected ONLY when it genuinely belongs to
 *     the category being applied — a stale/foreign selection is never applied.
 *   • SUBCATEGORY_ALL / SUBCATEGORY_NONE (and "All") resolve to no subcategory
 *     (""), matching the existing valid default (None).
 *
 * Pure function — safe to unit test, no React state involved.
 */
export function resolveItemDefaults({
  selectedCategory,
  selectedSubcategory,
  categories = [],
  subcategories = [],
}) {
  const categoryName = selectedCategory === 'All'
    ? (categories[0]?.name || '')
    : selectedCategory;

  // "All" keeps the existing default category behavior, with no subcategory.
  if (selectedCategory === 'All') return { categoryName, subcategoryId: '' };

  let subcategoryId = '';
  if (selectedSubcategory !== SUBCATEGORY_ALL && selectedSubcategory !== SUBCATEGORY_NONE) {
    const match = subcategories.find((s) => String(s.id) === String(selectedSubcategory));
    // Ownership-of-category check: only apply a subcategory that belongs to the
    // category being applied, so a selection from another category never leaks.
    if (match && match.categoryName === categoryName) subcategoryId = String(match.id);
  }
  return { categoryName, subcategoryId };
}
