import React, { useState, useEffect, useMemo } from 'react';
import {
  X, Loader2, AlertTriangle, Info, Tag, Percent, Ticket, Users, Eye,
} from 'lucide-react';
import { useUiStore, useSettingsStore } from '../../../store';
import { discountApi } from '../../../api/discount.api';

// ─── Constants ───────────────────────────────────────────────────────────────

const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const DAY_LABELS = [
  { short: 'Sun', long: 'Sunday' }, { short: 'Mon', long: 'Monday' },
  { short: 'Tue', long: 'Tuesday' }, { short: 'Wed', long: 'Wednesday' },
  { short: 'Thu', long: 'Thursday' }, { short: 'Fri', long: 'Friday' },
  { short: 'Sat', long: 'Saturday' },
];
const ALL_DAYS_MASK = 127;

const maskFromDayNames = (names) => {
  if (!names || names.length === 0) return ALL_DAYS_MASK;
  let mask = 0;
  DAY_NAMES.forEach((d, i) => { if (names.includes(d)) mask |= 1 << i; });
  return mask;
};
const dayNamesFromMask = (mask) => {
  const names = [];
  DAY_NAMES.forEach((d, i) => { if (Number(mask) & (1 << i)) names.push(d); });
  return names;
};

const toDateInput = (v) => {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
};
const toTimeInput = (v) => (v ? String(v).slice(0, 5) : '');

// ─── Field helpers ───────────────────────────────────────────────────────────

function Field({ label, required, children, hint }) {
  return (
    <div className="space-y-1">
      <label className="text-[9px] font-bold uppercase text-slate-400 tracking-wider">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {hint && <p className="text-[9px] text-slate-400 font-medium">{hint}</p>}
    </div>
  );
}

const inputCls =
  'w-full h-8.5 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-[#16A34A] focus:bg-white transition-colors';

function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer"
    >
      <span
        className={`w-8 h-4.5 rounded-full relative transition-colors ${checked ? 'bg-[#16A34A]' : 'bg-slate-300'}`}
      >
        <span
          className={`absolute top-0.5 w-3.5 h-3.5 bg-white rounded-full shadow transition-all ${checked ? 'left-4' : 'left-0.5'}`}
        />
      </span>
      {label}
    </button>
  );
}

// ─── Main modal ──────────────────────────────────────────────────────────────

export default function DiscountFormModal({ discount, currency = '₹', onClose, onSaved }) {
  const { addToast } = useUiStore();
  const { settings } = useSettingsStore();
  const isEdit = !!discount;

  // A. Basic information
  const [name, setName] = useState(discount?.name || '');
  const [description, setDescription] = useState(discount?.description || '');
  const [status, setStatus] = useState(discount?.status || 'ACTIVE');

  // B. Type
  const [type, setType] = useState(discount?.type || 'PERCENTAGE');

  // C. Value
  const [discountValue, setDiscountValue] = useState(
    discount?.discountValue != null ? String(discount.discountValue) : ''
  );
  const [maximumDiscountAmount, setMaximumDiscountAmount] = useState(
    discount?.maximumDiscountAmount != null ? String(discount.maximumDiscountAmount) : ''
  );

  // D. Applies to
  const [scope, setScope] = useState(discount?.scope || 'ENTIRE_ORDER');
  const [categories, setCategories] = useState(null); // null = not loaded yet
  const [menuItems, setMenuItems] = useState(null); // null = not loaded yet
  const [categoryIds, setCategoryIds] = useState(discount?.categoryIds || []);
  const [menuItemIds, setMenuItemIds] = useState(discount?.menuItemIds || []);
  const [refsLoading, setRefsLoading] = useState(false);
  const [refsError, setRefsError] = useState('');
  const [itemSearch, setItemSearch] = useState('');

  // E. Schedule
  const [startDate, setStartDate] = useState(toDateInput(discount?.startDate));
  const [startTime, setStartTime] = useState(toTimeInput(discount?.startTime));
  const [endDate, setEndDate] = useState(toDateInput(discount?.endDate));
  const [endTime, setEndTime] = useState(toTimeInput(discount?.endTime));

  // F/G. Days + time window
  const [selectedDays, setSelectedDays] = useState(dayNamesFromMask(discount?.applicableDays ?? 127));

  // Limits
  const [minimumOrderAmount, setMinimumOrderAmount] = useState(
    discount?.minimumOrderAmount ? String(discount.minimumOrderAmount) : ''
  );
  const [usageLimited, setUsageLimited] = useState(discount?.usageLimit != null);
  const [usageLimit, setUsageLimit] = useState(
    discount?.usageLimit != null ? String(discount.usageLimit) : ''
  );
  const [perCustomerLimit, setPerCustomerLimit] = useState(
    discount?.perCustomerLimit != null ? String(discount.perCustomerLimit) : ''
  );

  // H. Stacking
  const [stackable, setStackable] = useState(discount?.stackable === true);
  const [maxDiscountsPerOrder, setMaxDiscountsPerOrder] = useState(
    String(discount?.maxDiscountsPerOrder ?? 1)
  );

  // Staff eligibility (§13): a STAFF discount is ONE common discount for ALL
  // active staff of the tenant — the definition carries no role/targeting/
  // role-cap configuration, so there is no staff state to keep here. The
  // recipient (who RECEIVED the discount) is selected at apply time in billing.

  // Promo code (§4): the code plus HOW it grants the discount
  const [code, setCode] = useState(discount?.promoCode?.code || '');
  const [promoMethod, setPromoMethod] = useState(discount?.promoMethod || 'FIXED_AMOUNT');

  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  // ── Load REAL tenant reference data (categories, products) ──
  // Dedicated tenant-scoped discount reference endpoints (§14): they return
  // exactly the fields targeting needs and are scoped by the authenticated
  // tenant — never a frontend restaurantId.
  useEffect(() => {
    let cancelled = false;
    const loadRefs = async () => {
      setRefsLoading(true);
      setRefsError('');
      const [catResp, prodResp] = await Promise.allSettled([
        discountApi.refCategories(),
        discountApi.refProducts(),
      ]);
      if (cancelled) return;
      if (catResp.status === 'fulfilled') {
        setCategories(catResp.value?.categories || catResp.value?.data?.categories || []);
      }
      if (prodResp.status === 'fulfilled') {
        setMenuItems(prodResp.value?.products || prodResp.value?.data?.products || []);
      }
      const failed = [catResp, prodResp].filter((r) => r.status === 'rejected');
      if (failed.length > 0) {
        setRefsError(failed[0].reason?.message || 'Failed to load reference data');
      }
      setRefsLoading(false);
    };
    loadRefs();
    return () => { cancelled = true; };
  }, []);

  // ── Client-side validation (§33) — the backend repeats everything ──
  const validate = () => {
    const errs = {};
    if (!name.trim()) errs.name = 'Discount name is required';
    if (!Number.isFinite(Number(discountValue)) || Number(discountValue) <= 0) {
      errs.discountValue = 'Discount value must be greater than 0';
    } else if ((type === 'PERCENTAGE' || type === 'STAFF') && Number(discountValue) > 100) {
      errs.discountValue = 'Percentage cannot exceed 100';
    }
    if (maximumDiscountAmount !== '' && (Number(maximumDiscountAmount) < 0 || !Number.isFinite(Number(maximumDiscountAmount)))) {
      errs.maximumDiscountAmount = 'Maximum discount must be 0 or more';
    }
    if (minimumOrderAmount !== '' && (Number(minimumOrderAmount) < 0 || !Number.isFinite(Number(minimumOrderAmount)))) {
      errs.minimumOrderAmount = 'Minimum order amount must be 0 or more';
    }
    if (!startDate) errs.startDate = 'Start date is required';
    if (!endDate) errs.endDate = 'End date is required';
    if (startDate && endDate && new Date(endDate) <= new Date(startDate)) {
      errs.endDate = 'End must be after start';
    }
    if (startTime && endTime && startTime >= endTime) {
      const crossesMidnight = startTime > endTime;
      if (!crossesMidnight) errs.endTime = 'End time must be after start time';
    }
    if (scope === 'CATEGORIES' && categoryIds.length === 0) errs.categoryIds = 'Select at least one category';
    if (scope === 'PRODUCTS' && menuItemIds.length === 0) errs.menuItemIds = 'Select at least one product';
    if (usageLimited && (!Number.isInteger(Number(usageLimit)) || Number(usageLimit) <= 0)) {
      errs.usageLimit = 'Enter a positive whole number';
    }
    if (perCustomerLimit !== '' && (!Number.isInteger(Number(perCustomerLimit)) || Number(perCustomerLimit) <= 0)) {
      errs.perCustomerLimit = 'Enter a positive whole number';
    }
    if (!/^\d+$/.test(maxDiscountsPerOrder) || Number(maxDiscountsPerOrder) < 1 || Number(maxDiscountsPerOrder) > 5) {
      errs.maxDiscountsPerOrder = 'Must be 1–5';
    }
    // STAFF needs no eligibility configuration — the common value/schedule/
    // limits above fully define it (§13: all active staff are eligible).
    if (type === 'PROMO_CODE' && !code.trim()) {
      errs.code = 'Promo code is required';
    }
    if (type === 'PROMO_CODE' && promoMethod === 'PERCENTAGE' && Number(discountValue) > 100) {
      errs.discountValue = 'Percentage promo cannot exceed 100';
    }
    return errs;
  };

  // ── Preview (§29, informational only) ──
  const preview = useMemo(() => {
    const catList = categories || [];
    const itemList = menuItems || [];
    const scopeNames =
      scope === 'CATEGORIES'
        ? catList.filter((c) => categoryIds.includes(c.id)).map((c) => c.name)
        : scope === 'PRODUCTS'
          ? itemList.filter((m) => menuItemIds.includes(m.id)).map((m) => m.name)
          : ['Entire Order'];
    const isPercentValue = type === 'PERCENTAGE' || type === 'STAFF' || (type === 'PROMO_CODE' && promoMethod === 'PERCENTAGE');
    const value = isPercentValue
      ? `${discountValue || '—'}% OFF`
      : `${currency}${discountValue || '—'} OFF`;
    const fmtD = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
    const fmtT = (t) => {
      if (!t) return '';
      const [h, m] = t.split(':').map(Number);
      const suffix = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 === 0 ? 12 : h % 12;
      return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
    };
    return {
      value,
      scopeNames,
      valid: `${fmtD(startDate)}${startTime ? ` ${fmtT(startTime)}` : ''} → ${fmtD(endDate)}${endTime ? ` ${fmtT(endTime)}` : ''}`,
      days: selectedDays.length === 0 || selectedDays.length === 7 ? 'Every day' : DAY_LABELS.filter((d) => selectedDays.includes(d.short.toUpperCase() === d.short ? d.short.toUpperCase() : d.short)).map((d) => d.long).join(', ') || 'Every day',
      time: startTime || endTime ? `${fmtT(startTime)} – ${fmtT(endTime)}` : null,
      minOrder: minimumOrderAmount ? `${currency}${Number(minimumOrderAmount).toLocaleString('en-IN')}` : null,
      maxDiscount: maximumDiscountAmount ? `${currency}${Number(maximumDiscountAmount).toLocaleString('en-IN')}` : null,
      stackable: stackable ? 'Yes' : 'No',
      // §16: staff promotions are universally eligible — no targeting preview
      staffEligibility: type === 'STAFF' ? 'All Active Staff' : null,
    };
  }, [scope, categories, menuItems, categoryIds, menuItemIds, type, promoMethod, discountValue, currency, startDate, startTime, endDate, endTime, selectedDays, minimumOrderAmount, maximumDiscountAmount, stackable]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        status,
        type,
        discountValue: Number(discountValue),
        maximumDiscountAmount: maximumDiscountAmount === '' ? null : Number(maximumDiscountAmount),
        minimumOrderAmount: minimumOrderAmount === '' ? 0 : Number(minimumOrderAmount),
        startDate,
        endDate,
        startTime: startTime || null,
        endTime: endTime || null,
        scope,
        applicableDays: maskFromDayNames(selectedDays),
        customerEligibility: 'EVERYONE',
        stackable,
        maxDiscountsPerOrder: Number(maxDiscountsPerOrder),
        usageLimit: usageLimited && usageLimit !== '' ? Number(usageLimit) : null,
        perCustomerLimit: perCustomerLimit === '' ? null : Number(perCustomerLimit),
        // STAFF sends NO targeting fields — the common discount configuration
        // above is the whole definition (backend nulls the legacy columns).
        ...(type === 'PROMO_CODE' ? { code: code.trim(), promoMethod } : {}),
        ...(scope === 'CATEGORIES' ? { categoryIds } : {}),
        ...(scope === 'PRODUCTS' ? { menuItemIds } : {}),
      };

      if (isEdit) {
        await discountApi.update(discount.id, payload);
        addToast(`"${payload.name}" updated.`, 'success');
      } else {
        await discountApi.create(payload);
        addToast(`"${payload.name}" created.`, 'success');
      }
      onSaved();
    } catch (err) {
      const message = err?.response?.data?.message || err?.message || 'Failed to save discount.';
      setErrors(err?.response?.data?.errors || { _global: message });
      addToast(message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const filteredMenuItems = useMemo(() => {
    const list = menuItems || [];
    if (!itemSearch.trim()) return list;
    const q = itemSearch.toLowerCase();
    return list.filter((m) => (m.name || '').toLowerCase().includes(q));
  }, [menuItems, itemSearch]);

  const isPercentType = type === 'PERCENTAGE' || type === 'STAFF' || (type === 'PROMO_CODE' && promoMethod === 'PERCENTAGE');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/40 backdrop-blur-xs" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full max-w-2xl max-h-[92vh] rounded-2xl shadow-2xl border border-slate-100 flex flex-col"
      >
        {/* Header */}
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex justify-between items-center rounded-t-2xl shrink-0">
          <h4 className="font-extrabold text-xs uppercase tracking-wider text-slate-800">
            {isEdit ? 'Edit Discount' : 'Create Discount'}
          </h4>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5 text-xs">
          {errors._global && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
              <p className="text-[11px] font-semibold text-red-700">{errors._global}</p>
            </div>
          )}

          {/* ── A. Basic Information ── */}
          <section className="space-y-3">
            <h5 className="text-[10px] font-extrabold text-[#16A34A] uppercase tracking-wider">Basic Information</h5>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Discount Name" required>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Weekend Special" className={inputCls} />
                {errors.name && <p className="text-[10px] text-red-500">{errors.name}</p>}
              </Field>
              <Field label="Status" hint="EXPIRED is derived from the schedule automatically">
                <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
                  <option value="ACTIVE">Active</option>
                  <option value="SCHEDULED">Scheduled</option>
                  <option value="DISABLED">Disabled</option>
                </select>
              </Field>
            </div>
            <Field label="Description">
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Optional description" className={`${inputCls} h-auto py-2`} />
            </Field>
          </section>

          {/* ── B. Discount Type ── */}
          <section className="space-y-2">
            <h5 className="text-[10px] font-extrabold text-[#16A34A] uppercase tracking-wider">Discount Type</h5>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { value: 'PERCENTAGE', label: 'Percentage', icon: Percent },
                { value: 'FIXED_AMOUNT', label: 'Fixed Amount', icon: Tag },
                { value: 'STAFF', label: 'Staff', icon: Users },
                { value: 'PROMO_CODE', label: 'Promo Code', icon: Ticket },
              ].map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setType(t.value)}
                    className={`h-12 rounded-xl border text-[10px] font-bold flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                      type === t.value
                        ? 'bg-[#16A34A] border-[#16A34A] text-white shadow-sm'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <Icon className="w-4 h-4" /> {t.label}
                  </button>
                );
              })}
            </div>
          </section>

          {/* ── C. Discount Value ── */}
          <section className="space-y-3">
            <h5 className="text-[10px] font-extrabold text-[#16A34A] uppercase tracking-wider">
              {type === 'PROMO_CODE' ? 'Promo Discount' : 'Discount Value'}
            </h5>
            {type === 'PROMO_CODE' && (
              <Field label="Discount Method" required hint="How the promo code grants its discount">
                <div className="grid grid-cols-2 gap-2">
                  {[{ value: 'PERCENTAGE', label: 'Percentage %' }, { value: 'FIXED_AMOUNT', label: `Fixed Amount ${currency}` }].map((m) => (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => setPromoMethod(m.value)}
                      className={`h-10 rounded-xl border text-[10px] font-bold transition-all cursor-pointer ${
                        promoMethod === m.value
                          ? 'bg-[#16A34A] border-[#16A34A] text-white shadow-sm'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </Field>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label={isPercentType ? 'Discount (%)' : 'Discount Amount'} required>
                <div className="relative">
                  {isPercentType && <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">%</span>}
                  {!isPercentType && <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">{currency}</span>}
                  <input
                    type="number" min="0" step="0.01" inputMode="decimal"
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    placeholder={isPercentType ? '20' : '200'}
                    className={`${inputCls} ${isPercentType ? 'pr-7' : 'pl-7'}`}
                  />
                </div>
                {errors.discountValue && <p className="text-[10px] text-red-500">{errors.discountValue}</p>}
              </Field>
              {isPercentType && (
                <Field label="Maximum Discount (optional)" hint="Caps the discount amount, e.g. 20% max ₹500">
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">{currency}</span>
                    <input
                      type="number" min="0" step="0.01" inputMode="decimal"
                      value={maximumDiscountAmount}
                      onChange={(e) => setMaximumDiscountAmount(e.target.value)}
                      placeholder="500"
                      className={`${inputCls} pl-7`}
                    />
                  </div>
                  {errors.maximumDiscountAmount && <p className="text-[10px] text-red-500">{errors.maximumDiscountAmount}</p>}
                </Field>
              )}
            </div>
          </section>

          {/* ── D. Applies To ── */}
          <section className="space-y-2">
            <h5 className="text-[10px] font-extrabold text-[#16A34A] uppercase tracking-wider">Applies To</h5>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'ENTIRE_ORDER', label: 'Entire Order' },
                { value: 'CATEGORIES', label: 'Categories' },
                { value: 'PRODUCTS', label: 'Products' },
              ].map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setScope(s.value)}
                  className={`h-9 rounded-xl border text-[10px] font-bold transition-all cursor-pointer ${
                    scope === s.value
                      ? 'bg-[#16A34A] border-[#16A34A] text-white shadow-sm'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {scope === 'CATEGORIES' && (
              <div className="border border-slate-200 rounded-xl p-3 space-y-2">
                {refsLoading ? (
                  <p className="text-[10px] text-slate-400 italic py-2">Loading categories…</p>
                ) : refsError && categories === null ? (
                  <div className="py-2 space-y-1.5">
                    <p className="text-[10px] font-semibold text-red-600">{refsError}</p>
                    <button type="button" onClick={() => window.location.reload()} className="text-[10px] font-bold text-[#16A34A] hover:underline cursor-pointer">Retry</button>
                  </div>
                ) : (categories || []).length === 0 ? (
                  <p className="text-[10px] text-slate-400 italic py-2">No categories in this restaurant yet — create categories in Menu &amp; Stock first.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {(categories || []).map((c) => {
                      const selected = categoryIds.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() =>
                            setCategoryIds((prev) => (selected ? prev.filter((id) => id !== c.id) : [...prev, c.id]))
                          }
                          className={`px-2.5 py-1.5 rounded-lg border text-[10px] font-bold transition-all cursor-pointer ${
                            selected ? 'bg-emerald-50 border-[#16A34A] text-emerald-700' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                          }`}
                        >
                          {c.name}
                          {c.color && <span className="inline-block w-2 h-2 rounded-full ml-1.5 align-middle" style={{ backgroundColor: c.color }} />}
                        </button>
                      );
                    })}
                  </div>
                )}
                {errors.categoryIds && <p className="text-[10px] text-red-500">{errors.categoryIds}</p>}
              </div>
            )}

            {scope === 'PRODUCTS' && (
              <div className="border border-slate-200 rounded-xl p-3 space-y-2">
                <input
                  type="text"
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
                  placeholder="Search products..."
                  className={inputCls}
                />
                {refsLoading ? (
                  <p className="text-[10px] text-slate-400 italic py-2">Loading products…</p>
                ) : refsError && menuItems === null ? (
                  <div className="py-2 space-y-1.5">
                    <p className="text-[10px] font-semibold text-red-600">{refsError}</p>
                    <button type="button" onClick={() => window.location.reload()} className="text-[10px] font-bold text-[#16A34A] hover:underline cursor-pointer">Retry</button>
                  </div>
                ) : filteredMenuItems.length === 0 ? (
                  <p className="text-[10px] text-slate-400 italic py-2">
                    {(menuItems || []).length === 0
                      ? 'No products in this restaurant yet — add items in Menu & Stock first.'
                      : 'No products match your search.'}
                  </p>
                ) : (
                  <div className="max-h-40 overflow-y-auto flex flex-wrap gap-1.5">
                    {filteredMenuItems.map((m) => {
                      const selected = menuItemIds.includes(m.id);
                      return (
                        <button
                          key={m.id}
                          type="button"
                          title={m.category?.name || ''}
                          onClick={() =>
                            setMenuItemIds((prev) => (selected ? prev.filter((id) => id !== m.id) : [...prev, m.id]))
                          }
                          className={`px-2.5 py-1.5 rounded-lg border text-[10px] font-bold transition-all cursor-pointer ${
                            selected ? 'bg-emerald-50 border-[#16A34A] text-emerald-700' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                          }`}
                        >
                          {m.name}
                          {m.category?.name && <span className="ml-1 font-medium text-slate-400">· {m.category.name}</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
                {errors.menuItemIds && <p className="text-[10px] text-red-500">{errors.menuItemIds}</p>}
              </div>
            )}
          </section>

          {/* ── E. Schedule ── */}
          <section className="space-y-3">
            <h5 className="text-[10px] font-extrabold text-[#16A34A] uppercase tracking-wider">Schedule</h5>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start Date" required>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputCls} />
                {errors.startDate && <p className="text-[10px] text-red-500">{errors.startDate}</p>}
              </Field>
              <Field label="Start Time">
                <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inputCls} />
              </Field>
              <Field label="End Date" required>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputCls} />
                {errors.endDate && <p className="text-[10px] text-red-500">{errors.endDate}</p>}
              </Field>
              <Field label="End Time">
                <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={inputCls} />
                {errors.endTime && <p className="text-[10px] text-red-500">{errors.endTime}</p>}
              </Field>
            </div>
          </section>

          {/* ── F. Recurring Days ── */}
          <section className="space-y-2">
            <h5 className="text-[10px] font-extrabold text-[#16A34A] uppercase tracking-wider">Valid Days</h5>
            <div className="flex flex-wrap gap-1.5">
              {DAY_LABELS.map((d) => {
                const val = d.short.toUpperCase();
                const selected = selectedDays.includes(val);
                return (
                  <button
                    key={val}
                    type="button"
                    onClick={() =>
                      setSelectedDays((prev) => (selected ? prev.filter((v) => v !== val) : [...prev, val]))
                    }
                    className={`px-2.5 py-1.5 rounded-lg border text-[10px] font-bold transition-all cursor-pointer ${
                      selected ? 'bg-emerald-50 border-[#16A34A] text-emerald-700' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    {d.short}
                  </button>
                );
              })}
            </div>
            <p className="text-[9px] text-slate-400 font-medium">No days selected = every day within the date range.</p>
          </section>

          {/* ── G. Eligibility (minimum order + time window is in Schedule) ── */}
          <section className="space-y-3">
            <h5 className="text-[10px] font-extrabold text-[#16A34A] uppercase tracking-wider">Eligibility &amp; Limits</h5>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Minimum Order Amount" hint="Subtotal must reach this for the discount">
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">{currency}</span>
                  <input
                    type="number" min="0" step="0.01" inputMode="decimal"
                    value={minimumOrderAmount}
                    onChange={(e) => setMinimumOrderAmount(e.target.value)}
                    placeholder="1000"
                    className={`${inputCls} pl-7`}
                  />
                </div>
                {errors.minimumOrderAmount && <p className="text-[10px] text-red-500">{errors.minimumOrderAmount}</p>}
              </Field>
              {type === 'PROMO_CODE' && (
                <Field label="Promo Code" required hint="Stored uppercase — case-insensitive at checkout">
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="WELCOME10"
                    className={`${inputCls} font-mono uppercase`}
                  />
                  {errors.code && <p className="text-[10px] text-red-500">{errors.code}</p>}
                </Field>
              )}
            </div>
          </section>

          {/* ── Usage Limits ── */}
          <section className="space-y-3">
            <h5 className="text-[10px] font-extrabold text-[#16A34A] uppercase tracking-wider">Usage Limits</h5>
            <Toggle checked={usageLimited} onChange={setUsageLimited} label="Limit total uses" />
            {usageLimited && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Maximum Uses">
                  <input
                    type="number" min="1" inputMode="numeric"
                    value={usageLimit}
                    onChange={(e) => setUsageLimit(e.target.value)}
                    placeholder="100"
                    className={inputCls}
                  />
                  {errors.usageLimit && <p className="text-[10px] text-red-500">{errors.usageLimit}</p>}
                </Field>
                <Field label="Max Uses Per Customer">
                  <input
                    type="number" min="1" inputMode="numeric"
                    value={perCustomerLimit}
                    onChange={(e) => setPerCustomerLimit(e.target.value)}
                    placeholder="1"
                    className={inputCls}
                  />
                  {errors.perCustomerLimit && <p className="text-[10px] text-red-500">{errors.perCustomerLimit}</p>}
                </Field>
              </div>
            )}
          </section>

          {/* ── H. Stacking Rules ── */}
          <section className="space-y-3">
            <h5 className="text-[10px] font-extrabold text-[#16A34A] uppercase tracking-wider">Stacking Rules</h5>
            <Toggle
              checked={stackable}
              onChange={setStackable}
              label="Can combine with other discounts"
            />
            <div className="grid grid-cols-2 gap-3 max-w-xs">
              <Field label="Max Discounts Per Order">
                <input
                  type="number" min="1" max="5" inputMode="numeric"
                  value={maxDiscountsPerOrder}
                  onChange={(e) => setMaxDiscountsPerOrder(e.target.value)}
                  className={inputCls}
                />
                {errors.maxDiscountsPerOrder && <p className="text-[10px] text-red-500">{errors.maxDiscountsPerOrder}</p>}
              </Field>
            </div>
          </section>

          {/* ── Staff eligibility (§13) ── */}
          {type === 'STAFF' && (
            <section className="space-y-2">
              <h5 className="text-[10px] font-extrabold text-[#16A34A] uppercase tracking-wider">Staff Eligibility</h5>
              <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                <Info className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                <p className="text-[10px] font-semibold text-emerald-700">
                  Staff discounts are automatically available to all active staff members.
                </p>
              </div>
            </section>
          )}

          {/* ── I. Preview ── */}
          <section className="space-y-2">
            <h5 className="text-[10px] font-extrabold text-[#16A34A] uppercase tracking-wider flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5" /> Preview
            </h5>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-1.5">
              <p className="text-sm font-extrabold text-slate-800">{name || 'Unnamed Discount'}</p>
              <p className="text-xs font-bold text-[#16A34A]">{preview.value}</p>
              <div className="text-[10px] text-slate-500 space-y-0.5 pt-1">
                <p><span className="font-bold text-slate-600">Applies to:</span> {preview.scopeNames.length > 0 ? preview.scopeNames.join(', ') : '—'}</p>
                <p><span className="font-bold text-slate-600">Valid:</span> {preview.valid}</p>
                <p><span className="font-bold text-slate-600">Days:</span> {preview.days}</p>
                {preview.time && <p><span className="font-bold text-slate-600">Time:</span> {preview.time}</p>}
                {preview.minOrder && <p><span className="font-bold text-slate-600">Minimum Order:</span> {preview.minOrder}</p>}
                {preview.maxDiscount && <p><span className="font-bold text-slate-600">Maximum Discount:</span> {preview.maxDiscount}</p>}
                {preview.staffEligibility && (
                  <p><span className="font-bold text-slate-600">Eligibility:</span> {preview.staffEligibility}</p>
                )}                <p><span className="font-bold text-slate-600">Stackable:</span> {preview.stackable}</p>
              </div>
            </div>
            <p className="text-[9px] text-slate-400 flex items-center gap-1">
              <Info className="w-3 h-3 shrink-0" />
              Preview is informational only — the backend validates every rule when the discount is applied.
            </p>
          </section>
        </div>

        {/* Footer (J. Save) */}
        <div className="px-4 py-3 border-t border-slate-100 flex gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 h-9 bg-white hover:bg-slate-50 border border-slate-200 text-slate-500 font-bold rounded-lg text-xs uppercase cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-[2] h-9 bg-[#16A34A] hover:bg-[#15803D] text-white font-bold rounded-lg text-xs uppercase transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            {saving ? 'Saving...' : isEdit ? 'Update Discount' : 'Create Discount'}
          </button>
        </div>
      </form>
    </div>
  );
}
