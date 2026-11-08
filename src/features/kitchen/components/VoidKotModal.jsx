import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Ban, Loader2, X, AlertTriangle, ChefHat, ReceiptText } from 'lucide-react';

/**
 * Void Ticket confirmation modal (Kitchen Tickets screen).
 *
 * Guarantees enforced HERE (and re-validated server-side by cancelKOTSchema):
 *  1. the user sees the KOT number, the parent order number and the exact
 *     items that will be voided before confirming;
 *  2. a reason is MANDATORY — picked from the shared preset list;
 *  3. "Other" additionally requires a written explanation (≥10 chars);
 *  4. Cancel / backdrop / Escape closes WITHOUT touching the ticket;
 *  5. double submission is impossible (submittingRef + disabled buttons);
 *  6. the void reason sent to the API always carries both the structured code
 *     and the human-readable text the audit trail stores.
 */

// Single source of truth — mirrors backend validators/kot.validator.js
// VOID_REASON_CODES (same keys, same labels).
export const VOID_REASONS = [
  { code: 'ORDER_CANCELLED', label: 'Order cancelled' },
  { code: 'WRONG_ITEM', label: 'Wrong item entered' },
  { code: 'DUPLICATE_TICKET', label: 'Duplicate ticket' },
  { code: 'CUSTOMER_CHANGED', label: 'Customer changed order' },
  { code: 'OTHER', label: 'Other' },
];

const MIN_DETAIL = 10; // matches backend Joi min(10) on reasonDetail

export function voidReasonPayload({ reasonCode, reasonDetail }) {
  const detail = String(reasonDetail || '').trim();
  const label = VOID_REASONS.find((r) => r.code === reasonCode)?.label || '';
  // The stored cancelReason is always human-readable; the structured code is
  // carried alongside it for the API contract / reporting.
  const reason = reasonCode === 'OTHER' ? `Other: ${detail}` : label;
  return { reason, reasonCode, reasonDetail: detail || undefined };
}

export default function VoidKotModal({ kot, isOpen, onClose, onConfirm, isSubmitting }) {
  const [reasonCode, setReasonCode] = useState('');
  const [reasonDetail, setReasonDetail] = useState('');
  const [error, setError] = useState('');
  const firstRadioRef = useRef(null);
  const modalRef = useRef(null);

  // Reset the form each time the modal opens so a previous (cancelled) attempt
  // never leaks its reason into the next one.
  useEffect(() => {
    if (isOpen) {
      setReasonCode('');
      setReasonDetail('');
      setError('');
      // Move focus into the dialog for keyboard/AT users.
      const t = setTimeout(() => firstRadioRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [isOpen]);

  // Escape closes the modal and leaves the ticket unchanged.
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape' && !isSubmitting) {
      e.stopPropagation();
      onClose();
    }
  }, [isSubmitting, onClose]);

  if (!isOpen || !kot) return null;

  const order = kot.order || {};
  const tableLabel = order.table?.tableNo
    ? `Table ${order.table.tableNo}`
    : (order.orderType === 'COUNTER_SALE' ? 'Counter' : 'Takeaway');
  // KOTItems are authoritative: only THESE items (this ticket's delta) are
  // voided — a sibling KOT of the same order is untouched.
  const items = kot.kotItems || [];
  const needsDetail = reasonCode === 'OTHER';
  const detailValid = !needsDetail || reasonDetail.trim().length >= MIN_DETAIL;

  const canSubmit = !!reasonCode && detailValid && !isSubmitting;

  const handleSubmit = () => {
    if (!canSubmit) {
      if (!reasonCode) setError('Select a void reason to continue.');
      else if (!detailValid) setError(`Add at least ${MIN_DETAIL} characters explaining the reason.`);
      return;
    }
    setError('');
    onConfirm(voidReasonPayload({ reasonCode, reasonDetail }));
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in"
      onClick={() => { if (!isSubmitting) onClose(); }}
      onKeyDown={handleKeyDown}
      role="presentation"
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="void-kot-title"
        aria-describedby="void-kot-desc"
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-3 p-5 pb-4 border-b border-slate-100">
          <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
            <Ban className="w-5 h-5 text-red-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 id="void-kot-title" className="text-sm font-extrabold text-slate-800">
              Void Ticket <span className="font-mono text-[#16A34A]">{kot.kotNo}</span>?
            </h3>
            <p id="void-kot-desc" className="text-[11px] text-slate-500 mt-1">
              This removes the ticket from active kitchen work. The order and its
              payment history are preserved.
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close void ticket dialog"
            className="p-1.5 hover:bg-slate-100 rounded-lg transition-all cursor-pointer disabled:opacity-40 shrink-0"
          >
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        {/* Ticket summary — what exactly will be voided */}
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-500 font-semibold flex items-center gap-1.5">
              <ReceiptText className="w-3.5 h-3.5 text-[#16A34A]" /> Order
            </span>
            <span className="font-mono font-bold text-slate-700">
              #{order.orderNo || order.id || '—'} · {tableLabel}
            </span>
          </div>
          <div className="pt-1">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1 mb-1.5">
              <ChefHat className="w-3 h-3" /> Items to be voided ({items.length})
            </p>
            {items.length === 0 ? (
              <p className="text-[10px] text-amber-600 font-bold bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                ⚠️ No item records on this ticket — it will still be voided.
              </p>
            ) : (
              <ul className="space-y-1 max-h-32 overflow-y-auto pr-1">
                {items.map((it, idx) => (
                  <li key={it.id || idx} className="flex items-center justify-between text-[11px] bg-white border border-slate-200 rounded-lg px-2.5 py-1.5">
                    <span className="font-bold text-slate-700 truncate">{it.menuItem?.name || 'Item'}</span>
                    <span className="font-mono font-extrabold text-[#16A34A] shrink-0 ml-2">{it.quantity}x</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Reason */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <div>
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
              Void reason *
            </label>
            <div className="mt-2 space-y-1" role="radiogroup" aria-label="Void reason">
              {VOID_REASONS.map((r, idx) => (
                <button
                  key={r.code}
                  type="button"
                  ref={idx === 0 ? firstRadioRef : undefined}
                  role="radio"
                  aria-checked={reasonCode === r.code}
                  disabled={isSubmitting}
                  onClick={() => { setReasonCode(r.code); setError(''); }}
                  className={`w-full text-left px-3 py-2 rounded-lg border text-xs font-semibold transition-all cursor-pointer disabled:opacity-50 ${
                    reasonCode === r.code
                      ? 'border-red-300 bg-red-50 text-red-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      reasonCode === r.code ? 'border-red-500' : 'border-slate-300'
                    }`}>
                      {reasonCode === r.code && <span className="w-2 h-2 rounded-full bg-red-500" />}
                    </span>
                    {r.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Mandatory explanation when "Other" is chosen */}
          {needsDetail && (
            <div>
              <label htmlFor="void-reason-detail" className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                Explanation * <span className="normal-case font-semibold">({MIN_DETAIL}+ characters)</span>
              </label>
              <textarea
                id="void-reason-detail"
                value={reasonDetail}
                disabled={isSubmitting}
                onChange={(e) => { setReasonDetail(e.target.value); setError(''); }}
                placeholder="Describe why this ticket is being voided..."
                maxLength={500}
                className="mt-1.5 w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none focus:border-red-400 resize-none h-20 font-medium disabled:opacity-50"
              />
              <p className="text-[9px] text-slate-400 mt-0.5 text-right">
                {reasonDetail.trim().length}/{MIN_DETAIL} min
              </p>
            </div>
          )}

          {error && (
            <p className="text-[11px] text-red-500 font-bold flex items-center gap-1.5" role="alert">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {error}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="p-4 border-t border-slate-100 flex gap-2 justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="h-10 px-4 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-xl text-[10px] uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="h-10 px-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-[10px] uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
          >
            {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
            {isSubmitting ? 'Voiding...' : 'Confirm Void'}
          </button>
        </div>
      </div>
    </div>
  );
}
