/**
 * Order-item void bookkeeping — ONE source of truth for "what is still active".
 *
 * OrderItem carries two independent quantities:
 *   quantity        — what the guest ordered
 *   voidedQuantity  — how much of the line was voided together with a voided
 *                     KOT (additive column, default 0)
 *
 * Rules (mirrored server-side by the KOT void transaction):
 *   activeQuantity = max(0, quantity − voidedQuantity)
 *   a line is ACTIVE while activeQuantity > 0 — a partially voided line keeps
 *   its remainder (the order stays open), a fully voided line drops out of
 *   active kitchen work and pending-item views.
 *
 * Nothing here rewrites money: the ORDER totals stay the stored, authoritative
 * values so the bill/payment history is never silently altered by a kitchen
 * void. These helpers only decide what is still ACTIVE work.
 */

/** Tolerant numeric read — legacy rows may carry null/undefined. */
function toInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Quantity of an order line that is still active kitchen work. */
export function activeQuantity(item) {
  if (!item) return 0;
  const quantity = toInt(item.quantity);
  const voided = Math.max(0, toInt(item.voidedQuantity));
  return Math.max(0, quantity - voided);
}

/** True when EVERY unit of the line was voided. */
export function isFullyVoided(item) {
  if (!item) return false;
  return toInt(item.quantity) > 0 && activeQuantity(item) === 0;
}

/** True when part of the line was voided but a remainder is still active. */
export function isPartiallyVoided(item) {
  if (!item) return false;
  const voided = toInt(item.voidedQuantity);
  return voided > 0 && activeQuantity(item) > 0;
}

/** Lines that still represent active work (fully voided lines removed). */
export function activeOrderItems(items) {
  return (Array.isArray(items) ? items : []).filter((i) => activeQuantity(i) > 0);
}

/** Total ACTIVE quantity across an order's lines. */
export function activeItemCount(items) {
  return activeOrderItems(items).reduce((sum, i) => sum + activeQuantity(i), 0);
}

/** Number of lines with at least one voided unit (for UI hints). */
export function voidedLineCount(items) {
  return (Array.isArray(items) ? items : []).filter((i) => toInt(i.voidedQuantity) > 0).length;
}

/** True when the whole order's kitchen work was voided (nothing active left). */
export function isFullyVoidedOrder(order) {
  const items = order?.orderItems || [];
  if (items.length === 0) return false; // no lines → nothing to judge
  return activeOrderItems(items).length === 0;
}

export default {
  activeQuantity,
  isFullyVoided,
  isPartiallyVoided,
  activeOrderItems,
  activeItemCount,
  voidedLineCount,
  isFullyVoidedOrder,
};
