import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Check, Printer, X, Percent, CreditCard, Smartphone,
  SplitSquareVertical, RotateCcw, Ticket,
  ChevronLeft, Loader2, AlertTriangle, FileText, Search, ChevronRight, Pencil,
} from 'lucide-react';
import { useCartStore, useUiStore, useSettingsStore, useAuthStore } from '../../../store';
import { orderApi } from '../../../api/order.api';
import { paymentApi } from '../../../api/payment.api';
import { billApi } from '../../../api/bill.api';
import { discountApi } from '../../../api/discount.api';
import { openBillPrintPreview } from '../../../services/printService';
import { canHandleBilling, getRoleDisplayName } from '../../../utils/permissions';

const PAYMENT_METHODS = [
  { key: 'CASH', label: 'Cash', icon: () => (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M12 4v16"/><circle cx="12" cy="12" r="3"/></svg>
  ), color: 'emerald' },
  { key: 'CARD', label: 'Card', icon: CreditCard, color: 'blue' },
  { key: 'UPI', label: 'UPI', icon: Smartphone, color: 'purple' },
];

const QUICK_AMOUNTS = [100, 200, 500, 1000, 2000];

// ─── Numeric Keypad ────────────────────────────────────────────────────────
function NumericKeypad({ onPress, onClear, onBackspace, className = '' }) {
  const keys = [
    [1, 2, 3],
    [4, 5, 6],
    [7, 8, 9],
    ['C', 0, '⌫'],
  ];
  return (
    <div className={`grid grid-cols-3 gap-1.5 ${className}`}>
      {keys.flat().map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => {
            if (key === 'C') onClear();
            else if (key === '⌫') onBackspace();
            else if (typeof key === 'number') onPress(key);
          }}
          data-key={key}
          className="h-11 sm:h-12 text-sm font-bold bg-white hover:bg-slate-100 border border-slate-200 
            hover:border-slate-300 rounded-xl transition-all active:scale-95 cursor-pointer
            disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {key === 'C' ? (
            <span className="text-red-500 text-xs font-bold">CLEAR</span>
          ) : (
            key
          )}
        </button>
      ))}
    </div>
  );
}

// ─── Discount helpers ────────────────────────────────────────────────────────
// Mirrors the backend's shared discount calculation (src/utils/discount.js) so
// the cashier preview, bill, payment and reports all agree on ONE calculation.
const sanitizeDiscountInput = (raw) => {
  if (raw == null) return '';
  let s = String(raw).trim();
  if (s === '') return '';
  // Digits + a single decimal point only (letters/symbols stripped)
  s = s.replace(/[^\d.]/g, '');
  const parts = s.split('.');
  if (parts.length > 2) s = `${parts[0]}.${parts.slice(1).join('')}`;
  // Strip unnecessary leading zeros: "00219" → "219", keep "0.5" and "0"
  s = s.replace(/^0+(?=\d)/, '');
  if (s.startsWith('.')) s = `0${s}`;
  // Max 2 decimal places
  const [int, dec] = s.split('.');
  if (dec !== undefined) s = `${int}.${dec.slice(0, 2)}`;
  return s;
};

// discountAmount = subtotal × value / 100 (PERCENTAGE) or the entered amount
// (FLAT), clamped to the subtotal so the payable can never go negative.
const calculateDiscount = (discountType, discountValue, subtotal) => {
  if (!discountType || discountValue === '' || discountValue == null) return 0;
  const value = Number(discountValue);
  const sub = Number(subtotal);
  if (!Number.isFinite(value) || !Number.isFinite(sub) || value <= 0 || sub <= 0) return 0;
  let amount = discountType === 'PERCENTAGE' ? (sub * value) / 100 : value;
  if (amount > sub) amount = sub;
  return Math.round(amount * 100) / 100;
};

// ─── Discount Keypad (touch-friendly, mirrors the cash keypad) ──────────────
function DiscountKeypad({ onPress, onClear, onBackspace }) {
  const keys = [
    [1, 2, 3],
    [4, 5, 6],
    [7, 8, 9],
    ['.', 0, '⌫'],
  ];
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {keys.flat().map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => {
            if (key === '⌫') onBackspace();
            else if (key === '.') onPress('.');
            else onPress(String(key));
          }}
          className="h-11 text-sm font-bold bg-white hover:bg-slate-100 border border-slate-200 
            hover:border-slate-300 rounded-xl transition-all active:scale-95 cursor-pointer"
        >
          {key}
        </button>
      ))}
      <button
        type="button"
        onClick={onClear}
        className="h-11 col-span-3 text-xs font-bold bg-red-50 hover:bg-red-100 border border-red-200 
          text-red-600 rounded-xl transition-all active:scale-95 cursor-pointer"
      >
        CLEAR
      </button>
    </div>
  );
}

// ─── Discount Panel — type toggle + value + live preview + apply ─────────────
function DiscountPanel({
  subtotal, taxAmount, serviceCharge, roundOffEnabled, currency,
  initialType, initialValue, onCancel, onApply,
}) {
  const [type, setType] = useState(initialType === 'FLAT' ? 'FLAT' : 'PERCENTAGE');
  const [value, setValue] = useState(initialValue || '');
  const [error, setError] = useState('');

  const sanitized = sanitizeDiscountInput(value);
  const num = sanitized === '' ? 0 : Number(sanitized);
  const previewDiscount = calculateDiscount(type, sanitized, subtotal);
  const previewBase = subtotal - previewDiscount + serviceCharge + taxAmount;
  const previewRoundOff = roundOffEnabled
    ? Number((Math.round(previewBase) - previewBase).toFixed(2))
    : 0;
  const previewPayable = Math.max(0, previewBase + previewRoundOff);

  const handleApply = () => {
    if (sanitized === '') {
      setError('Enter a discount value');
      return;
    }
    if (!Number.isFinite(num) || num < 0) {
      setError('Enter a valid discount value');
      return;
    }
    if (type === 'PERCENTAGE' && num > 100) {
      setError('Percentage must be between 0 and 100');
      return;
    }
    if (type === 'FLAT' && num > subtotal) {
      // Clamp silently to the subtotal — payable can never go negative
      onApply('FLAT', sanitized);
      return;
    }
    onApply(type, sanitized);
  };

  const previewRows = [
    { label: 'Subtotal', value: subtotal, negative: false },
    { label: type === 'PERCENTAGE' ? `Discount (${sanitized || '0'}%)` : 'Discount', value: -previewDiscount, negative: true },
    { label: 'Tax', value: taxAmount, negative: false },
    { label: 'Service Charge', value: serviceCharge, negative: false },
  ];

  return (
    <div
      className="fixed inset-0 z-[110] bg-black/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fade-in"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm max-h-full overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h3 className="text-sm font-extrabold text-slate-800">Add Discount</h3>
          <button
            onClick={onCancel}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
            aria-label="Close discount panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3.5">
          {/* Discount Type toggle */}
          <div>
            <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Discount Type</label>
            <div className="grid grid-cols-2 gap-2 mt-1.5">
              <button
                type="button"
                onClick={() => setType('PERCENTAGE')}
                className={`h-12 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                  type === 'PERCENTAGE'
                    ? 'bg-[#16A34A] border-[#16A34A] text-white shadow-sm'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                Percentage %
              </button>
              <button
                type="button"
                onClick={() => setType('FLAT')}
                className={`h-12 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                  type === 'FLAT'
                    ? 'bg-[#16A34A] border-[#16A34A] text-white shadow-sm'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                Amount {currency}
              </button>
            </div>
          </div>

          {/* Discount Value input */}
          <div>
            <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Discount Value</label>
            <input
              type="text"
              inputMode="decimal"
              value={sanitized}
              onChange={(e) => setValue(e.target.value)}
              placeholder={type === 'PERCENTAGE' ? '0 – 100' : '0.00'}
              className="mt-1.5 w-full h-12 px-3 text-right text-xl font-extrabold font-mono bg-slate-50 
                border border-slate-200 rounded-xl text-slate-800 outline-none focus:border-[#16A34A] focus:bg-white transition-all"
            />
            <p className="mt-1.5 text-[9px] font-bold text-slate-400 text-right">
              {type === 'PERCENTAGE' ? `Discount = ${currency}${previewDiscount.toFixed(2)} (${sanitized || 0}%)` : `Discount = ${currency}${previewDiscount.toFixed(2)}`}
            </p>
            <DiscountKeypad
              onPress={(k) => setValue((p) => sanitizeDiscountInput(p + k))}
              onClear={() => setValue('')}
              onBackspace={() => setValue((p) => sanitizeDiscountInput(p.slice(0, -1)))}
            />
          </div>

          {/* Live Preview */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1.5">
            {previewRows.map((row) => (
              <div key={row.label} className="flex justify-between text-[11px]">
                <span className={row.negative ? 'text-red-600 font-semibold' : 'text-slate-500'}>{row.label}</span>
                <span className={`font-mono font-bold ${row.negative ? 'text-red-600' : 'text-slate-700'}`}>
                  {row.negative ? `-${currency}${Math.abs(row.value).toFixed(2)}` : `${currency}${row.value.toFixed(2)}`}
                </span>
              </div>
            ))}
            {previewRoundOff !== 0 && (
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-500">Round Off</span>
                <span className="font-mono font-bold text-slate-600">{currency}{previewRoundOff.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-extrabold border-t border-slate-200 pt-2 mt-1">
              <span className="text-[#16A34A]">Payable</span>
              <span className="font-mono text-[#16A34A]">{currency}{previewPayable.toFixed(2)}</span>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
              <span className="text-[10px] font-semibold text-red-700">{error}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="flex-1 h-12 border-2 border-slate-200 hover:border-slate-300 rounded-xl text-xs font-bold 
                text-slate-600 hover:text-slate-800 transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              className="flex-1 h-12 bg-[#16A34A] hover:bg-[#15803D] text-white font-extrabold rounded-xl 
                text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 
                shadow-sm transition-all cursor-pointer"
            >
              <Check className="w-4 h-4" /> Apply Discount
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Applied Discount chip — shows the live discount with Change / Remove ────
function AppliedDiscount({ discountType, discountValue, discountAmount, currency, onEdit, onRemove }) {
  const label = discountType === 'PERCENTAGE'
    ? `Discount ${Number(discountValue || 0)}%`
    : discountType === 'FLAT' && Number(discountValue || 0) > 0
      ? `Discount ${currency}${Number(discountValue).toFixed(0)}`
      : 'Discount';
  return (
    <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-2.5 py-1.5 min-w-0">
      <Percent className="w-3.5 h-3.5 text-red-500 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold text-red-700 truncate leading-tight">{label}</p>
        <p className="text-[10px] font-mono font-bold text-red-500">-{currency}{discountAmount.toFixed(2)}</p>
      </div>
      <button
        onClick={onEdit}
        className="h-9 px-2.5 text-[9px] font-bold text-red-700 bg-white border border-red-200 rounded-lg 
          hover:bg-red-100 transition-all cursor-pointer flex items-center gap-1 shrink-0"
      >
        <Pencil className="w-3 h-3" /> Change
      </button>
      <button
        onClick={onRemove}
        className="h-9 w-9 flex items-center justify-center text-red-500 hover:text-red-700 hover:bg-red-100 
          rounded-lg transition-colors cursor-pointer shrink-0"
        aria-label="Remove discount"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

// ─── Promotion Discount Panel — eligible discounts + promo code + staff ─────
// §21/§22: presents ONLY what the backend engine already declared eligible;
// the apply call re-validates everything server-side (frontend is never the
// source of truth for eligibility or the final amount).
function PromotionDiscountPanel({
  orderId, subtotal, currency, onClose, onApplied, onError,
}) {
  const [eligible, setEligible] = useState([]);
  const [excluded, setExcluded] = useState([]);
  const [loading, setLoading] = useState(true);
  const [promoCode, setPromoCode] = useState('');
  const [staffValue, setStaffValue] = useState('');
  // STAFF discounts: the real staff member receiving the discount (§6)
  const [staffDir, setStaffDir] = useState(null); // tenant staff directory
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [staffSearch, setStaffSearch] = useState('');
  const [applyingId, setApplyingId] = useState(null);
  const [error, setError] = useState('');

  const loadEligible = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const resp = await discountApi.getEligible(orderId);
      // §14: unwrap the REAL backend contract ({ success, data: { eligible, excluded } }) —
      // never guess the shape or fall back to fabricated data on failure.
      const raw = resp?.data ?? resp ?? {};
      const data = raw.data ?? raw ?? {};
      setEligible(data.eligible || []);
      setExcluded(data.excluded || []);
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to load eligible discounts');
      setEligible([]);
      setExcluded([]);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  // Tenant staff directory for the staff-member picker (§13) — real User data
  useEffect(() => {
    let cancelled = false;
    discountApi.refStaff()
      .then((resp) => { if (!cancelled) setStaffDir(resp?.staff || resp?.data?.staff || []); })
      .catch(() => { if (!cancelled) setStaffDir([]); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    loadEligible();
  }, [loadEligible]);

  const handleApply = async (payload, idToken) => {
    setApplyingId(idToken);
    setError('');
    try {
      const resp = await discountApi.apply(orderId, payload);
      onApplied(resp?.data?.data ?? resp?.data ?? resp);
    } catch (e) {
      // §7: show the backend's meaningful business-rule message — never a
      // generic "Failed to apply discount" that hides the actual reason.
      const msg = e.response?.data?.message
        || (Array.isArray(e.response?.data?.details) && e.response.data.details[0]?.message)
        || e.message
        || 'Failed to apply discount';
      setError(msg);
      onError?.(msg);
      // Refresh — the rejection may have changed eligibility (e.g. usage limit hit)
      loadEligible();
    } finally {
      setApplyingId(null);
    }
  };

  const regular = eligible.filter((d) => d.type === 'PERCENTAGE' || d.type === 'FIXED_AMOUNT');
  const promo = eligible.filter((d) => d.type === 'PROMO_CODE');
  const staff = eligible.filter((d) => d.type === 'STAFF');

  // Searchable staff picker list (§13) — every ACTIVE tenant staff member is
  // selectable: a STAFF discount is one common discount for ALL active staff,
  // so the picker never filters by a promotion's (legacy) staffRoles. The
  // backend directory (refStaff) already returns active, capability-valid staff.
  const staffChoices = useMemo(() => {
    let list = staffDir || [];
    if (!staffSearch.trim()) return list;
    const q = staffSearch.toLowerCase();
    return list.filter((s) => (s.name || '').toLowerCase().includes(q));
  }, [staffDir, staffSearch, staff]);

  const typeLabel = (d) =>
    d.type === 'PERCENTAGE' ? `${Number(d.discountValue)}% OFF`
      : d.type === 'FIXED_AMOUNT' ? `${currency}${Number(d.discountValue)} OFF`
        : d.type === 'PROMO_CODE' ? (d.label || `${Number(d.discountValue)} OFF`)
          : (d.label || 'Staff Discount');

  const scopeLabel = (d) =>
    d.scope === 'ENTIRE_ORDER' ? 'Entire Order'
      : d.scope === 'CATEGORIES' ? 'Selected Categories' : 'Selected Products';

  const renderCard = (d) => (
    <div key={`d-${d.id}`} className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold text-slate-800 truncate">{d.name}</p>
        <p className="text-[9px] font-semibold text-slate-500 truncate">
          {typeLabel(d)} · {scopeLabel(d)}
          {d.minimumOrderAmount > 0 ? ` · Min ${currency}${Number(d.minimumOrderAmount)}` : ''}
        </p>
      </div>
      <button
        onClick={() => handleApply({ discountId: d.id }, `d-${d.id}`)}
        disabled={applyingId !== null}
        className="h-9 px-3 bg-[#16A34A] hover:bg-[#15803D] disabled:bg-slate-300 text-white font-bold rounded-lg
          text-[9px] uppercase tracking-wider transition-all cursor-pointer shrink-0 flex items-center gap-1"
      >
        {applyingId === `d-${d.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
        Apply
      </button>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[110] bg-black/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 sticky top-0 bg-white z-10">
          <h3 className="text-sm font-extrabold text-slate-800">Available Discounts</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors cursor-pointer" aria-label="Close promotions panel">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : (
            <>
              {error && (
                <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                  <span className="text-[10px] font-semibold text-red-700">{error}</span>
                </div>
              )}

              {/* Promo Code — §15 */}
              <div>
                <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Promo Code</label>
                <div className="flex gap-2 mt-1.5">
                  <input
                    type="text"
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                    placeholder="Enter code"
                    className="flex-1 h-11 px-3 text-xs font-bold uppercase bg-slate-50 border border-slate-200 rounded-xl
                      text-slate-800 outline-none focus:border-[#16A34A] focus:bg-white transition-all"
                  />
                  <button
                    onClick={() => {
                      if (!promoCode.trim()) { setError('Enter a promo code'); return; }
                      handleApply({ promoCode: promoCode.trim() }, 'promo');
                    }}
                    disabled={applyingId !== null}
                    className="h-11 px-4 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-300 text-white font-bold rounded-xl text-[10px] uppercase transition-all cursor-pointer"
                  >
                    {applyingId === 'promo' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Apply'}
                  </button>
                </div>
              </div>

              {/* Staff Discount — §6: requires selecting the real staff member
                  receiving the discount; backend validates eligibility */}
              {staff.length > 0 && (
                <div>
                  <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Staff Discount</label>
                  {staffDir !== null && staffDir.length > 0 && (
                    <div className="mt-1.5">
                      <input
                        type="text"
                        value={staffSearch}
                        onChange={(e) => setStaffSearch(e.target.value)}
                        placeholder="Search staff..."
                        className="w-full h-9 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-[#16A34A]"
                      />
                      <div className="mt-1.5 max-h-32 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                        {staffChoices.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => setSelectedStaffId(selectedStaffId === s.id ? '' : s.id)}
                            className={`w-full flex items-center justify-between px-3 py-2 text-left transition-colors cursor-pointer ${
                              selectedStaffId === s.id ? 'bg-emerald-50' : 'hover:bg-slate-50'
                            }`}
                          >
                            <span className="text-[11px] font-bold text-slate-700">{s.name}</span>
                            <span className="flex items-center gap-2">
                              <span className="text-[9px] font-bold uppercase text-slate-400">{getRoleDisplayName(s.role)}</span>
                              <span
                                className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${
                                  selectedStaffId === s.id ? 'bg-[#16A34A] border-[#16A34A]' : 'border-slate-300 bg-white'
                                }`}
                              >
                                {selectedStaffId === s.id && <span className="text-white text-[8px] font-black">✓</span>}
                              </span>
                            </span>
                          </button>
                        ))}
                        {staffChoices.length === 0 && (
                          <p className="px-3 py-2 text-[10px] text-slate-400 italic">No staff match your search.</p>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="mt-1.5 space-y-2">
                    {staff.map((d) => {
                      const canApply = !!selectedStaffId;
                      return (
                        <div key={`s-${d.id}`} className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] font-bold text-slate-800 truncate">{d.name}</p>
                              <p className="text-[9px] font-semibold text-slate-500">
                                {d.label || `${Number(d.discountValue)}% OFF`}
                                {selectedStaffId && staffDir ?
                                  ` → ${((staffDir.find((s) => String(s.id) === String(selectedStaffId))?.name) || '')}` : ''}
                              </p>
                            </div>
                            {d.staffRequestedValue != null ? (
                              <div className="flex items-center gap-1.5 shrink-0">
                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  inputMode="decimal"
                                  value={staffValue}
                                  onChange={(e) => setStaffValue(e.target.value)}
                                  placeholder={`${Number(d.discountValue)}`}
                                  className="w-16 h-9 px-2 text-xs font-bold bg-white border border-slate-200 rounded-lg outline-none focus:border-[#16A34A]"
                                />
                                <button
                                  onClick={() => {
                                    if (!canApply) { setError('Select the staff member receiving this discount'); return; }
                                    handleApply({
                                      discountId: d.id,
                                      staffUserId: Number(selectedStaffId),
                                      staffRequestedValue: staffValue === '' ? undefined : Number(staffValue),
                                    }, `s-${d.id}`);
                                  }}
                                  disabled={applyingId !== null}
                                  className="h-9 px-3 bg-[#16A34A] hover:bg-[#15803D] disabled:bg-slate-300 text-white font-bold rounded-lg text-[9px] uppercase cursor-pointer"
                                >
                                  {applyingId === `s-${d.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Apply'}
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => {
                                  if (!canApply) { setError('Select the staff member receiving this discount'); return; }
                                  handleApply({ discountId: d.id, staffUserId: Number(selectedStaffId) }, `s-${d.id}`);
                                }}
                                disabled={applyingId !== null}
                                className={`h-9 px-3 text-white font-bold rounded-lg text-[9px] uppercase cursor-pointer shrink-0 ${
                                  canApply ? 'bg-[#16A34A] hover:bg-[#15803D]' : 'bg-slate-300'} disabled:bg-slate-300`}
                              >
                                {applyingId === `s-${d.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Apply'}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {staff.length > 0 && staffDir !== null && staffDir.length === 0 && (
                <p className="mt-1.5 text-[10px] font-semibold text-slate-400 italic">
                  No active staff members found for this restaurant.
                </p>
              )}
              {staff.length > 0 && staffDir === null && (
                <p className="mt-1.5 text-[10px] font-semibold text-amber-600">
                  Staff list could not be loaded — select a staff member after refreshing.
                </p>
              )}

              {/* Regular promotions */}
              {regular.length > 0 && (
                <div>
                  <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Promotions</label>
                  <div className="mt-1.5 space-y-2">{regular.map(renderCard)}</div>
                </div>
              )}

              {promo.length > 0 && (
                <div>
                  <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Active Codes</label>
                  <div className="mt-1.5 space-y-2">{promo.map(renderCard)}</div>
                </div>
              )}

              {/* §13: promotions that exist but are NOT currently eligible — shown
                  WITH their backend-provided reason so the "No eligible discounts"
                  empty state is always truthful (never a load failure in disguise). */}
              {excluded.length > 0 && (
                <div>
                  <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Not Eligible Now</label>
                  <div className="mt-1.5 space-y-1.5">
                    {excluded.map((d) => (
                      <div key={`x-${d.id}`} className="bg-slate-50/60 border border-slate-200/70 rounded-xl px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[11px] font-bold text-slate-500 truncate">{d.name}</p>
                          <span className="text-[9px] font-bold uppercase text-slate-400 shrink-0">{d.label}</span>
                        </div>
                        <p className="text-[9px] font-semibold text-slate-400 mt-0.5">{d.reasonLabel}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {regular.length === 0 && promo.length === 0 && staff.length === 0 && excluded.length === 0 && (
                <div className="text-center py-6">
                  <Percent className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                  <p className="text-[11px] font-bold text-slate-400">No eligible discounts for this order</p>
                  <p className="text-[9px] text-slate-300 mt-0.5">Promotions may be expired, out of schedule, or below minimum order</p>
                </div>
              )}

              <button
                onClick={onClose}
                className="w-full h-11 border-2 border-slate-200 hover:border-slate-300 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-800 transition-all cursor-pointer"
              >
                Cancel
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Cash Payment Component ────────────────────────────────────────────────
function CashPayment({ amount, onAmountChange, grandTotal, currency }) {
  const [input, setInput] = useState('');

  const received = parseFloat(input) || 0;
  const balance = received >= grandTotal ? received - grandTotal : 0;
  const remaining = received < grandTotal ? grandTotal - received : 0;

  const handleKeyPress = (digit) => {
    setInput((prev) => {
      const next = prev + String(digit);
      return next.length <= 8 ? next : prev;
    });
  };

  const handleClear = () => setInput('');
  const handleBackspace = () => setInput((prev) => prev.slice(0, -1));
  const handleQuickAmount = (amt) => setInput(String(amt));
  const handleExactAmount = () => setInput(String(Math.ceil(grandTotal)));

  useEffect(() => {
    onAmountChange(received);
  }, [received, onAmountChange]);

  return (
    <div className="space-y-3">
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
        <label className="text-[9px] font-bold uppercase text-slate-400 tracking-wider">
          Amount Received
        </label>
        <p className="text-2xl font-extrabold font-mono text-slate-800 mt-1">
          {input ? `${currency} ${parseFloat(input).toLocaleString('en-IN')}` : `${currency} 0`}
        </p>
        {received > 0 && (
          <div className="flex justify-center gap-4 mt-2 text-[10px] font-bold">
            {balance > 0 && (
              <span className="text-emerald-600">
                Balance: {currency} {balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            )}
            {remaining > 0 && (
              <span className="text-amber-600">
                Due: {currency} {remaining.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Quick Amounts */}
      <div className="flex flex-wrap gap-1.5 justify-center">
        <button
          type="button"
          onClick={handleExactAmount}
          className="px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 
            rounded-lg text-[9px] font-bold hover:bg-emerald-100 transition-all cursor-pointer"
        >
          Exact
        </button>
        {QUICK_AMOUNTS.map((amt) => (
          <button
            key={amt}
            type="button"
            onClick={() => handleQuickAmount(amt)}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 
              rounded-lg text-[10px] font-bold transition-all cursor-pointer"
          >
            {currency} {amt}
          </button>
        ))}
      </div>

      <NumericKeypad
        onPress={handleKeyPress}
        onClear={handleClear}
        onBackspace={handleBackspace}
      />
    </div>
  );
}

// ─── Card Payment Component ────────────────────────────────────────────────
function CardPayment({ onDetailsChange, currency, grandTotal }) {
  const [details, setDetails] = useState({
    cardType: 'VISA',
    transactionId: '',
    approvalCode: '',
    last4Digits: '',
  });

  const handleChange = (field, value) => {
    const updated = { ...details, [field]: value };
    setDetails(updated);
    onDetailsChange(updated);
  };

  return (
    <div className="space-y-3">
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
        <CreditCard className="w-8 h-8 text-blue-500 mx-auto mb-1" />
        <p className="text-lg font-bold font-mono text-slate-800">
          {currency} {grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-[9px] font-bold uppercase text-slate-400">Card Type</label>
          <select
            value={details.cardType}
            onChange={(e) => handleChange('cardType', e.target.value)}
            className="w-full h-8 px-2 bg-white border border-slate-200 rounded-lg text-[10px] font-bold outline-none focus:border-blue-500"
          >
            <option value="VISA">Visa</option>
            <option value="MASTERCARD">Mastercard</option>
            <option value="RUPAY">RuPay</option>
            <option value="AMEX">American Express</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[9px] font-bold uppercase text-slate-400">Last 4 Digits</label>
          <input
            type="text"
            maxLength={4}
            placeholder="1234"
            value={details.last4Digits}
            onChange={(e) => handleChange('last4Digits', e.target.value.replace(/\D/g, '').slice(0, 4))}
            className="w-full h-8 px-2 bg-white border border-slate-200 rounded-lg text-[10px] font-bold font-mono outline-none focus:border-blue-500"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-[9px] font-bold uppercase text-slate-400">Transaction Reference</label>
        <input
          type="text"
          placeholder="e.g., TXN123456"
          value={details.transactionId}
          onChange={(e) => handleChange('transactionId', e.target.value)}
          className="w-full h-8 px-2 bg-white border border-slate-200 rounded-lg text-[10px] font-bold outline-none focus:border-blue-500"
        />
      </div>

      <div className="space-y-1">
        <label className="text-[9px] font-bold uppercase text-slate-400">Approval Code</label>
        <input
          type="text"
          placeholder="e.g., APP123"
          value={details.approvalCode}
          onChange={(e) => handleChange('approvalCode', e.target.value)}
          className="w-full h-8 px-2 bg-white border border-slate-200 rounded-lg text-[10px] font-bold outline-none focus:border-blue-500"
        />
      </div>
    </div>
  );
}

// ─── UPI Payment Component ────────────────────────────────────────────────
function UpiPayment({ onDetailsChange, currency, grandTotal }) {
  const [details, setDetails] = useState({
    transactionId: '',
    upiRef: '',
  });

  const handleChange = (field, value) => {
    const updated = { ...details, [field]: value };
    setDetails(updated);
    onDetailsChange(updated);
  };

  return (
    <div className="space-y-3">
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
        <Smartphone className="w-8 h-8 text-purple-500 mx-auto mb-1" />
        <p className="text-lg font-bold font-mono text-slate-800">
          {currency} {grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
        </p>
        <p className="text-[9px] text-slate-400 mt-1">Scan any UPI app to pay</p>
      </div>

      <div className="space-y-1">
        <label className="text-[9px] font-bold uppercase text-slate-400">UPI Transaction ID</label>
        <input
          type="text"
          placeholder="e.g., UPI123456789"
          value={details.transactionId}
          onChange={(e) => handleChange('transactionId', e.target.value)}
          className="w-full h-8 px-2 bg-white border border-slate-200 rounded-lg text-[10px] font-bold outline-none focus:border-purple-500"
        />
      </div>

      <div className="space-y-1">
        <label className="text-[9px] font-bold uppercase text-slate-400">UPI Reference Number</label>
        <input
          type="text"
          placeholder="e.g., 412345678901"
          value={details.upiRef}
          onChange={(e) => handleChange('upiRef', e.target.value)}
          className="w-full h-8 px-2 bg-white border border-slate-200 rounded-lg text-[10px] font-bold outline-none focus:border-purple-500"
        />
      </div>

      {/* Quick Payment Confirmation */}
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => handleChange('transactionId', `UPI${Date.now()}`)}
          className="flex-1 h-7 bg-purple-50 border border-purple-200 text-purple-700 
            rounded-lg text-[8px] font-bold uppercase hover:bg-purple-100 transition-all cursor-pointer"
        >
          Generate TXN ID
        </button>
        <button
          type="button"
          onClick={() => handleChange('upiRef', String(Math.floor(100000000000 + Math.random() * 900000000000)))}
          className="flex-1 h-7 bg-purple-50 border border-purple-200 text-purple-700 
            rounded-lg text-[8px] font-bold uppercase hover:bg-purple-100 transition-all cursor-pointer"
        >
          Generate Ref No
        </button>
      </div>
    </div>
  );
}

// ─── Split Payment Component ───────────────────────────────────────────────
function SplitPayment({ onPaymentsChange, grandTotal, currency }) {
  const [splits, setSplits] = useState([
    { paymentMethod: 'CASH', amount: grandTotal, transactionId: '', notes: '' },
  ]);

  const totalSplit = splits.reduce((s, p) => s + Number(p.amount), 0);
  const remaining = grandTotal - totalSplit;

  const updateSplit = (index, field, value) => {
    const updated = splits.map((s, i) =>
      i === index ? { ...s, [field]: value } : s
    );
    setSplits(updated);
    onPaymentsChange(updated);
  };

  const addSplit = () => {
    if (splits.length >= 5) return;
    setSplits([...splits, { paymentMethod: 'CASH', amount: 0, transactionId: '', notes: '' }]);
  };

  const removeSplit = (index) => {
    if (splits.length <= 1) return;
    const updated = splits.filter((_, i) => i !== index);
    setSplits(updated);
    onPaymentsChange(updated);
  };

  // Auto-adjust last split
  useEffect(() => {
    if (splits.length > 1 && Math.abs(remaining) > 0.01) {
      const last = splits.length - 1;
      const adjusted = [...splits];
      const newAmt = Number((Number(adjusted[last].amount) + remaining).toFixed(2));
      adjusted[last] = { ...adjusted[last], amount: Math.max(0, newAmt) };
      setSplits(adjusted);
      onPaymentsChange(adjusted);
    }
  }, [grandTotal]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold text-slate-400 uppercase">
          Total: {currency} {grandTotal.toFixed(2)}
        </span>
        <span className={`text-[10px] font-bold ${Math.abs(remaining) < 0.5 ? 'text-emerald-600' : 'text-red-500'}`}>
          {Math.abs(remaining) < 0.5 ? '✓ Balanced' : `Remaining: ${currency} ${remaining.toFixed(2)}`}
        </span>
      </div>

      {splits.map((split, index) => (
        <div key={index} className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <select
              value={split.paymentMethod}
              onChange={(e) => updateSplit(index, 'paymentMethod', e.target.value)}
              className="h-7 px-1.5 bg-white border rounded text-[10px] font-bold outline-none"
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m.key} value={m.key}>{m.label}</option>
              ))}
            </select>
            <div className="flex items-center gap-1">
              <span className="text-[9px] text-slate-400 font-bold">{currency}</span>
              <input
                type="number"
                step="0.01"
                inputMode="decimal"
                value={split.amount}
                onChange={(e) => updateSplit(index, 'amount', parseFloat(e.target.value) || 0)}
                className="w-20 h-7 px-1.5 bg-white border rounded text-[10px] font-bold font-mono outline-none text-right"
              />
              {splits.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeSplit(index)}
                  className="p-1 text-red-400 hover:text-red-600 transition-colors cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
          <input
            type="text"
            placeholder="Transaction ref (optional)"
            value={split.transactionId}
            onChange={(e) => updateSplit(index, 'transactionId', e.target.value)}
            className="w-full h-7 px-1.5 bg-white border rounded text-[9px] outline-none"
          />
        </div>
      ))}

      {splits.length < 5 && (
        <button
          type="button"
          onClick={addSplit}
          className="w-full h-8 border-2 border-dashed border-slate-300 rounded-xl text-[10px] 
            font-bold text-slate-500 hover:border-slate-400 hover:text-slate-700 
            transition-all cursor-pointer"
        >
          + Add Payment Method
        </button>
      )}
    </div>
  );
}

// ─── Success Screen — compact cashier summary from the persisted bill response ──
function SuccessScreen({ bill, currency, cashReceived, onPrint, onReprint, onDone }) {
  const payments = bill?.payments || [];
  const grandTotal = Number(bill?.grandTotal || 0);
  const amountPaid = payments.length > 0
    ? payments.reduce((s, p) => s + Number(p.amount || 0), 0)
    : Number(bill?.paidAmount || grandTotal);

  // Cash received is the actual amount the cashier typed (not persisted); the
  // payable side always comes from the server bill. Change is only meaningful
  // for a single cash payment with an entered amount.
  const isSingleCash = payments.length === 1 && payments[0].paymentMethod === 'CASH';
  const cashEntered = isSingleCash ? Math.max(0, Number(cashReceived || 0)) : 0;
  const change = cashEntered > grandTotal ? cashEntered - grandTotal : 0;

  const methodName = (m) => ({
    CASH: 'Cash', CARD: 'Card', UPI: 'UPI',
  }[m] || m || '—');
  const methodChip = payments.length > 1
    ? `Split · ${payments.map((p) => methodName(p.paymentMethod)).join(' + ')}`
    : payments.length === 1
      ? methodName(payments[0].paymentMethod)
      : methodName(bill?.paymentMethod);

  const hasDiscount = Number(bill?.discount || 0) > 0;
  const showTax = Number(bill?.taxAmount || 0) > 0;
  const showSC = Number(bill?.serviceCharge || 0) > 0;
  const showRO = Number(bill?.roundOff || 0) !== 0;
  const showBreakdown = hasDiscount || showTax || showSC || showRO;

  const discountLabel = bill?.discountType === 'PERCENTAGE'
    ? `Discount (${Number(bill.discountValue || 0)}%)`
    : bill?.discountType === 'FLAT' && Number(bill.discountValue || 0) > 0
      ? `Discount (${currency}${Number(bill.discountValue).toFixed(0)})`
      : 'Discount';

  // Real persisted transaction references only — never generated here
  const txns = payments.map((p) => p.transactionId).filter(Boolean);
  const status = bill?.paymentStatus || bill?.status || 'PAID';

  const fmt = (n) => currency + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

  const Row = ({ label, value, strong, green, red, mono }) => (
    <div className="flex items-center justify-between gap-3 min-w-0">
      <span className={`text-[10px] shrink-0 ${strong ? 'font-extrabold text-slate-700' : 'font-semibold text-slate-500'}`}>
        {label}
      </span>
      <span className={`font-mono text-right min-w-0 truncate ${strong ? 'font-extrabold' : 'font-bold'} ${mono ? 'text-[9px]' : 'text-xs'} ${green ? 'text-[#16A34A]' : red ? 'text-red-600' : 'text-slate-700'}`}>
        {value}
      </span>
    </div>
  );

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-2 animate-fade-in select-none">
      {/* Success mark */}
      <div className="w-14 h-14 rounded-full bg-emerald-100 border border-emerald-200 
        flex items-center justify-center animate-success-pop">
        <Check className="w-7 h-7 text-emerald-600" strokeWidth={3} />
      </div>

      {/* Heading */}
      <div className="text-center">
        <h2 className="text-lg font-extrabold text-slate-800">Payment Collected</h2>
        <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-wider">
          Bill #{bill?.billNo}{bill?.order?.orderNo ? ` · Order #${bill.order.orderNo}` : ''}
        </p>
      </div>

      {/* Payment summary — all values from the persisted bill response */}
      <div className="w-full max-w-sm bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2.5">
        <Row label="Amount Paid" value={fmt(amountPaid)} strong green />
        <Row label="Payment Method" value={methodChip} />
        <Row label="Payment Status" value={status} strong green />

        {showBreakdown && (
          <>
            <div className="border-t border-slate-200" />
            <Row label="Subtotal" value={fmt(bill?.subtotal)} />
            {hasDiscount && <Row label={discountLabel} value={`-${fmt(bill?.discount)}`} red />}
            {showSC && <Row label="Service Charge" value={fmt(bill?.serviceCharge)} />}
            {showTax && <Row label="Tax" value={fmt(bill?.taxAmount)} />}
            {showRO && <Row label="Round Off" value={fmt(bill?.roundOff)} />}
            <Row label="Final Total" value={fmt(grandTotal)} strong green />
          </>
        )}

        {/* Cash change — shown whenever the cashier entered a received amount */}
        {cashEntered > 0 && (
          <>
            <div className="border-t border-slate-200" />
            <Row label="Amount Due" value={fmt(grandTotal)} />
            <Row label="Amount Received" value={fmt(cashEntered)} />
            <div className="flex items-center justify-between gap-3 bg-emerald-50 border border-emerald-200 
              rounded-xl px-3 py-2">
              <span className="text-[10px] font-extrabold text-emerald-700 uppercase tracking-wider">Change Returned</span>
              <span className="font-mono text-base font-extrabold text-emerald-700">{fmt(change)}</span>
            </div>
          </>
        )}

        {txns.length > 0 && (
          <>
            <div className="border-t border-slate-200" />
            <Row label={txns.length > 1 ? 'References' : 'Transaction ID'} value={txns.join(' · ')} mono />
          </>
        )}
      </div>

      {/* Actions — 44px+ touch targets, 2×2 on tablet portrait, wraps on mobile */}
      <div className="w-full max-w-sm flex flex-wrap gap-2">
        <button
          onClick={onPrint}
          className="flex-1 min-w-[150px] h-11 bg-[#16A34A] hover:bg-[#15803D] text-white font-bold rounded-xl text-[10px] 
            uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
        >
          <Printer className="w-3.5 h-3.5" /> Print Receipt
        </button>
        <button
          onClick={onReprint}
          className="flex-1 min-w-[110px] h-11 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 
            font-bold rounded-xl text-[10px] uppercase tracking-wider transition-all 
            flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Reprint
        </button>
        <button
          onClick={onDone}
          className="flex-1 min-w-[110px] h-11 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl text-[10px] 
            uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
        >
          <Check className="w-3.5 h-3.5" /> Done
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ║  BILLING PAGE (MAIN COMPONENT)                                       ║
// ═══════════════════════════════════════════════════════════════════════════
export default function BillingPage() {
  const { orders, collectPayment } = useCartStore();
  const { checkoutOrderId, setCheckoutOrderId, addToast, incrementRefreshTrigger } = useUiStore();
  const { settings } = useSettingsStore();
  const { user } = useAuthStore();
  // Payment collection is restricted to ADMIN / MANAGER / CASHIER (and SUPER_ADMIN).
  // The overlay is never rendered for KITCHEN / WAITER, even if checkoutOrderId
  // gets set through some non-UI path (e.g. a stale state from another session).
  const canBill = canHandleBilling(user?.role);

  const [activeTab, setActiveTab] = useState('CASH');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [billData, setBillData] = useState(null);
  const [orderDetails, setOrderDetails] = useState(null);
  const [cashReceived, setCashReceived] = useState(0);
  const [cardDetails, setCardDetails] = useState(null);
  const [upiDetails, setUpiDetails] = useState(null);
  const [splitPayments, setSplitPayments] = useState([]);
  // ── Cashier discount (single source of truth, mirrored with the backend) ──
  const [discountType, setDiscountType] = useState(null); // 'PERCENTAGE' | 'FLAT' | null
  const [discountValue, setDiscountValue] = useState(''); // raw cashier input
  const [showDiscountPanel, setShowDiscountPanel] = useState(false);
  // ── Promotion discounts (Discounts & Promotions module, §21) ──
  const [showPromoPanel, setShowPromoPanel] = useState(false);
  const [orderDiscounts, setOrderDiscounts] = useState([]); // persisted engine-applied snapshot
  const [serviceCharge, setServiceCharge] = useState(0);
  // Actual cash amount the cashier entered at collect time — shown on the
  // success screen (change = received − persisted payable). Not persisted.
  const [lastCashReceived, setLastCashReceived] = useState(0);
  // Re-entrancy guard: a double-tap on Collect must never fire two requests.
  // (The backend also rejects a second collect on a paid order — belt and braces.)
  const collectingRef = useRef(false);

  // ── Item search & pagination ──
  const ITEMS_PER_PAGE = 10;
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const currency = settings?.currencySymbol || '₹';

  // ── Fetch order from backend on mount ──
  useEffect(() => {
    if (checkoutOrderId) {
      loadOrder();
    }
  }, [checkoutOrderId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadOrder = async () => {
    try {
      const resp = await orderApi.getById(checkoutOrderId);
      if (resp.success && resp.data) {
        setOrderDetails(resp.data);
        // Inherit any discount already applied to the order so the bill never
        // silently drops it — and show the persisted service charge.
        setDiscountType(resp.data.discountType || null);
        setDiscountValue(resp.data.discountType ? String(resp.data.discountValue ?? '') : '');
        setServiceCharge(Number(resp.data.serviceCharge) || 0);
        // Engine-applied promotion discounts (OrderDiscount snapshot rows) —
        // these are the history of record; shown as read-only chips.
        setOrderDiscounts(resp.data.orderDiscounts || []);
      }
    } catch (e) {
      // Expected: order not found in backend, falling back to local store
      // Fallback to local store
      const localOrder = orders.find((o) => o.id === checkoutOrderId);
      if (localOrder) {
        setOrderDetails(localOrder);
        setDiscountType(localOrder.discountType || null);
        setDiscountValue(localOrder.discountType ? String(localOrder.discountValue ?? '') : '');
        setServiceCharge(Number(localOrder.serviceCharge) || 0);
      }
    }
  };

  // ── Computed Values ──
  const subtotal = useMemo(() => {
    if (!orderDetails) return 0;
    // Backend order has orderItems, local has items
    const items = orderDetails.orderItems || orderDetails.items || [];
    return items.reduce((acc, i) => acc + (Number(i.price) * (i.quantity || 1)), 0);
  }, [orderDetails]);

  const taxAmount = useMemo(() => {
    if (!orderDetails) return 0;
    return Number(orderDetails.taxAmount) || (subtotal * (settings?.taxPercentage || 0) / 100);
  }, [orderDetails, subtotal, settings]);

  // ── Cashier discount amount — recomputed live on every keystroke ──
  const discountAmount = useMemo(
    () => calculateDiscount(discountType, discountValue, subtotal),
    [discountType, discountValue, subtotal]
  );

  // Engine-applied promotion discounts — the backend has already persisted the
  // authoritative amounts on the order; the frontend only mirrors them (§20).
  const promotionDiscountTotal = useMemo(
    () => orderDiscounts.reduce((sum, od) => sum + (Number(od.discountAmount) || 0), 0),
    [orderDiscounts]
  );
  const totalDiscountAmount = discountAmount + promotionDiscountTotal;

  // ── Round Off: auto-calculate if enabled in settings ──
  const baseTotal = subtotal - totalDiscountAmount + serviceCharge + taxAmount;
  const roundOffEnabled = settings?.roundOffEnabled !== false;
  const roundOff = roundOffEnabled
    ? Number((Math.round(baseTotal) - baseTotal).toFixed(2))
    : 0;
  const grandTotal = Math.max(0, baseTotal + roundOff);

  // ── Payment building ──
  const buildPayments = useCallback(() => {
    if (activeTab === 'SPLIT') {
      return splitPayments
        .filter((p) => Number(p.amount) > 0)
        .map((p) => ({
          paymentMethod: p.paymentMethod,
          amount: Number(p.amount),
          transactionId: p.transactionId || null,
        }));
    }

    let method = activeTab;
    let amount = grandTotal;
    let transactionId = null;

    if (activeTab === 'CASH') {
      // Never send more than the payable — any excess is returned as change.
      amount = cashReceived > 0 ? Math.min(cashReceived, grandTotal) : grandTotal;
    } else if (activeTab === 'CARD') {
      transactionId = cardDetails?.transactionId || `CARD${Date.now()}`;
    } else if (activeTab === 'UPI') {
      transactionId = upiDetails?.transactionId || `UPI${Date.now()}`;
    }

    return [{ paymentMethod: method, amount: Number(amount), transactionId }];
  }, [activeTab, cashReceived, cardDetails, upiDetails, splitPayments, grandTotal]);

  // ── Handle Collect Payment ──
  const handleCollectPayment = async () => {
    if (!orderDetails || !checkoutOrderId) return;
    if (!canBill) return; // KITCHEN / WAITER must never collect payment (defense in depth)
    if (collectingRef.current) return; // double-tap guard

    // Validate
    if (activeTab === 'CASH' && cashReceived < grandTotal && cashReceived > 0) {
      setError(`Received amount (${currency}${cashReceived.toFixed(2)}) is less than total`);
      return;
    }

    setError('');
    setLoading(true);
    collectingRef.current = true;
    // Capture the entered cash amount for the success screen (change display)
    setLastCashReceived(activeTab === 'CASH' ? cashReceived : 0);

    try {
      const payments = buildPayments();
      const result = await collectPayment(checkoutOrderId, payments, {
        discount: totalDiscountAmount,
        discountType: promotionDiscountTotal > 0 ? undefined : (discountType || undefined),
        discountValue: promotionDiscountTotal > 0 ? 0 : (discountType ? Number(discountValue) : 0),
        serviceCharge,
        roundOff,
      });

      if (result) {
        // The result may be a full bill response or an { alreadyPaid, bill, payments } wrapper
        const billPayload = result.alreadyPaid ? result.bill : result;
        const paymentsList = result.payments || billPayload?.payments || [];
        const isAlreadyPaid = !!result.alreadyPaid;

        setBillData(billPayload);
        setSuccess(true);
        incrementRefreshTrigger();

        if (isAlreadyPaid) {
          addToast(`Bill #${billPayload.billNo || billPayload.id} was already paid.`, 'info');
        } else {
          addToast(`Payment collected successfully! Bill #${billPayload.billNo || billPayload.id}`, 'success');
        }

        // Auto-print if enabled
        try {
          const billId = billPayload?.id || billPayload?.bill?.id;
          if (billId) {
            await paymentApi.markPrinted(billId);
          }
          if (settings?.autoPrintBill) {
            // Use the server-returned bill so the printed receipt always matches
            // the persisted database values (never a stale frontend total).
            openBillPrintPreview(buildPrintData(
              billPayload,
              orderDetails
            ));
          }
        } catch (printErr) {
          // Non-critical
        }
      }
    } catch (e) {
      const msg = e?.response?.data?.message || e?.message || 'Payment failed';
      setError(msg);
      addToast(msg, 'error');
    } finally {
      setLoading(false);
      collectingRef.current = false;
    }
  };

  // ── Helper: build normalized print data from billData + orderDetails ──
  // Single source of truth for all bill printing. Uses server values when
  // available (authoritative) and falls back to frontend computations.
  const buildPrintData = (bill, order) => {
    const items = order?.orderItems || order?.items || [];
    const billId = bill?.id || bill?.bill?.id;
    const src = bill?.billNo ? bill : (bill?.bill || bill || {});
    // ── Restaurant identity resolution chain ──
    // 1. Bill/order response restaurant identity (if backend returned it)
    // 2. Authenticated tenant settings (frontend store)
    // 3. Empty string fallback — printService will use 'Restaurant' as last resort
    const billIdentity = bill?.restaurant || {};
    const resolveIdentity = (billField, settingsFallback) => {
      // Priority: bill response > settings store > empty string
      // settingsFallback is a function that extracts the value from settings
      const billVal = billIdentity[billField];
      const settingsVal = settingsFallback();
      if (billVal != null && billVal !== '') return billVal;
      if (settingsVal != null && settingsVal !== '') return settingsVal;
      if (billVal != null) return billVal;
      if (settingsVal != null) return settingsVal;
      return '';
    };
    return {
      // Restaurant identity: resolved from bill response or settings store
      restaurantName: resolveIdentity('restaurantName', () => settings?.branding?.restaurantName),
      address: resolveIdentity('address', () => settings?.address),
      phone: resolveIdentity('phone', () => settings?.contactNumber),
      email: resolveIdentity('email', () => settings?.email),
      gstNumber: resolveIdentity('gstNumber', () => settings?.gstNumber),
      fssaiNumber: resolveIdentity('fssaiNumber', () => settings?.fssaiNumber),
      logo: resolveIdentity('logo', () => settings?.branding?.logo),
      receiptFooter: resolveIdentity('receiptFooter', () => settings?.receiptFooterMessage),
      // Bill identifiers
      billNo: src.billNo || String(billId || ''),
      orderNo: order?.orderNo || String(order?.id || ''),
      tableNo: order?.table?.tableNo || '',
      orderType: order?.orderType || 'DINE_IN',
      customerName: order?.customer?.name || '',
      staffName: user?.name || '',
      status: src.status || '',
      // Items (from order, authoritative)
      items,
      // Financial values (server bill is authoritative, frontend is fallback)
      subtotal: Number(src.subtotal ?? order?.subtotal ?? 0),
      discount: Number(src.discount ?? discountAmount),
      discountType: src.discountType || discountType || '',
      discountValue: src.discountValue ?? (discountType ? Number(discountValue) : 0),
      serviceCharge: Number(src.serviceCharge ?? serviceCharge),
      taxAmount: Number(src.taxAmount ?? order?.taxAmount ?? 0),
      roundOff: Number(src.roundOff ?? roundOff ?? 0),
      grandTotal: Number(src.grandTotal ?? grandTotal),
      paidAmount: Number(src.paidAmount ?? src.grandTotal ?? grandTotal),
      balanceAmount: Number(src.balanceAmount ?? 0),
      payments: bill?.payments || src.payments || [],
      date: src.createdAt || new Date(),
      paperSize: '80mm',
    };
  };

  // ── Helper: fetch bill from backend if local data is insufficient ──
  const ensureBillData = async (billId) => {
    if (!billId) return null;
    // Try to fetch from backend for the most up-to-date bill data
    try {
      const billResp = await billApi.getById(billId);
      if (billResp?.success && billResp?.data) {
        return billResp.data;
      }
    } catch (e) {
      // Expected: bill fetch failed, will try alternate lookup
    }
    return null;
  };

  // ── Receipt Actions ──
  const handlePrint = async () => {
    let billId = billData?.id || billData?.bill?.id;
    let currentBillData = billData;
    let currentOrderDetails = orderDetails;

    // If bill data is missing, try to fetch it from backend
    if (!billId || !currentBillData) {
      if (checkoutOrderId) {
        currentBillData = await ensureBillData(null);
        // Try to find bill by order ID
        try {
          const billsResp = await billApi.getAll();
          if (billsResp?.success && billsResp?.data) {
            const bills = Array.isArray(billsResp.data) ? billsResp.data : [];
            const foundBill = bills.find(b => b.orderId === checkoutOrderId || b.order?.id === checkoutOrderId);
            if (foundBill) {
              currentBillData = foundBill;
              billId = foundBill.id;
            }
          }
        } catch (e) {
          // Expected: bill search failed, continuing with available data
        }
      }
    }

    if (!billId) {
      addToast('No bill data available for printing. Please try again.', 'warning');
      return;
    }
    try {
      // Mark as printed in backend
      await paymentApi.markPrinted(billId);
      
      // Use available bill data for print
      if (currentBillData && currentOrderDetails) {
        openBillPrintPreview(buildPrintData(currentBillData, currentOrderDetails));
        addToast(`Bill #${currentBillData.billNo || billId} printed successfully!`, 'success');
      } else if (currentBillData) {
        // Use bill data alone (order data may be embedded)
        const embeddedOrder = currentBillData.order || {};
        openBillPrintPreview(buildPrintData(currentBillData, embeddedOrder));
        addToast(`Bill #${currentBillData.billNo || billId} printed successfully!`, 'success');
      } else {
        addToast('Bill data not available for print preview.', 'warning');
      }
    } catch (e) {
      addToast('Unable to connect to the printer. Please check your printer settings and try again.', 'error');
    }
  };

  const handleReprint = async () => {
    let billId = billData?.id || billData?.bill?.id;
    let currentBillData = billData;
    let currentOrderDetails = orderDetails;

    // If bill data is missing, try to fetch it from backend
    if (!billId || !currentBillData) {
      if (checkoutOrderId) {
        try {
          const billsResp = await billApi.getAll();
          if (billsResp?.success && billsResp?.data) {
            const bills = Array.isArray(billsResp.data) ? billsResp.data : [];
            const foundBill = bills.find(b => b.orderId === checkoutOrderId || b.order?.id === checkoutOrderId);
            if (foundBill) {
              currentBillData = foundBill;
              billId = foundBill.id;
            }
          }
        } catch (e) {
          // Expected: bill search failed, continuing with available data
        }
      }
    }

    if (!billId) {
      addToast('No bill data available for reprinting. Please try again.', 'warning');
      return;
    }
    try {
      // Mark as reprint in backend
      await paymentApi.reprint(billId);
      
      // Use available bill data for print
      if (currentBillData && currentOrderDetails) {
        openBillPrintPreview(buildPrintData(currentBillData, currentOrderDetails));
        addToast(`Bill #${currentBillData.billNo || billId} reprinted successfully!`, 'success');
      } else if (currentBillData) {
        const embeddedOrder = currentBillData.order || {};
        openBillPrintPreview(buildPrintData(currentBillData, embeddedOrder));
        addToast(`Bill #${currentBillData.billNo || billId} reprinted successfully!`, 'success');
      } else {
        addToast('Bill data not available for print preview.', 'warning');
      }
    } catch (e) {
      addToast('Unable to connect to the printer. Please check your printer settings and try again.', 'error');
    }
  };

  const handleDone = () => {
    setCheckoutOrderId(null);
    setSuccess(false);
    setBillData(null);
    setOrderDetails(null);
    setDiscountType(null);
    setDiscountValue('');
    setShowDiscountPanel(false);
    setShowPromoPanel(false);
    setOrderDiscounts([]);
    setServiceCharge(0);
    setLastCashReceived(0);
    setError('');
  };

  // ── Cashier discount actions ──
  const openDiscountPanel = () => {
    setShowDiscountPanel(true);
  };

  const applyDiscount = (type, value) => {
    // Mirrors the backend manual-discount stacking guard: a manual cashier
    // discount and an applied promotion can never co-exist, so the displayed
    // total always equals the backend's authoritative amount (§15).
    if (orderDiscounts.length > 0) {
      setError('Remove the applied promotion before adding a manual discount');
      return;
    }
    setDiscountType(type);
    setDiscountValue(value);
    setShowDiscountPanel(false);
  };

  const removeDiscount = () => {
    setDiscountType(null);
    setDiscountValue('');
  };

  // ── Promotion discount actions (Discounts & Promotions module) ──
  const handlePromotionApplied = (payload) => {
    // The backend returns { orderDiscount, totalDiscount, totalAmount } — the
    // persisted snapshot is appended locally (order refresh re-syncs too).
    if (payload?.orderDiscount) {
      setOrderDiscounts((prev) => [...prev, payload.orderDiscount]);
    }
    setShowPromoPanel(false);
    // Any pending legacy cashier discount is dropped — the engine-applied
    // promotion is authoritative and legacy fields would double-count (§15).
    setDiscountType(null);
    setDiscountValue('');
    setShowDiscountPanel(false);
    // Reload the order so discount/totalAmount come from the database, never
    // a frontend recomputation (§20 — backend is the source of truth).
    loadOrder();
  };

  const handleRemoveApplied = async (orderDiscountId) => {
    try {
      await discountApi.removeApplied(orderDiscountId);
      setOrderDiscounts((prev) => prev.filter((od) => od.id !== orderDiscountId));
      addToast('Discount removed.', 'success');
      loadOrder();
    } catch (e) {
      addToast(e.response?.data?.message || 'Failed to remove discount', 'error');
    }
  };

  // ── Filtered & paginated items (MUST be before early returns to keep hooks consistent) ──
  const allComputedItems = orderDetails?.orderItems || orderDetails?.items || [];
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return allComputedItems;
    const q = searchQuery.toLowerCase();
    return allComputedItems.filter(item => {
      const name = (item.menuItem?.name || item.name || '').toLowerCase();
      const notes = (item.notes || '').toLowerCase();
      return name.includes(q) || notes.includes(q);
    });
  }, [allComputedItems, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedItems = useMemo(() => {
    const start = (safePage - 1) * ITEMS_PER_PAGE;
    return filteredItems.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredItems, safePage]);

  // Reset to page 1 when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  // ── Don't render anything if no checkout order is selected, or the user's
  // role cannot handle billing (KITCHEN / WAITER) — the overlay is a payment
  // surface and must never render for them. (must be after all hooks to keep
  // React hook count consistent)
  if (!checkoutOrderId || !canBill) return null;

  // Portrait/mobile (<lg): show the sticky bottom payment bar (Total + Collect)
  // so the primary action is always visible; tablet landscape/desktop keep the
  // two-panel layout with the in-panel footer instead.
  const showStickyBar = !!orderDetails && !success;

  // ── Render overlay content ──
  const renderContent = () => {
    // Loading state
    if (!orderDetails) {
      return (
        <div className="flex items-center justify-center h-full text-slate-400 text-sm italic">
          {checkoutOrderId ? 'Loading order...' : 'No order selected for checkout.'}
        </div>
      );
    }

    // Success Screen — compact centered card, scrolls naturally when space is tight
    if (success) {
      return (
        <div className="min-h-full flex items-center justify-center p-2 sm:p-3">
          <div className="bg-white rounded-[20px] border border-slate-200 p-5 shadow-xs w-full max-w-md">
            <SuccessScreen
              bill={billData}
              currency={currency}
              cashReceived={lastCashReceived}
              onPrint={handlePrint}
              onReprint={handleReprint}
              onDone={handleDone}
            />
          </div>
        </div>
      );
    }

    // Main Payment Screen
    const orderName = orderDetails?.orderNo || orderDetails?.orderNumber || `#${checkoutOrderId}`;
    const tableName = orderDetails?.table?.tableNo || orderDetails?.tableName || '-';
    const orderType = orderDetails?.orderType || 'DINE_IN';
    const customerName = orderDetails?.customer?.name || orderDetails?.customerName || '';
    const allItems = orderDetails?.orderItems || orderDetails?.items || [];
    const status = orderDetails?.status || 'PENDING';
    // §23: counter orders (BASIC_POS) never show table/dine-in terminology —
    // only real table rows render table labels; otherwise the badge is a
    // neutral "Counter"/"Take Away" chip exactly as before.
    const isCounterOrderType = orderType === 'COUNTER_SALE';
    const typeLabel = isCounterOrderType ? 'Counter Order' : orderType === 'DINE_IN' ? 'Dine In' : 'Take Away';

    return (
      <div className="flex flex-col lg:flex-row gap-4 w-full animate-fade-in max-w-7xl mx-auto select-none min-h-0 overflow-hidden lg:h-full">
      {/* ═══ LEFT PANEL: Order Summary ═══ */}
      <div className="lg:w-[45%] lg:h-full max-h-[45vh] lg:max-h-none bg-white rounded-[20px] border border-slate-200 shadow-xs flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setCheckoutOrderId(null); }}
                className="p-1 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4 text-slate-500" />
              </button>
              <h3 className="text-sm font-extrabold text-slate-800">
                {orderName}
              </h3>
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider ${
                orderType === 'DINE_IN' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'
              }`}>
                {typeLabel}
              </span>
            </div>
            <span className="text-[9px] font-bold text-slate-400">
              {orderType === 'DINE_IN' && tableName !== '-' ? `Table ${tableName}` : typeLabel}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[9px] text-slate-500 font-semibold mt-1">
            {orderType === 'DINE_IN' && tableName !== '-' && <span>Table: {tableName}</span>}
            {customerName && <span>Customer: {customerName}</span>}
            {orderDetails?.kot?.[0]?.kotNo && (
              <span className="flex items-center gap-1">
                <FileText className="w-3 h-3 text-amber-500" />
                KOT: <span className="font-bold">{orderDetails.kot[0].kotNo}</span>
              </span>
            )}
            <span>Status: <span className="font-bold uppercase">{status}</span></span>
          </div>
        </div>

        {/* Search */}
        {allComputedItems.length > ITEMS_PER_PAGE && (
          <div className="px-4 pt-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Search ${allComputedItems.length} items...`}
                className="w-full h-8 pl-8 pr-3 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-medium outline-none focus:border-[#16A34A] focus:bg-white transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Items Count Badge */}
        <div className="flex items-center justify-between px-4 pt-2 pb-1">
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
            {searchQuery ? `${filteredItems.length} of ${allComputedItems.length} items` : `${allComputedItems.length} items`}
          </span>
          {totalPages > 1 && (
            <span className="text-[9px] font-bold text-slate-400">
              Page {safePage} of {totalPages}
            </span>
          )}
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-4 pb-1 space-y-0.5">
          {paginatedItems.map((item, idx) => {
            const qty = item.quantity;
            const price = Number(item.price);
            const itemName = item.menuItem?.name || item.name;
            return (
              <div key={item.id || idx} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="text-[10px] font-bold text-slate-400 shrink-0 w-6 text-right">{qty}x</span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate">{itemName}</p>
                    {item.notes && <p className="text-[9px] text-slate-400 italic truncate">📝 {item.notes}</p>}
                  </div>
                </div>
                <span className="text-[11px] font-bold font-mono text-slate-700 shrink-0 ml-2">
                  {currency}{(price * qty).toFixed(0)}
                </span>
              </div>
            );
          })}
          {paginatedItems.length === 0 && (
            <div className="py-8 text-center text-slate-400 text-xs italic">
              {searchQuery ? 'No matching items' : 'No items found'}
            </div>
          )}
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-2 border-t border-slate-100 gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="flex items-center gap-1 h-7 px-2.5 bg-white border border-slate-200 rounded-lg text-[9px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
            >
              <ChevronLeft className="w-3 h-3" /> Prev
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                const pageNum = safePage <= 3
                  ? i + 1
                  : safePage >= totalPages - 2
                    ? totalPages - 4 + i
                    : safePage - 2 + i;
                if (pageNum < 1 || pageNum > totalPages) return null;
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`w-7 h-7 rounded-lg text-[9px] font-bold transition-all cursor-pointer ${
                      pageNum === safePage
                        ? 'bg-[#16A34A] text-white shadow-xs'
                        : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="flex items-center gap-1 h-7 px-2.5 bg-white border border-slate-200 rounded-lg text-[9px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
            >
              Next <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Totals */}
        <div className="border-t border-slate-200 px-4 py-3 bg-slate-50/50 space-y-1.5">
          <div className="flex justify-between text-[11px]">
            <span className="text-slate-500">Subtotal</span>
            <span className="font-mono font-bold text-slate-700">{currency}{subtotal.toFixed(2)}</span>
          </div>
          {promotionDiscountTotal > 0 && (
            <div className="space-y-1">
              {orderDiscounts.map((od) => (
                <div key={`od-${od.id}`} className="flex items-center justify-between text-[11px] gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-red-600 font-semibold truncate">{od.discountLabel || od.discountName}</span>
                    <button
                      onClick={() => handleRemoveApplied(od.id)}
                      className="text-slate-400 hover:text-red-600 transition-colors cursor-pointer shrink-0 p-0.5"
                      aria-label={`Remove ${od.discountName}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  <span className="font-mono font-bold text-red-600 shrink-0">-{currency}{Number(od.discountAmount).toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
          {discountAmount > 0 && (
            <div className="flex items-center justify-between text-[11px] gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-red-600 font-semibold truncate">
                  {discountType === 'PERCENTAGE'
                    ? `Discount (${Number(discountValue || 0)}%)`
                    : discountType === 'FLAT' && Number(discountValue || 0) > 0
                      ? `Discount (${currency}${Number(discountValue).toFixed(0)})`
                      : 'Discount'}
                </span>
                <button
                  onClick={openDiscountPanel}
                  className="text-slate-400 hover:text-red-600 transition-colors cursor-pointer shrink-0 p-0.5"
                  aria-label="Edit discount"
                >
                  <Pencil className="w-3 h-3" />
                </button>
                <button
                  onClick={removeDiscount}
                  className="text-slate-400 hover:text-red-600 transition-colors cursor-pointer shrink-0 p-0.5"
                  aria-label="Remove discount"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
              <span className="font-mono font-bold text-red-600 shrink-0">-{currency}{discountAmount.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between text-[11px]">
            <span className="text-slate-500">Tax</span>
            <span className="font-mono font-bold text-slate-700">{currency}{taxAmount.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-slate-500">Service Charge</span>
            <span className="font-mono font-bold text-slate-700">{currency}{serviceCharge.toFixed(2)}</span>
          </div>
          {roundOffEnabled && roundOff !== 0 && (
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-500">Round Off</span>
              <span className="font-mono font-bold text-slate-600">{currency}{roundOff.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm font-extrabold text-slate-800 border-t border-slate-200 pt-2 mt-1">
            <span className="text-[#16A34A]">Grand Total</span>
            <span className="font-mono text-[#16A34A]">{currency}{grandTotal.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* ═══ RIGHT PANEL: Payment Methods ═══ */}
      <div className="lg:w-[55%] lg:h-full max-h-[55vh] lg:max-h-none bg-white rounded-[20px] border border-slate-200 shadow-xs flex flex-col overflow-hidden">
        {/* Tab Selector */}
        <div className="px-4 pt-3 pb-2 border-b border-slate-100 overflow-x-auto no-scrollbar">
          <div className="flex gap-1">
            {PAYMENT_METHODS.map((method) => {
              const Icon = method.icon;
              const isActive = activeTab === method.key;
              const colorMap = {
                emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                blue: 'bg-blue-50 text-blue-700 border-blue-200',
                purple: 'bg-purple-50 text-purple-700 border-purple-200',
                amber: 'bg-amber-50 text-amber-700 border-amber-200',
                slate: 'bg-slate-100 text-slate-700 border-slate-300',
              };
              return (
                <button
                  key={method.key}
                  onClick={() => setActiveTab(method.key)}
                  className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[10px] font-bold 
                    transition-all cursor-pointer ${
                    isActive
                      ? `${colorMap[method.color]} shadow-sm`
                      : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {method.label}
                </button>
              );
            })}
            {/* Split tab is gated by the restaurant's enableSplitBill setting */}
            {settings?.enableSplitBill !== false && (
              <button
                onClick={() => setActiveTab('SPLIT')}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[10px] font-bold 
                  transition-all cursor-pointer ${
                  activeTab === 'SPLIT'
                    ? 'bg-rose-50 text-rose-700 border-rose-200 shadow-sm'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700'
                }`}
              >
                <SplitSquareVertical className="w-3.5 h-3.5" />
                Split
              </button>
            )}
          </div>
        </div>

        {/* Payment Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'CASH' && (
            <CashPayment
              amount={cashReceived}
              onAmountChange={setCashReceived}
              grandTotal={grandTotal}
              currency={currency}
            />
          )}

          {activeTab === 'CARD' && (
            <CardPayment
              onDetailsChange={setCardDetails}
              currency={currency}
              grandTotal={grandTotal}
            />
          )}

          {activeTab === 'UPI' && (
            <UpiPayment
              onDetailsChange={setUpiDetails}
              currency={currency}
              grandTotal={grandTotal}
            />
          )}

          {settings?.enableSplitBill !== false && activeTab === 'SPLIT' && (
            <SplitPayment
              onPaymentsChange={setSplitPayments}
              grandTotal={grandTotal}
              currency={currency}
            />
          )}
        </div>

        {/* Actions Footer — desktop/landscape (lg+). On portrait/mobile this is
            replaced by the sticky bottom payment bar so Collect is always reachable. */}
        <div className="hidden lg:block border-t border-slate-200 p-4 space-y-2.5 bg-slate-50/50">
          {/* Promotion Discounts (§21) — eligible list + promo code + staff */}
          <div className="flex items-center justify-between gap-2">
            {promotionDiscountTotal > 0 ? (
              <div className="flex-1 min-w-0 flex flex-wrap gap-1.5">
                {orderDiscounts.map((od) => (
                  <span key={`chip-${od.id}`} className="inline-flex items-center gap-1 bg-red-50 border border-red-200 rounded-lg px-2 py-1">
                    <span className="text-[9px] font-bold text-red-700 truncate max-w-[180px]">{od.discountLabel || od.discountName}</span>
                    <span className="text-[9px] font-mono font-bold text-red-500">-{currency}{Number(od.discountAmount).toFixed(2)}</span>
                    <button onClick={() => handleRemoveApplied(od.id)} className="text-red-400 hover:text-red-600 cursor-pointer p-0.5" aria-label={`Remove ${od.discountName}`}>
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <button
                onClick={() => setShowPromoPanel(true)}
                className="h-10 px-3 text-[10px] font-bold text-purple-700 hover:text-purple-800
                  bg-white border border-purple-200 hover:bg-purple-50 rounded-xl
                  flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Ticket className="w-3.5 h-3.5" />
                Apply Promotion
              </button>
            )}
            <span className="text-xs font-extrabold text-slate-800 shrink-0">
              {currency}{grandTotal.toFixed(2)}
            </span>
          </div>

          {/* Cashier Discount */}
          <div className="flex items-center justify-between gap-2">
            {discountAmount > 0 ? (
              <div className="flex-1 min-w-0">
                <AppliedDiscount
                  discountType={discountType}
                  discountValue={discountValue}
                  discountAmount={discountAmount}
                  currency={currency}
                  onEdit={openDiscountPanel}
                  onRemove={removeDiscount}
                />
              </div>
            ) : promotionDiscountTotal > 0 ? null : (
              <button
                onClick={openDiscountPanel}
                className="h-10 px-3 text-[10px] font-bold text-[#16A34A] hover:text-[#15803D] 
                  bg-white border border-[#16A34A]/30 hover:bg-emerald-50 rounded-xl 
                  flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Percent className="w-3.5 h-3.5" />
                Add Discount
              </button>
            )}
            <span className="text-xs font-extrabold text-slate-800 shrink-0">
              {currency}{grandTotal.toFixed(2)}
            </span>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
              <span className="text-[10px] font-semibold text-red-700">{error}</span>
            </div>
          )}

          {/* Collect Button */}
          <div className="flex gap-2">
            <button
              onClick={() => { setCheckoutOrderId(null); }}
              className="h-11 px-4 border border-slate-200 rounded-xl text-[10px] font-bold text-slate-500 
                hover:bg-slate-100 transition-all shrink-0 cursor-pointer"
            >
              Back
            </button>
            <button
              onClick={handleCollectPayment}
              disabled={loading || grandTotal <= 0}
              className="flex-1 h-11 bg-[#16A34A] hover:bg-[#15803D] disabled:bg-slate-300 
                disabled:cursor-not-allowed text-white font-extrabold rounded-xl text-xs 
                uppercase tracking-wider flex items-center justify-center gap-2 
                shadow-sm transition-all cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Check className="w-5 h-5" />
                  Collect {currency}{grandTotal.toFixed(0)}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
    );
  };

  // ── Wrap in full-screen overlay ──
  return (
    <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-2 sm:p-3 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-6xl h-[92vh] sm:h-[90vh] overflow-hidden flex flex-col">
        {/* Scrollable bill/payment area — panels scroll independently below lg */}
        <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden">
          {renderContent()}
        </div>

        {/* Sticky bottom payment action bar — tablet portrait & mobile only.
            Keeps the payable amount + primary Collect action always visible
            without ever hiding the keypad or bill summary behind it. */}
        {showDiscountPanel && (
          <DiscountPanel
            subtotal={subtotal}
            taxAmount={taxAmount}
            serviceCharge={serviceCharge}
            roundOffEnabled={roundOffEnabled}
            currency={currency}
            initialType={discountType}
            initialValue={discountValue}
            onCancel={() => setShowDiscountPanel(false)}
            onApply={applyDiscount}
          />
        )}
        {showPromoPanel && checkoutOrderId && (
          <PromotionDiscountPanel
            orderId={checkoutOrderId}
            subtotal={subtotal}
            currency={currency}
            onClose={() => setShowPromoPanel(false)}
            onApplied={handlePromotionApplied}
            onError={(msg) => setError(msg)}
          />
        )}
        {showStickyBar && (
          <div className="lg:hidden shrink-0 border-t border-slate-200 bg-white px-3 pt-2 pb-2.5 space-y-2 shadow-[0_-6px_16px_rgba(44,62,80,0.08)]">
            {/* Cashier Discount — kept accessible on portrait & mobile */}
            {discountAmount > 0 ? (
              <AppliedDiscount
                discountType={discountType}
                discountValue={discountValue}
                discountAmount={discountAmount}
                currency={currency}
                onEdit={openDiscountPanel}
                onRemove={removeDiscount}
              />
            ) : promotionDiscountTotal > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {orderDiscounts.map((od) => (
                  <span key={`mchip-${od.id}`} className="inline-flex items-center gap-1 bg-red-50 border border-red-200 rounded-lg px-2 py-1">
                    <span className="text-[9px] font-bold text-red-700 truncate max-w-[140px]">{od.discountLabel || od.discountName}</span>
                    <span className="text-[9px] font-mono font-bold text-red-500">-{currency}{Number(od.discountAmount).toFixed(2)}</span>
                    <button onClick={() => handleRemoveApplied(od.id)} className="text-red-400 hover:text-red-600 cursor-pointer p-0.5" aria-label={`Remove ${od.discountName}`}>
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowPromoPanel(true)}
                  className="text-[10px] font-bold text-purple-700 hover:text-purple-800
                    flex items-center gap-1 hover:underline cursor-pointer h-9"
                >
                  <Ticket className="w-3.5 h-3.5" />
                  Apply Promotion
                </button>
                <button
                  onClick={openDiscountPanel}
                  className="text-[10px] font-bold text-[#16A34A] hover:text-[#15803D] flex items-center gap-1 hover:underline cursor-pointer h-9"
                >
                  <Percent className="w-3.5 h-3.5" />
                  Add Discount
                </button>
              </div>
            )}
            {error && (
              <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                <span className="text-[10px] font-semibold text-red-700">{error}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setCheckoutOrderId(null); }}
                className="h-11 px-3.5 border border-slate-200 rounded-xl text-[10px] font-bold text-slate-500 hover:bg-slate-100 transition-all shrink-0 cursor-pointer"
              >
                Back
              </button>
              <div className="flex-1 min-w-0 text-right">
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Payable</p>
                <p className="font-mono font-extrabold text-lg text-[#16A34A] leading-tight">{currency}{grandTotal.toFixed(2)}</p>
              </div>
              <button
                onClick={handleCollectPayment}
                disabled={loading || grandTotal <= 0}
                className="flex-[2] h-12 bg-[#16A34A] hover:bg-[#15803D] disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-extrabold rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Check className="w-5 h-5" />
                    Collect {currency}{grandTotal.toFixed(0)}
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
