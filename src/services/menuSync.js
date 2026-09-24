/**
 * Global menu-data invalidation bus.
 *
 * Screens that cache menu/stock data (e.g. Menu & Stock's 60s module-level cache)
 * subscribe here. AppShell — which stays mounted for the whole session — fires
 * an invalidation whenever a payment completes, so the cache is dropped even if
 * the consuming screen is unmounted at that moment. This is the root-cause fix
 * for stale stock displays after an order is paid.
 */

const invalidators = new Set();

/** Subscribe a cache-dropping callback. Returns an unsubscribe function. */
export function subscribeMenuInvalidation(fn) {
  invalidators.add(fn);
  return () => {
    invalidators.delete(fn);
  };
}

/** Fire all subscribers — call this whenever menu/stock data may have changed. */
export function invalidateMenuData() {
  invalidators.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      console.error('Menu invalidation error:', e);
    }
  });
}

export default { subscribeMenuInvalidation, invalidateMenuData };
