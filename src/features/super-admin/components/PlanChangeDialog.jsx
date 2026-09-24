import React, { useState, useMemo, useRef } from 'react';
import { superAdminApi } from '../../../api/superAdmin.api';
import { Loader2, X, TrendingUp, TrendingDown, RotateCcw, PlayCircle, XCircle, Ban, CalendarDays, CreditCard } from 'lucide-react';
import { filterPlansForBusinessType, modeLabel } from '../../../utils/businessTypes';

const MODE_META = {
  upgrade: { title: 'Upgrade Plan', icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-50' },
  downgrade: { title: 'Downgrade Plan', icon: TrendingDown, color: 'text-amber-600', bg: 'bg-amber-50' },
  renew: { title: 'Renew Subscription', icon: RotateCcw, color: 'text-blue-600', bg: 'bg-blue-50' },
  activate: { title: 'Activate Subscription', icon: PlayCircle, color: 'text-green-600', bg: 'bg-green-50' },
  cancel: { title: 'Cancel Subscription', icon: XCircle, color: 'text-red-600', bg: 'bg-red-50' },
};

/** Preview expiry date for a billing cycle anchored at a start date */
function previewExpiry(start, cycle, trialDays) {
  const d = new Date(start);
  if (trialDays && trialDays > 0) d.setDate(d.getDate() + trialDays);
  else if (cycle === 'YEARLY') d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

export default function PlanChangeDialog({ restaurant, subscription, plans, mode, onClose, onDone }) {
  const meta = MODE_META[mode] || MODE_META.change;
  const [planId, setPlanId] = useState('');
  const [billingCycle, setBillingCycle] = useState('MONTHLY');
  const [effectiveDate, setEffectiveDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Business-type eligibility: the SAME filter used by onboarding and the
  // restaurant subscription page (mirrors the backend resolver). The backend
  // still re-validates on changeSubscriptionPlan — this only stops the SA
  // from selecting an incompatible plan in the first place. The tenant's
  // CURRENT plan always stays listed (legacy same-plan renewal exemption).
  const eligiblePlans = useMemo(
    () => filterPlansForBusinessType(plans || [], restaurant?.businessType, {
      includePlanId: restaurant?.subscription?.planId ?? restaurant?.planId ?? null,
    }),
    [plans, restaurant?.businessType, restaurant?.subscription?.planId, restaurant?.planId]
  );

  const availablePlans = useMemo(() => {
    if (mode === 'upgrade' || mode === 'downgrade') {
      return eligiblePlans.filter((p) => p.isActive && p.code !== subscription?.plan);
    }
    return [];
  }, [mode, eligiblePlans, subscription]);

  const selectedPlan = useMemo(() => {
    if (mode === 'upgrade' || mode === 'downgrade') {
      return (plans || []).find((p) => p.id === Number(planId)) || null;
    }
    return (plans || []).find((p) => p.code === subscription?.plan) || null;
  }, [mode, plans, planId, subscription]);

  const cycle = mode === 'upgrade' || mode === 'downgrade' ? billingCycle : (subscription?.billingCycle || 'MONTHLY');

  const previewDate = useMemo(() => {
    const base = mode === 'renew' && subscription?.expiryDate && new Date(subscription.expiryDate) > new Date()
      ? new Date(subscription.expiryDate)
      : effectiveDate ? new Date(effectiveDate) : new Date();
    return previewExpiry(base, cycle, mode === 'activate' || mode === 'renew' ? (selectedPlan?.trialDays || 0) : selectedPlan?.code === 'TRIAL' ? (selectedPlan?.trialDays || 15) : 0);
  }, [mode, subscription, effectiveDate, cycle, selectedPlan]);

  const priceLabel = (() => {
    if (!selectedPlan) return '';
    if (selectedPlan.code === 'TRIAL') return 'Free';
    const p = cycle === 'YEARLY' ? selectedPlan.yearlyPrice : selectedPlan.monthlyPrice;
    return cycle === 'YEARLY' ? `₹${(p || 0).toLocaleString()} / year` : `₹${(p || 0).toLocaleString()} / month`;
  })();

  const savingRef = useRef(false);

  const handleSubmit = async () => {
    if ((mode === 'upgrade' || mode === 'downgrade') && !planId) {
      setError('Please select a plan');
      return;
    }
    if (savingRef.current) return; // double-click guard
    savingRef.current = true;
    setSaving(true);
    setError('');
    try {
      if (mode === 'upgrade' || mode === 'downgrade') {
        await superAdminApi.changeSubscriptionPlan(restaurant.id, {
          planId: Number(planId), action: mode, billingCycle, effectiveDate, notes,
        });
      } else if (mode === 'renew') {
        await superAdminApi.renewSubscription(restaurant.id, notes);
      } else if (mode === 'activate') {
        await superAdminApi.activateSubscription(restaurant.id, notes);
      } else if (mode === 'cancel') {
        await superAdminApi.cancelSubscription(restaurant.id, notes);
      }
      onDone();
    } catch (e) {
      setError(e.message || 'Action failed');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const inputCls = "w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:border-[#16A34A] transition-all";
  const labelCls = "block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-fade-in no-scrollbar" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className={`w-9 h-9 rounded-xl ${meta.bg} ${meta.color} flex items-center justify-center`}>
              <meta.icon className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-800">{meta.title}</h3>
              <p className="text-[10px] text-slate-400">{restaurant.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 cursor-pointer"><X className="w-4 h-4" /></button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {error && <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-[11px] font-bold text-red-600">{error}</div>}

          {/* Current plan summary */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-[9px] font-bold text-slate-400 uppercase">Current Plan</p>
              <p className="text-sm font-extrabold text-slate-800 mt-0.5">{subscription?.plan || '—'}</p>
              <p className="text-[10px] text-slate-400">{subscription?.status || ''}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-[9px] font-bold text-slate-400 uppercase">Expires</p>
              <p className="text-sm font-extrabold text-slate-800 mt-0.5">
                {subscription?.expiryDate ? new Date(subscription.expiryDate).toLocaleDateString() : '—'}
              </p>
              <p className="text-[10px] text-slate-400">{subscription?.billingCycle || ''} billing</p>
            </div>
          </div>

          {(mode === 'upgrade' || mode === 'downgrade') && (
            <>
              <div>
                <label className={labelCls}>
                  Available Plans{restaurant?.businessMode ? ` — ${modeLabel(restaurant.businessMode)} only` : ''}
                </label>
                <select value={planId} onChange={(e) => setPlanId(e.target.value)} className={inputCls}>
                  <option value="">Select a plan…</option>
                  {availablePlans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {p.billingCycle === 'YEARLY' ? `₹${(p.yearlyPrice || 0).toLocaleString()}/yr` : `₹${(p.monthlyPrice || 0).toLocaleString()}/mo`}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Billing Cycle</label>
                  <select value={billingCycle} onChange={(e) => setBillingCycle(e.target.value)} className={inputCls}>
                    <option value="MONTHLY">Monthly</option>
                    <option value="YEARLY">Yearly</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Effective Date</label>
                  <input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} className={inputCls} />
                </div>
              </div>
            </>
          )}

          {/* Expiry preview */}
          <div className="flex items-start gap-2.5 bg-blue-50/60 border border-blue-100 rounded-xl p-3">
            <CalendarDays className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
            <div className="text-[11px]">
              <p className="font-extrabold text-blue-700 uppercase text-[9px] tracking-wider">New Expiry Date</p>
              <p className="font-extrabold text-slate-800 mt-0.5 text-sm">{previewDate.toLocaleDateString()}</p>
              {priceLabel && <p className="text-slate-500 mt-0.5">{priceLabel} {selectedPlan?.code === 'TRIAL' ? '· Trial period' : ''}</p>}
            </div>
          </div>

          {mode === 'cancel' && (
            <div className="p-3 bg-red-50/60 border border-red-100 rounded-xl text-[11px] text-red-700 font-semibold flex items-start gap-2">
              <Ban className="w-4 h-4 shrink-0 mt-0.5" />
              Cancelling will deactivate all users of this restaurant immediately. They will be able to log in again after renewal or reactivation.
            </div>
          )}

          <div>
            <label className={labelCls}>Notes (optional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder={mode === 'cancel' ? 'Reason for cancellation…' : 'Any notes for the audit log…'} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:border-[#16A34A] resize-none" />
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100">
          <button onClick={onClose} className="h-9 px-4 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 text-xs font-bold rounded-xl cursor-pointer">Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className={`h-9 px-5 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
              mode === 'cancel' ? 'bg-red-500 hover:bg-red-600' : mode === 'downgrade' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-[#16A34A] hover:bg-[#15803D]'
            }`}
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CreditCard className="w-3.5 h-3.5" />}
            {mode === 'upgrade' ? 'Upgrade Plan' : mode === 'downgrade' ? 'Downgrade Plan' : mode === 'renew' ? 'Renew Subscription' : mode === 'activate' ? 'Activate' : 'Cancel Subscription'}
          </button>
        </div>
      </div>
    </div>
  );
}
