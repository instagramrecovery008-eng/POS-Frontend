/**
 * Product-list helpers for the login page's "Our Products" section.
 *
 * The public registry (Super-Admin managed) and the configured fallback can
 * legitimately contain the same product — KlarGo POS is both the current
 * product and the first catalogue entry. The same product must appear exactly
 * once, matched on a STABLE key (slug → id → name), never on display copy.
 */

/** Stable dedupe key for a product (empty string when unidentifiable). */
export function productKey(product) {
  if (!product || !product.name) return '';
  return String(product.slug || product.id || product.name).trim().toLowerCase();
}

/**
 * Merge product sources in priority order, dropping duplicates and entries
 * without a usable identity. The first occurrence wins (live registry first).
 */
export function dedupeProducts(...lists) {
  const seen = new Set();
  const out = [];

  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const product of list) {
      const key = productKey(product);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(product);
    }
  }

  return out;
}

export default dedupeProducts;
