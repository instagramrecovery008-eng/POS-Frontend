import React, { useState, useEffect } from 'react';
import { Check, CheckCircle2, CreditCard, Loader2, AlertTriangle, Users, LayoutGrid, UtensilsCrossed, ReceiptText } from 'lucide-react';
import { onboardingApi } from '../../../api/onboarding.api';
import { FEATURE_LABELS } from '../../../utils/permissions';
import { filterPlansForBusinessType, modeLabel } from '../../../utils/businessTypes';
import useOnboardingStore from '../onboardingStore';
import { StepCard, Notice } from '../components/OnboardingShell';
import { StepActions } from '../components/controls';
import { formatINR } from '../onboarding.lib';

/**
 * Plan selection step (step 5) — YEARLY ONLY.
 *
 * This step is yearly-only by design: the backend onboarding config
 * advertises exactly one billing cycle (YEARLY) and every purchasable plan
 * carries a yearly price. Plans are loaded from the backend public endpoint —
 * pricing is never hardcoded on the frontend. After confirmation the plan is
 * submitted to the backend, which stores the subscription and moves the
 * application to PLAN_SELECTED → Review. NO payment is collected here — the
 * applicant reviews and submits the application for manual Super Admin
 * approval instead.
 */
export default function PlanStep({ onBack, onDone, onExitToLogin }) {
  const { payload, plans, config } = useOnboardingStore();
  // Only plans matching the business type's resolved mode are shown — the
  // backend also enforces this at plan selection (400 on mismatch).
  // The status payload stores the application's business type at
  // payload.restaurant.businessType (the server's safeRestaurant shape).
  // Reading a top-level payload.businessType would always be undefined and
  // silently fall back to RESTAURANT — hiding every correctly-returned
  // BASIC_POS plan behind the display filter ("No plans are available for
  // your business type").
  const businessType = payload?.restaurant?.businessType || payload?.businessType || 'RESTAURANT';
  const compatiblePlans = filterPlansForBusinessType(plans, businessType);
  const [chosen, setChosen] = useState(null); // { plan }
  const [plansError, setPlansError] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      // Load the public yearly plans once and cache them on the store.
      const list = await useOnboardingStore.getState().loadPlans();
      const currentType = useOnboardingStore.getState().payload?.restaurant?.businessType
        || useOnboardingStore.getState().payload?.businessType
        || 'RESTAURANT';
      if (Array.isArray(list) && list.length === 0) {
        setPlansError('No plans are available right now. Please try again later or contact support.');
      } else if (Array.isArray(list) && list.length > 0 && filterPlansForBusinessType(list, currentType).length === 0) {
        setPlansError('No plans are available for your business type yet. Please contact support.');
      }
    })();
  }, []);

  const confirmPlan = async () => {
    if (!chosen || submitting) return;
    setSubmitting(true);
    setFormError('');
    try {
      const resp = await onboardingApi.selectPlan(chosen.plan.id);
      if (resp && resp.success === false) {
        setFormError(resp.message || 'Could not select this plan');
        return;
      }
      await useOnboardingStore.getState().refresh();
      if (onDone) onDone();
      // Refreshed status → PLAN_SELECTED → the wizard moves to Payment.
    } catch (e) {
      setFormError(e.message || 'Could not select this plan. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const featureLabel = (key) => FEATURE_LABELS[key] || String(key).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <>
      <StepCard
        icon={CreditCard}
        title="Select Your Yearly Plan"
        subtitle="Plans are billed yearly in advance — one annual payment per year"
      >
        {plansError && <Notice tone="error" onClose={() => setPlansError('')}>{plansError}</Notice>}
        {formError && <Notice tone="error" onClose={() => setFormError('')}>{formError}</Notice>}
        {config && Array.isArray(config.billingCycles) && config.billingCycles.length === 1 && (
          <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <p className="text-[11px] font-bold text-emerald-700">
              Billing cycle: {config.billingCycles[0].label} ({config.billingCycles[0].value}) — one annual payment.
            </p>
          </div>
        )}

        {(compatiblePlans || []).length > 0 && (
          <p className="text-[11px] font-bold text-slate-500 mb-2">
            Showing {modeLabel(compatiblePlans[0].businessMode)} plans for your business type.
          </p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(compatiblePlans || []).map((plan) => {
            const isSelected = chosen?.plan.id === plan.id;
            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => { setChosen({ plan }); setFormError(''); }}
                className={`text-left p-4 rounded-2xl border-2 transition-all cursor-pointer ${
                  isSelected
                    ? 'border-[#16A34A] bg-[#16A34A]/5 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div>
                    <p className="text-sm font-extrabold text-slate-800">{plan.name}</p>
                    <p className="text-[9px] font-extrabold uppercase tracking-wider text-[#16A34A]/80 mt-0.5">{modeLabel(plan.businessMode)}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-2">{plan.description || plan.code}</p>
                  </div>
                  {isSelected && <CheckCircle2 className="w-5 h-5 text-[#16A34A] shrink-0" />}
                </div>

                <div className="flex items-baseline gap-1 my-2">
                  <span className="text-2xl font-extrabold text-slate-800 font-mono">{formatINR(plan.yearlyPrice)}</span>
                  <span className="text-[10px] text-slate-400 font-bold">/ year</span>
                </div>

                {(plan.features || []).length > 0 && (
                  <ul className="space-y-1 mt-2">
                    {(plan.features || []).map((f) => (
                      <li key={f} className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-600">
                        <Check className="w-3 h-3 text-[#16A34A] shrink-0" /> {featureLabel(f)}
                      </li>
                    ))}
                  </ul>
                )}

                {plan.limits && (
                  <div className="mt-3 grid grid-cols-2 gap-1.5">
                    <Limit icon={Users} label="Users" value={plan.limits.maxUsers} />
                    {/* Tables/Menu limits are restaurant-workflow concepts — never
                        shown for basic plans (no dine-in UI to limit). */}
                    {(plan.businessMode || 'RESTAURANT') === 'RESTAURANT' && (
                      <Limit icon={LayoutGrid} label="Tables" value={plan.limits.maxTables} />
                    )}
                    <Limit icon={UtensilsCrossed} label="Menu items" value={plan.limits.maxMenuItems} />
                    <Limit icon={ReceiptText} label="Orders/mo" value={plan.limits.maxOrdersPerMonth} />
                  </div>
                )}

                <div className={`mt-4 h-9 rounded-xl flex items-center justify-center text-[10px] font-extrabold uppercase tracking-wider transition-all ${isSelected ? 'bg-[#16A34A] text-white' : 'bg-slate-100 text-slate-500 hover:bg-[#16A34A]/10 hover:text-[#16A34A]'}`}>
                  {isSelected ? 'Selected' : 'Select Plan'}
                </div>
              </button>
            );
          })}
        </div>

        {(plans || []).length === 0 && !plansError && (
          <div className="text-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-[#16A34A] mx-auto" />
            <p className="text-xs text-slate-400 mt-2 font-semibold">Loading available plans…</p>
          </div>
        )}

        {(plans || []).length > 0 && (compatiblePlans || []).length === 0 && (
          <div className="text-center py-8">
            <p className="text-xs text-slate-400 font-semibold">No plans are available for the selected business type.</p>
          </div>
        )}

        {/* ── Selected-plan confirmation summary ── */}
        {chosen && (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/70 p-5 animate-fade-in">
            <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-3">Plan Confirmation</h3>
            <div className="space-y-2">
              <Row label="Business" value={payload?.restaurant?.name || '—'} />
              <Row label="Plan" value={chosen.plan.name} />
              <Row label="Billing" value="Yearly" />
              <Row label="Amount" value={`${formatINR(chosen.plan.yearlyPrice)} / year`} strong />
            </div>
            <div className="flex items-start gap-2 bg-white border border-slate-100 rounded-xl px-3 py-2.5 mt-4">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-[10px] font-semibold text-slate-500 leading-relaxed">
                No payment is collected now. After you submit your application, a Super Admin reviews it and shares
                payment instructions. Your workspace is only activated after payment is verified and the application is
                approved.
              </p>
            </div>
          </div>
        )}
      </StepCard>

      <StepActions
        onExitToLogin={onExitToLogin}
        onBack={onBack}
        onContinue={chosen ? confirmPlan : undefined}
        continueDisabled={!chosen}
        loading={submitting ? 'Confirming…' : false}
        continueLabel="Continue to Review"
      />
    </>
  );
}

function Row({ label, value, strong }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
      <span className={`text-xs text-right ${strong ? 'font-extrabold text-slate-800' : 'font-bold text-slate-600'}`}>{value}</span>
    </div>
  );
}

function Limit({ icon: Icon, label, value }) {
  return (
    <div className="bg-white rounded-lg px-2 py-1.5 border border-slate-100 flex items-center gap-1.5 min-w-0">
      <Icon className="w-3 h-3 text-slate-400 shrink-0" />
      <span className="text-[8px] font-bold uppercase text-slate-400 truncate">{label}</span>
      <span className="ml-auto text-[10px] font-extrabold text-slate-700">{value == null ? '∞' : value}</span>
    </div>
  );
}
