/**
 * Kitchen-print dispatch — the ONE place a KOT is handed to a printer.
 *
 * The existing printing mechanism (services/printService.js → browser print
 * window) is reused as-is; this service only adds the lifecycle the workflow
 * was missing:
 *
 *   1. printer configured? → NO configured printer is a VISIBLE warning, but it
 *      does NOT block printing: the actual mechanism is the browser print
 *      dialog, which uses the workstation's OS printer. Refusing to open it (the
 *      previous behaviour) made "KOT printing enabled" print nothing at all for
 *      every tenant that had never added a printer row. The warning routes the
 *      user to POS Settings → Printer Configuration for a dedicated kitchen
 *      printer.
 *   2. dispatch attempt     → the print window is opened exactly once per job.
 *      Callers that must AWAIT before they know the KOT (order placement,
 *      incremental KOT creation) pass a window they pre-opened synchronously
 *      in the click handler; opening a popup after an await is blocked by the
 *      browser and was the reason nothing printed.
 *   3. report result        → POST /api/kot/:id/print-result records
 *      DISPATCHED or FAILED on the KOT so the job survives a refresh and can be
 *      retried. A physical print is NEVER claimed — "dispatched" only means the
 *      ticket reached the browser/OS print path.
 *
 * Duplicate protection has two layers:
 *   - this module's in-flight set (double click / repeated socket events while
 *     the request is still open)
 *   - the backend's automatic-dispatch guard (a replay after a terminal state
 *     returns `duplicate: true` and prints nothing)
 */
import { openKotPrintWindow, renderKotInWindow } from './printService';
import kotApi from '../api/kot.api';

// KOT ids with a dispatch currently in flight on THIS terminal.
const inFlight = new Set();

/** Is a dispatch for this KOT already running locally? */
export function isKotPrintInFlight(kotId) {
  return inFlight.has(Number(kotId));
}

const BLOCKED_MESSAGE = 'The browser blocked the print window. Allow pop-ups for this site and retry.';
const CLOSED_MESSAGE = 'The print window was closed before the ticket was ready. Retry printing.';

/**
 * @param {object} params
 * @param {object} params.kot        KOT row (id, kotNo, printJobStatus…) — or null for a legacy caller
 * @param {object} params.printData  payload for generateKotHtml (items, orderNo, …)
 * @param {boolean} params.printerConfigured  tenant has a printer in POS Settings
 * @param {boolean} [params.manual]  explicit reprint/retry (bypasses the auto duplicate guard)
 * @param {string}  [params.settingsRoute]  screen id used for the "configure printer" hint
 * @param {Window}  [params.printWindow]  window pre-opened in the click handler (see openKotPrintWindow)
 * @returns {Promise<{dispatched:boolean, duplicate?:boolean, needsConfiguration?:boolean, error?:string}>}
 */
export async function dispatchKotPrint({
  kot,
  printData,
  printerConfigured,
  manual = false,
  settingsRoute = 'settings',
  printWindow = null,
}) {
  const kotId = kot?.id ?? printData?.kotId;
  if (!kotId) {
    return { dispatched: false, error: 'Missing KOT id — nothing was printed.' };
  }
  if (inFlight.has(Number(kotId))) {
    return { dispatched: false, duplicate: true, error: 'A print for this ticket is already in progress.' };
  }

  // A voided ticket must never reach a kitchen printer.
  if (kot?.cancelledAt || kot?.status === 'CANCELLED') {
    return { dispatched: false, error: 'This ticket was voided and cannot be printed.' };
  }

  // ── No printer configured → WARN, but print through the OS/browser printer ──
  // The print dialog is the real mechanism, so this must not become a hard
  // failure; the UI shows an actionable warning and a route to printer settings.
  const noConfiguredPrinter = printerConfigured === false;
  const configurationWarning = noConfiguredPrinter
    ? 'No printer is configured in POS Settings → Printer Configuration. The ticket printed through the system print dialog — add a kitchen printer for dedicated KOT printing.'
    : null;

  inFlight.add(Number(kotId));
  try {
    // Prefer the window the caller opened inside the click gesture. Only a
    // call that already runs in a user-gesture task (retry buttons) opens its
    // own window here.
    //   pre-opened but closed by the user → report it, never silently open a
    //   second popup behind their back;
    //   no pre-opened window (retry click) → open one now, still in-gesture.
    const win = printWindow
      ? (printWindow.closed ? null : printWindow)
      : openKotPrintWindow();

    let opened = false;
    let failure = printWindow ? CLOSED_MESSAGE : BLOCKED_MESSAGE;
    if (win) {
      opened = renderKotInWindow(win, printData);
      if (!opened) failure = BLOCKED_MESSAGE;
    }

    const resp = await kotApi.reportPrintResult(kotId, opened
      ? { status: 'dispatched', manual }
      : { status: 'failed', error: failure, manual });

    // apiClient unwraps the axios response, so `resp` IS the API body.
    const reported = resp?.data || resp || {};
    const duplicate = resp?.duplicate === true || reported?.duplicate === true;

    if (!opened) {
      return { dispatched: false, needsConfiguration: noConfiguredPrinter, settingsRoute, error: failure };
    }
    return { dispatched: true, duplicate, needsConfiguration: noConfiguredPrinter, warning: configurationWarning, settingsRoute };
  } catch (e) {
    // The print window opened but the result could not be recorded. Surface it
    // instead of pretending the ticket printed.
    const msg = e?.message || 'Failed to record the print result.';
    try {
      await kotApi.reportPrintResult(kotId, { status: 'failed', error: msg, manual });
    } catch { /* ignore */ }
    return { dispatched: false, error: msg };
  } finally {
    inFlight.delete(Number(kotId));
  }
}

export default dispatchKotPrint;
