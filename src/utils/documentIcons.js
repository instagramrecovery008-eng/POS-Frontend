/**
 * One place that decides which Lucide icon represents each kind of document or
 * order flow, so the same thing always looks the same across the app and no
 * food/restaurant glyph is used for non-food documents.
 *
 *   KOT              → Ticket          (kitchen ticket — restaurant/food businesses)
 *   Counter sale     → ShoppingCart    (quick billing / over-the-counter sale)
 *   Sales invoice    → FileText        (printed/downloaded invoice)
 *   Receipt          → ReceiptText     (thermal receipt / payment receipt)
 *   Purchase order   → ClipboardList   (order placed with a supplier)
 *   Table / dine-in  → Table2          (table-service only)
 *   Product catalog  → Package         (generic goods — never a food icon)
 */
import { Ticket, ShoppingCart, FileText, ReceiptText, ClipboardList, Table2, Package } from 'lucide-react';

export const DOCUMENT_ICONS = {
  kot: Ticket,
  counterSale: ShoppingCart,
  salesInvoice: FileText,
  receipt: ReceiptText,
  purchaseOrder: ClipboardList,
  table: Table2,
  product: Package,
};

/** Icon for an order type as stored on the order (COUNTER_SALE, DINE_IN, TAKEAWAY, DELIVERY…). */
export const iconForOrderType = (orderType) => {
  switch (orderType) {
    case 'COUNTER_SALE': return DOCUMENT_ICONS.counterSale;
    case 'DINE_IN': return DOCUMENT_ICONS.table;
    default: return DOCUMENT_ICONS.receipt;
  }
};

export default DOCUMENT_ICONS;
