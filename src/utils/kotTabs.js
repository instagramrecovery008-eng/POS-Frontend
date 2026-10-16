/**
 * Kitchen Tickets tab classification — ONE source of truth.
 *
 * A KOT carries BOTH its own status (`KOT.status` / `cancelledAt`, set by the
 * kitchen workflow) and its parent order's status (`order.status`, set by the
 * POS/cashier workflow, e.g. CANCELLED / COMPLETED). Reading only one of them
 * used to make a ticket show up in two tabs at the same time.
 *
 * The two buckets are therefore MUTUALLY EXCLUSIVE and derived from the stored
 * values (`kotTabFor`), so the same ticket can never appear twice:
 *
 *   History  — voided (KOT cancelled) or served KOT, or a closed order
 *   Active   — everything else that is still open
 *
 * Hold orders were removed from the product, so there is no "On Hold" tab. A
 * LEGACY row still stored as `order.status = 'HOLD'` (created before the
 * removal) is an open ticket with a live KOT: it is classified as Active so it
 * can never silently disappear from the kitchen. Nothing here writes data —
 * the admin recovery script (backend `npm run release:held-orders`) is the only
 * place that normalizes such a legacy status.
 *
 * Both /api/kot payloads (`order.status`) and optimistic socket payloads are
 * handled: a missing field simply falls through to the "still open" branch
 * instead of throwing.
 */

export const KOT_TABS = ['Active', 'History'];

/** Voided: the ticket itself was cancelled (either flag may be set). */
export function isVoidedKot(kot) {
  return !!kot && (kot.status === 'CANCELLED' || !!kot.cancelledAt);
}

/** Served: the kitchen finished the ticket (`SERVED` is the terminal state). */
export function isServedKot(kot) {
  return !!kot && kot.status === 'SERVED';
}

/** The parent order is closed — its tickets belong to History, never Active. */
export function isClosedOrderKot(kot) {
  const status = kot?.order?.status;
  return status === 'CANCELLED' || status === 'COMPLETED';
}

/**
 * Resolve the single tab a ticket belongs to.
 * @returns {'Active'|'History'}
 */
export function kotTabFor(kot) {
  if (isVoidedKot(kot) || isServedKot(kot) || isClosedOrderKot(kot)) return 'History';
  return 'Active';
}

/**
 * Split a KOT list into the two mutually exclusive tab buckets.
 * @param {Array} kots
 * @returns {{ Active: Array, History: Array }}
 */
export function groupKotsByTab(kots) {
  const buckets = { Active: [], History: [] };
  (Array.isArray(kots) ? kots : []).forEach((kot) => {
    buckets[kotTabFor(kot)].push(kot);
  });
  return buckets;
}

export default groupKotsByTab;
