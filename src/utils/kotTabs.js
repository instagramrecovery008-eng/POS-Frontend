/**
 * Kitchen Tickets tab classification — ONE source of truth.
 *
 * A KOT carries BOTH its own status (`KOT.status` / `cancelledAt`, set by the
 * kitchen workflow) and its parent order's status (`order.status`, set by the
 * POS/cashier workflow, e.g. HOLD / CANCELLED / COMPLETED). Reading only one of
 * them made a held ticket show up as Active AND On Hold at the same time.
 *
 * The three buckets are therefore MUTUALLY EXCLUSIVE and derived from the
 * stored values (`kotTabFor`), so the same ticket can never appear twice:
 *
 *   History  — voided (KOT cancelled) or served KOT, or a closed order
 *   On Hold  — still-open ticket whose ORDER is on hold
 *   Active   — everything else that is still open
 *
 * Both /api/kot payloads (`order.status`) and optimistic socket payloads are
 * handled: a missing field simply falls through to the "still open" branches
 * instead of throwing.
 */

export const KOT_TABS = ['Active', 'On Hold', 'History'];

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

/** The parent order is parked (POS "Hold Order"). */
export function isHeldKot(kot) {
  return kot?.order?.status === 'HOLD';
}

/**
 * Resolve the single tab a ticket belongs to.
 * @returns {'Active'|'On Hold'|'History'}
 */
export function kotTabFor(kot) {
  if (isVoidedKot(kot) || isServedKot(kot) || isClosedOrderKot(kot)) return 'History';
  if (isHeldKot(kot)) return 'On Hold';
  return 'Active';
}

/**
 * Split a KOT list into the three mutually exclusive tab buckets.
 * @param {Array} kots
 * @returns {{ Active: Array, 'On Hold': Array, History: Array }}
 */
export function groupKotsByTab(kots) {
  const buckets = { Active: [], 'On Hold': [], History: [] };
  (Array.isArray(kots) ? kots : []).forEach((kot) => {
    buckets[kotTabFor(kot)].push(kot);
  });
  return buckets;
}

export default groupKotsByTab;
