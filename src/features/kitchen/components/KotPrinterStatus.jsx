import React, { useState } from 'react';
import { Printer, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { useSettingsStore } from '../../../store';
import { openKotPrintWindow, renderKotInWindow, closeKotPrintWindow } from '../../../services/printService';
import { resolvePrinterStatus } from '../../../utils/kotPrinterStatus';

/**
 * COMPACT kitchen-printer status panel.
 *
 * Three explicit statuses (never a vague warning banner):
 *   - Printer configured     → a dedicated Kitchen/KOT printer is registered.
 *   - System print dialog    → the browser print dialog is the fallback path
 *                              used when no dedicated kitchen printer exists.
 *   - Printer unavailable    → the print window could not be opened (popup
 *                              blocked / closed), with the error and a retry.
 *
 * Honesty rule: the only printing mechanism in this app is the browser print
 * window, which prints through the workstation's OS printer. The panel never
 * claims that paper was printed — it says the ticket reached the system print
 * dialog and asks the user to confirm it.
 *
 * Sized for small screens: one flexible text column + a wrapping action row,
 * no fixed height, no overflow.
 */
export default function KotPrinterStatus({
  onConfigure,
  configureLabel = 'Configure printer',
  className = '',
}) {
  const settings = useSettingsStore((s) => s.settings);
  const anyPrinterRegistered = useSettingsStore((s) => s.printerConfigured) !== false;
  const [test, setTest] = useState(null); // { tone: 'ok' | 'error', message }
  const [testing, setTesting] = useState(false);

  // Status text/meaning lives in a pure helper (utils/kotPrinterStatus) so the
  // mapping is unit-testable without a DOM.
  const status = resolvePrinterStatus({
    printers: settings?.printers || [],
    printerConfigured: anyPrinterRegistered,
    lastError: test?.tone === 'error' ? test.message : null,
  });
  const unavailable = status.kind === 'unavailable';
  const StatusIcon = unavailable ? AlertTriangle : status.kind === 'configured' ? CheckCircle2 : Printer;

  const tones = {
    emerald: { wrap: 'border-emerald-200 bg-emerald-50', icon: 'text-emerald-600', text: 'text-emerald-800' },
    amber: { wrap: 'border-amber-200 bg-amber-50', icon: 'text-amber-600', text: 'text-amber-800' },
    red: { wrap: 'border-red-200 bg-red-50', icon: 'text-red-600', text: 'text-red-800' },
  }[status.tone];

  const handleTestPrint = () => {
    // Open the window INSIDE the click gesture — the browser blocks a popup
    // opened after an await. This is the SAME mechanism the KOT dispatch uses;
    // no new printing stack is introduced for the test.
    const win = openKotPrintWindow();
    if (!win) {
      setTest({ tone: 'error', message: 'The browser blocked the print window. Allow pop-ups for this site, then retry.' });
      return;
    }
    setTesting(true);
    setTest(null);
    const opened = renderKotInWindow(win, {
      restaurantName: settings?.branding?.restaurantName || 'Restaurant',
      kotNo: 'TEST',
      orderNo: '—',
      orderType: 'TEST PRINT',
      items: [{ name: 'Printer test — no order was created', quantity: 1 }],
      footer: 'Test ticket',
      date: new Date(),
    });
    setTesting(false);
    if (!opened) {
      closeKotPrintWindow(win);
      setTest({ tone: 'error', message: 'The print window closed before the test ticket was ready. Retry.' });
      return;
    }
    setTest({
      tone: 'ok',
      message: 'Test ticket sent to the system print dialog. Confirm it in the dialog — this confirms the print path, not physical paper.',
    });
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-col gap-1.5 rounded-lg border px-2.5 py-1.5 sm:flex-row sm:items-center sm:gap-2.5 ${tones.wrap} ${className}`}
    >
      {/* Left: icon + short heading + one/two-line description */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <StatusIcon className={`h-3.5 w-3.5 shrink-0 ${tones.icon}`} aria-hidden="true" />
        <div className="min-w-0">
          <p className={`text-[9px] font-extrabold uppercase leading-tight tracking-wider ${tones.text}`}>
            {status.label}
          </p>
          <p className="text-[9px] font-semibold leading-tight text-slate-600 line-clamp-2">
            {status.detail}
          </p>
          {test?.message && (
            <p className={`text-[9px] font-bold leading-tight ${test.tone === 'error' ? 'text-red-700' : 'text-emerald-700'}`}>
              {test.message}
            </p>
          )}
        </div>
      </div>
      {/* Right: actions — wrap neatly under the text on narrow screens */}
      <div className="flex flex-wrap items-center gap-1.5 sm:shrink-0 sm:justify-end">
        <button
          type="button"
          onClick={handleTestPrint}
          disabled={testing}
          className="inline-flex h-6 shrink-0 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 text-[9px] font-extrabold uppercase tracking-wider text-slate-700 transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Printer className="h-3 w-3" />}
          {unavailable ? 'Retry print' : 'Test print'}
        </button>
        <button
          type="button"
          onClick={onConfigure}
          className="inline-flex h-6 shrink-0 items-center gap-1 rounded-md bg-[#16A34A] px-2 text-[9px] font-extrabold uppercase tracking-wider text-white transition-all hover:bg-[#15803D]"
        >
          {configureLabel}
        </button>
      </div>
    </div>
  );
}
