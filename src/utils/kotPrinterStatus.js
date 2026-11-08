/**
 * Kitchen-printer status resolution (pure — shared by the UI and tests).
 *
 * Three explicit statuses, never a vague warning banner:
 *   configured  → a dedicated Kitchen/KOT printer is registered
 *   system      → no dedicated kitchen printer; the browser print dialog is
 *                 the documented fallback
 *   unavailable → the print window could not be opened (popup blocked or
 *                 closed); the error is shown with a retry
 *
 * The browser print dialog is the ONLY mechanism this app uses, so the text
 * never claims that paper was printed. `printerConfigured` is the server's
 * "this tenant has at least one printer row" flag; it only changes the wording
 * of the fallback state — a billing/receipt printer does not make KOTs print
 * silently.
 */

export const KOT_PRINTER_STATUS = {
  CONFIGURED: 'configured',
  SYSTEM: 'system',
  UNAVAILABLE: 'unavailable',
};

/** A printer row registered for kitchen output (KOT/Kitchen type or name). */
export function findKitchenPrinter(printers = []) {
  return (printers || []).find((p) => /kitchen|kot/i.test(`${p?.type || ''} ${p?.name || ''}`)) || null;
}

/**
 * @param {object} params
 * @param {Array}  [params.printers]           tenant printer rows
 * @param {boolean}[params.printerConfigured]  server-reported printer config
 * @param {string} [params.lastError]          last dispatch/test-print failure
 * @returns {{kind:string,label:string,tone:string,detail:string,printer:object|null}}
 */
export function resolvePrinterStatus({ printers = [], printerConfigured = true, lastError = null } = {}) {
  const kitchenPrinter = findKitchenPrinter(printers);

  if (lastError) {
    return {
      kind: KOT_PRINTER_STATUS.UNAVAILABLE,
      label: 'Printer unavailable',
      tone: 'red',
      detail: 'The browser could not open the kitchen-ticket print window. Allow pop-ups for this site, then retry.',
      printer: kitchenPrinter,
    };
  }

  if (kitchenPrinter) {
    return {
      kind: KOT_PRINTER_STATUS.CONFIGURED,
      label: 'Printer configured',
      tone: 'emerald',
      detail: `${kitchenPrinter.name} is registered for kitchen tickets. Browsers print through this workstation's system print dialog — set the OS default printer to ${kitchenPrinter.name}.`,
      printer: kitchenPrinter,
    };
  }

  return {
    kind: KOT_PRINTER_STATUS.SYSTEM,
    label: 'System print dialog',
    tone: 'amber',
    detail: printerConfigured === false
      ? 'No dedicated kitchen printer is configured, so KOTs open the browser print dialog as the fallback. Confirm it each time, or add a Kitchen printer in POS Settings → Printer Configuration.'
      : 'Printers are registered, but none is assigned to the kitchen, so KOTs open the browser print dialog. Confirm it each time, or add a Kitchen printer in POS Settings → Printer Configuration.',
    printer: null,
  };
}
