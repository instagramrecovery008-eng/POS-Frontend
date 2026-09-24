import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Crown, AlertTriangle, CheckCircle2, X, Loader2, RefreshCw,
  CreditCard, History, ShieldCheck, ArrowLeftRight, ArrowRight, Check, Info,
  XCircle, Clock, Eye,
} from 'lucide-react';
import { subscriptionApi } from '../../../api/subscription.api';
import { useAuthStore, useUiStore, useSettingsStore } from '../../../store';
import { useSocketEvent } from '../../../hooks/useSocket';
import { formatDate, cn } from '../../../lib/utils';
import { modeLabel } from '../../../utils/businessTypes';

// ── Access rule ─────────────────────────────────────────────────────────────
// This screen is NOT a sidebar module. The ONLY entry point is the header
// plan pill (ADMIN only), which routes here via setScreen('subscription').
// Staff roles never reach this screen (route guard + pill gating).

const CYCLE_LABEL = { MONTHLY: 'Monthly', YEARLY: 'Yearly', ONCE: 'One-time' };
const ACTION_LABEL = { UPGRADE: 'Upgrade', RENEWAL: 'Renew', SWITCH: 'Change Plan' };
const ACTION_BUTTON = {
  UPGRADE: 'Upgrade Plan',
  RENEWAL: 'Renew Plan',
  SWITCH: 'Change to Plan',
};

/** Load the Razorpay checkout script once (standard gateway SDK). */
let checkoutScriptPromise = null;
function loadRazorpayCheckout() {
  if (window.Razorpay) return Promise.resolve();
  if (checkoutScriptPromise) return checkoutScriptPromise;
  checkoutScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve();
    script.onerror = () => { checkoutScriptPromise = null; reject(new Error('Failed to load the payment gateway. Check your connection and try again.')); };
    document.body.appendChild(script);
  });
  return checkoutScriptPromise;
}

// ── Small building blocks (existing POS visual language) ───────────────────
const Card = ({ children, className = '' }) => (
  <div className={`bg-white rounded-[20px] border border-slate-200 shadow-xs p-5 ${className}`}>
    {children}
  </div>
);

const SectionTitle = ({ icon: Icon, title, sub }) => (
  <div className="flex items-start gap-3 mb-4">
    <div className="w-9 h-9 rounded-xl bg-[#16A34A]/10 flex items-center justify-center shrink-0">
      <Icon className="w-4.5 h-4.5 text-[#16A34A]" />
    </div>
    <div>
      <h2 className="text-sm font-extrabold text-slate-800">{title}</h2>
      {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  </div>
);

const Field = ({ label, value, mono = false }) => (
  <div className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
    <span className={cn('text-xs font-bold text-slate-700 text-right', mono && 'font-mono')}>{value}</span>
  </div>
);

// Payment status badge — communicates with text as well as color (a11y).
// CREATED is never shown as success: it means the gateway hasn't confirmed yet.
const STATUS_META = {
  PAID: { label: 'PAID', cls: 'bg-[#16A34A]/10 text-[#16A34A]' },
  FAILED: { label: 'FAILED', cls: 'bg-red-50 text-red-600' },
  CREATED: { label: 'Payment processing', cls: 'bg-slate-100 text-slate-500' },
};
const StatusBadge = ({ status }) => {
  const meta = STATUS_META[status] || { label: status || '—', cls: 'bg-slate-100 text-slate-500' };
  return (
    <span className={cn('inline-flex items-center gap-1 text-[9px] font-black uppercase px-2 py-0.5 rounded-full', meta.cls)}>
      {status === 'CREATED' && <Loader2 className="w-2.5 h-2.5 animate-spin" aria-hidden="true" />}
      {meta.label}
    </span>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
export default function SubscriptionPage() {
  const { subscription, refreshSubscription } = useAuthStore();
  const { addToast, goBack } = useUiStore();
  const { settings } = useSettingsStore();
  const currencySymbol = settings?.currencySymbol || '₹';

  const [sub, setSub] = useState(null);
  const [plans, setPlans] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Payment flow — selecting a plan opens the PAYMENT screen immediately
  const [confirmPlan, setConfirmPlan] = useState(null); // { plan, action }
  const [paying, setPaying] = useState(false);
  const [payStage, setPayStage] = useState(''); // '' | 'creating' | 'opening' | 'verifying'
  const [payOutcome, setPayOutcome] = useState(null); // { kind: 'cancelled'|'failed'|'verification-pending', message? }
  const [payError, setPayError] = useState('');
  const [backendExpiry, setBackendExpiry] = useState(null); // from POST /subscriptions/checkout (never invented on the client)
  const [success, setSuccess] = useState(null); // { planName, previousPlanName, action, amount, billingCycle, reference, expiryDate, alreadyPaid }
  const [gatewayUnavailable, setGatewayUnavailable] = useState(false);
  const payingRef = useRef(false); // synchronous re-entrancy guard — one Razorpay order per click
  const [paymentCheckId, setPaymentCheckId] = useState(null); // for Check Payment Status after verification failure
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [paymentDetail, setPaymentDetail] = useState(null); // opened payment-history row

  // Legacy scheduled-downgrade cleanup (only for data created before this
  // purchase-flow change — new plan changes are always immediate).
  const [cancellingDowngrade, setCancellingDowngrade] = useState(false);

  // ── Derived state that callbacks below depend on ──
  // Declared BEFORE load/loadPlans (and their useEffects) so there is no
  // temporal-dead-zone ReferenceError. Yearly-only billing: the restaurant
  // purchase flow offers YEARLY exclusively — there is no cycle choice.
  const activeCycle = 'YEARLY';

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // Subscription + history are cycle-independent; plans always use yearly
      // pricing (backend returns the authoritative action/price/expiry).
      // Gateway status drives the “payments unavailable” banner and reflects
      // the Super Admin's live configuration on every refresh.
      const [me, historyRes, gwStatus] = await Promise.all([
        subscriptionApi.getMySubscription(),
        subscriptionApi.getPaymentHistory(),
        subscriptionApi.getGatewayStatus().catch(() => null),
      ]);
      setSub(me.data || null);
      setHistory(Array.isArray(historyRes.data) ? historyRes.data : []);
      setGatewayUnavailable(gwStatus ? !gwStatus.data?.enabled : false);
    } catch (e) {
      setError(e.message || 'Failed to load subscription details');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPlans = useCallback(async () => {
    try {
      // The BACKEND filters this list to the restaurant's server-resolved
      // business mode (same resolver as onboarding). The list is consumed as
      // returned — no client-side business-type filtering is added here.
      const plansRes = await subscriptionApi.listPlans();
      setPlans(Array.isArray(plansRes.data) ? plansRes.data : []);
    } catch (e) {
      setError(e.message || 'Failed to load available plans');
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadPlans(); }, [loadPlans]);

  // Live refresh: when the backend activates a subscription (this tab's own
  // payment or a webhook on another terminal), refresh everything immediately.
  useSocketEvent({
    event: 'subscription:updated',
    handler: () => { refreshSubscription(); load(); },
  });

  // ── Derived state ──
  const status = sub?.status || subscription?.status || 'ACTIVE';
  const expired = status === 'EXPIRED' || (typeof sub?.daysRemaining === 'number' && sub.daysRemaining <= 0);
  const daysLeft = sub?.daysRemaining ?? subscription?.daysRemaining ?? 0;
  const currentPlanId = sub?.planId ?? subscription?.planId;
  const currentPlan = plans.find((p) => Number(p.id) === Number(currentPlanId));

  // Price/action/expectedExpiry come from the BACKEND plans response — the
  // frontend never classifies plans by price.
  const priceFor = useCallback((plan) => Number(plan?.price ?? plan?.monthlyPrice ?? 0), []);

  const scheduledPlan = plans.find((p) => Number(p.id) === Number(sub?.scheduledPlanId));

  // ── Handlers ──
  const handleRefresh = async () => {
    setRefreshing(true);
    const ok = await refreshSubscription();
    if (ok) { addToast('Subscription refreshed', 'success'); await load(); }
    else addToast('Could not refresh subscription', 'error');
    setRefreshing(false);
  };

  const startPayment = async () => {
    if (!confirmPlan || payingRef.current) return; // synchronous double-click guard
    payingRef.current = true;
    setPaying(true);
    setPayStage('creating');
    setPayError('');
    setPayOutcome(null);
    setGatewayUnavailable(false);
    try {
      const checkout = await subscriptionApi.createCheckout({
        planId: confirmPlan.plan.id,
        billingCycle: activeCycle,
        action: confirmPlan.action,
      });
      const { subscriptionPaymentId, razorpayOrderId, amount, keyId, plan, expectedExpiry } = checkout.data;
      // New expiry is always the backend's calculation (existing subscription
      // logic) — the client never invents it. Remember the payment row so the
      // "Check Payment Status" action can query it after a verification hiccup.
      setPaymentCheckId(subscriptionPaymentId);
      if (expectedExpiry) setBackendExpiry(expectedExpiry);

      setPayStage('opening');
      await loadRazorpayCheckout();
      if (!window.Razorpay) throw new Error('Payment gateway is not available');

      const outcome = await new Promise((resolve) => {
        const rzp = new window.Razorpay({
          key: keyId,
          amount: Math.round(Number(amount) * 100),
          currency: 'INR',           name: 'Nirka POS',
          description: `${ACTION_LABEL[confirmPlan.action]} — ${plan?.name || 'Plan'}`,
          order_id: razorpayOrderId,
          handler: async (response) => {
            try {
              setPayStage('verifying');
              const verify = await subscriptionApi.verifyPayment({
                subscriptionPaymentId,
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              });
              const fresh = verify.data?.subscription || (await subscriptionApi.refresh()).data;
              await refreshSubscription();
              setSuccess({
                previousPlanName: sub?.planName || sub?.plan,
                planName: plan?.name || fresh?.planName || fresh?.plan,
                action: confirmPlan.action,
                amount,
                billingCycle: activeCycle,
                reference: response.razorpay_payment_id,
                expiryDate: fresh?.expiryDate,
                alreadyPaid: !!verify.data?.alreadyPaid,
              });
              setConfirmPlan(null);
              setPayOutcome(null);
              await load();
              resolve({ kind: 'success' });
            } catch (e) {
              // Razorpay reported success but server verification failed.
              // Never assume the payment succeeded — the webhook may still
              // confirm it, so offer a status check instead.
              resolve({ kind: 'verification-pending', message: e.message });
            }
          },
          modal: {
            ondismiss: () => resolve({ kind: 'cancelled' }), // user closed the gateway
          },
        });
        rzp.on('payment.failed', (resp) => {
          resolve({ kind: 'failed', message: resp?.error?.description || 'Payment failed. No plan was activated.' });
        });
        rzp.open();
      });

      if (outcome.kind === 'cancelled') {
        setPayOutcome({ kind: 'cancelled' });
      } else if (outcome.kind === 'failed') {
        setPayOutcome({ kind: 'failed', message: outcome.message });
      } else if (outcome.kind === 'verification-pending') {
        setPayOutcome({ kind: 'verification-pending', message: outcome.message });
      }
      // 'success' is handled inside the handler (sets the success screen)
    } catch (e) {
      const status = e.status;
      if (status === 503 || (e.message && /not configured/i.test(e.message))) {
        setGatewayUnavailable(true);
        // Surface it INSIDE the payment modal too — the page-level banner sits
        // behind the modal overlay, so without this the Pay click looks dead.
        setPayError('Online payments are not configured for this platform yet. Contact your Super Admin to enable the payment gateway.');
      } else if (status === 400) {
        setPayError('Unable to start this payment. Please refresh the plans and try again.');
      } else if (status === 403) {
        setPayError("You don't have permission to manage the subscription.");
      } else if (status === 0 || status == null) {
        setPayError('Unable to connect to the server. Please check your connection.');
      } else {
        setPayError(e.message || 'Payment could not be completed');
      }
    } finally {
      payingRef.current = false;
      setPaying(false);
      setPayStage('');
    }
  };

  // After a verification hiccup: query the persisted payment row. If the
  // webhook already confirmed it (PAID), activate the success screen.
  const handleCheckPaymentStatus = async () => {
    if (!paymentCheckId || checkingPayment) return;
    setCheckingPayment(true);
    setPayError('');
    try {
      const res = await subscriptionApi.getPayment(paymentCheckId);
      const pay = res.data;
      if (pay?.status === 'PAID') {
        await refreshSubscription();
        await load();
        setSuccess({
          previousPlanName: sub?.planName || sub?.plan,
          planName: pay.planName || pay.planCode,
          action: pay.action,
          amount: pay.amount,
          billingCycle: pay.billingCycle,
          reference: pay.razorpayPaymentId,
          expiryDate: pay.paidAt,
          alreadyPaid: true,
        });
        setConfirmPlan(null);
        setPayOutcome(null);
      } else if (pay?.status === 'FAILED') {
        setPayOutcome({ kind: 'failed', message: pay.errorMessage || 'Payment failed. Your subscription was not changed.' });
      } else {
        // Still CREATED — the gateway/webhook has not confirmed it yet.
        setPayError('Payment processing. Your subscription has not been changed — the server will confirm the payment shortly.');
      }
    } catch (e) {
      setPayError(e.message || 'Could not check payment status');
    } finally {
      setCheckingPayment(false);
    }
  };

  const handleCancelDowngrade = async () => {
    setCancellingDowngrade(true);
    try {
      await subscriptionApi.cancelScheduledDowngrade();
      addToast('Scheduled downgrade cancelled', 'success');
      await load();
    } catch (e) {
      addToast(e.message || 'Could not cancel downgrade', 'error');
    } finally {
      setCancellingDowngrade(false);
    }
  };

  // ── Success screen ──
  if (success) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center select-none">
        <Card className="w-full max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-[#16A34A]/10 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-9 h-9 text-[#16A34A]" />
          </div>
          <h2 className="text-xl font-extrabold text-slate-800">
            {success.alreadyPaid ? 'Payment Already Processed' : 'Payment Successful'}
          </h2>
          <p className="text-xs text-slate-400 mt-1">Your subscription has been updated</p>

          <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50/60 p-4 text-left space-y-2.5">
            {success.previousPlanName && success.previousPlanName !== success.planName && (
              <div className="flex justify-between">
                <span className="text-[10px] font-bold uppercase text-slate-400">Current</span>
                <span className="text-xs font-bold text-slate-600">{success.previousPlanName}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-[10px] font-bold uppercase text-slate-400">{success.previousPlanName && success.previousPlanName !== success.planName ? 'New' : 'Plan'}</span>
              <span className="text-xs font-extrabold text-slate-800">{success.planName}</span>
            </div>
            {success.action && (
              <div className="flex justify-between">
                <span className="text-[10px] font-bold uppercase text-slate-400">Action</span>
                <span className="text-xs font-bold text-slate-700">{ACTION_LABEL[success.action] || success.action}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-[10px] font-bold uppercase text-slate-400">Amount</span>
              <span className="text-xs font-bold text-slate-700 font-mono">{currencySymbol}{Number(success.amount || 0).toFixed(2)}</span>
            </div>
            {success.billingCycle && (
              <div className="flex justify-between">
                <span className="text-[10px] font-bold uppercase text-slate-400">Billing Cycle</span>
                <span className="text-xs font-bold text-slate-700">{CYCLE_LABEL[success.billingCycle] || success.billingCycle}</span>
              </div>
            )}
            {success.expiryDate && (
              <div className="flex justify-between">
                <span className="text-[10px] font-bold uppercase text-slate-400">New Expiry</span>
                <span className="text-xs font-bold text-slate-700">{formatDate(success.expiryDate)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-[10px] font-bold uppercase text-slate-400">Payment Reference</span>
              <span className="text-xs font-bold text-slate-700 font-mono truncate max-w-[180px]">{success.reference || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[10px] font-bold uppercase text-slate-400">Status</span>
              <span className="text-[10px] font-extrabold text-[#16A34A] bg-[#16A34A]/10 px-2 py-0.5 rounded-full">PAID</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[10px] font-bold uppercase text-slate-400">Features</span>
              <span className="text-[10px] font-bold text-[#16A34A]">New plan features activated</span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 mt-6">
            <button
              onClick={() => { setSuccess(null); goBack(); }}
              className="h-11 rounded-xl bg-[#16A34A] hover:bg-[#15803D] text-white font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm"
            >
              <Check className="w-4 h-4" /> Continue to POS
            </button>
            <button
              onClick={() => { setSuccess(null); }}
              className="h-11 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold text-xs uppercase tracking-wider transition-all cursor-pointer"
            >
              View Subscription
            </button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 select-none animate-fade-in">
      {/* ── Page header ── */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-extrabold text-slate-800">Subscription & Billing</h1>
          <p className="text-[11px] text-slate-400 mt-0.5">Manage your plan, upgrade, renew and view payment history</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="h-10 px-3.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-600 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 shrink-0"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', refreshing && 'animate-spin')} /> Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
          <p className="text-xs font-semibold text-red-700">{error}</p>
        </div>
      )}

      {gatewayUnavailable && !error && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
          <p className="text-xs font-semibold text-amber-700">
            Online payments are not configured for this platform yet. Contact your Super Admin to enable the payment gateway.
          </p>
          <button onClick={() => setGatewayUnavailable(false)} className="ml-auto p-1 text-amber-500 hover:text-amber-700 cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
      )}

      {payError && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
          <p className="text-xs font-semibold text-red-700">{payError}</p>
          <button onClick={() => setPayError('')} className="ml-auto p-1 text-red-400 hover:text-red-600 cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
      )}

      {expired && !error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
          <p className="text-xs font-semibold text-red-700">
            {sub?.expiryMessage || 'Your plan has expired. Renew now to restore access to all modules.'}
          </p>
        </div>
      )}
      {!expired && sub?.lifecycle === 'EXPIRING_SOON' && !error && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
          <p className="text-xs font-semibold text-amber-700">
            {sub?.expiryMessage || `Your plan expires in ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}. Renew now to avoid interruption.`}
          </p>
        </div>
      )}

      {loading ? (
        <div className="space-y-4 animate-pulse">
          <div className="h-44 bg-slate-100 rounded-[20px]" />
          <div className="h-56 bg-slate-100 rounded-[20px]" />
        </div>
      ) : (
        <>
          {/* ── Current plan ── */}
          <Card>
            <SectionTitle icon={Crown} title="Current Plan" sub="Your active subscription details" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <Field label="Plan" value={`${sub?.planName || sub?.plan || '—'}${sub?.planName ? '' : ''}`} />
              <Field label="Plan Price" value={`${currencySymbol}${Number(sub?.amount || 0).toFixed(2)} / ${CYCLE_LABEL[sub?.billingCycle] || '—'}`} mono />
              <Field label="Billing Cycle" value={CYCLE_LABEL[sub?.billingCycle] || '—'} />
              <Field label="Subscription Status" value={status} />
              <Field label="Start Date" value={formatDate(sub?.startDate)} />
              <Field label="Expiry Date" value={formatDate(sub?.expiryDate) || '—'} />
              {expired && (
                <Field label="Expired On" value={formatDate(sub?.expiryDate) || '—'} />
              )}
              <Field label="Days Remaining" value={expired ? 'Expired' : `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}`} />
              <Field label="Auto-Renew" value={sub?.autoRenew ? 'Preference saved — renew manually' : 'Off'} />
            </div>
            {scheduledPlan && (
              <div className="mt-4 flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
                <ArrowLeftRight className="w-4 h-4 text-blue-500 shrink-0" />
                <p className="text-xs font-semibold text-blue-700 flex-1">
                  Downgrade to <b>{scheduledPlan.name}</b> is scheduled for your next renewal ({formatDate(sub?.expiryDate)}).
                </p>
                <button
                  onClick={handleCancelDowngrade}
                  disabled={cancellingDowngrade}
                  className="h-9 px-3 rounded-lg border border-blue-200 bg-white hover:bg-blue-50 text-blue-700 text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50"
                >
                  {cancellingDowngrade ? '...' : 'Cancel'}
                </button>
              </div>
            )}
          </Card>

          {/* ── Available plans ── */}
          <Card>
            <SectionTitle
              icon={CreditCard}
              title="Available Plans"
              sub={`Choose a yearly plan — it activates immediately after successful payment${plans[0]?.businessMode ? ` · ${modeLabel(plans[0].businessMode)} plans for your business type` : ''}`}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {plans.map((plan) => {
                const isCurrent = Number(plan.id) === Number(currentPlanId);
                const price = priceFor(plan);
                const action = plan.action || 'RENEWAL'; // backend-computed
                return (
                  <div
                    key={plan.id}
                    className={cn(
                      'relative rounded-2xl border p-4 flex flex-col transition-all',
                      isCurrent ? 'border-[#16A34A] bg-[#16A34A]/5 shadow-md' : 'border-slate-200 hover:border-slate-300 hover:shadow-sm'
                    )}
                  >
                    {isCurrent && (
                      <span className="absolute top-3 right-3 text-[8px] font-black uppercase tracking-wider bg-[#16A34A] text-white px-2 py-0.5 rounded-full">
                        Current
                      </span>
                    )}
                    <h3 className="text-sm font-extrabold text-slate-800">{plan.name}</h3>
                    <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-2">{plan.description || '—'}</p>
                    <div className="mt-3 flex items-baseline gap-1">
                      <span className="text-xl font-extrabold text-slate-800 font-mono">{currencySymbol}{price.toFixed(0)}</span>
                      <span className="text-[10px] text-slate-400 font-bold">/{ CYCLE_LABEL[activeCycle].toLowerCase() }</span>
                    </div>

                    {plan.limits && (
                      <div className="mt-3 space-y-1">
                        <p className="text-[9px] font-bold text-slate-400 flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Up to {plan.limits.maxUsers ?? '∞'} users, {plan.limits.maxTables ?? '∞'} tables</p>
                        <p className="text-[9px] font-bold text-slate-400 flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> {plan.limits.maxMenuItems ?? '∞'} menu items, {plan.limits.maxOrdersPerMonth ?? '∞'} orders/mo</p>
                      </div>
                    )}

                    <div className="mt-3 flex flex-wrap gap-1">
                      {(plan.modules || []).slice(0, 6).map((m) => (
                        <span key={m.key} className={cn(
                          'text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded',
                          m.enabled ? 'bg-[#16A34A]/10 text-[#16A34A]' : 'bg-slate-100 text-slate-400 line-through'
                        )}>
                          {m.name || m.key}
                        </span>
                      ))}
                      {(plan.modules || []).length > 6 && (
                        <span className="text-[8px] font-bold text-slate-400 px-1 py-0.5">+{(plan.modules || []).length - 6} more</span>
                      )}
                    </div>

                    <div className="mt-auto pt-4">
                      <button
                        onClick={() => {
                          setBackendExpiry(null); setPayError(''); setPayOutcome(null); setConfirmPlan({ plan, action });
                        }}
                        disabled={paying}
                        className={cn(
                          'w-full h-11 rounded-xl text-xs font-extrabold uppercase tracking-wider transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed',
                          action === 'RENEWAL'
                            ? 'border-2 border-[#16A34A] text-[#16A34A] hover:bg-[#16A34A] hover:text-white'
                            : 'bg-[#16A34A] hover:bg-[#15803D] text-white shadow-sm'
                        )}
                      >
                        {ACTION_BUTTON[action] || ACTION_BUTTON.UPGRADE}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* ── Payment history ── */}
          {history.length > 0 && (
            <Card>
              <SectionTitle icon={History} title="Payment History" sub="Real gateway payment references only" />

              {/* Mobile / tablet portrait — responsive cards (no wide scroll) */}
              <div className="space-y-2 lg:hidden">
                {history.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPaymentDetail(p)}
                    className="w-full text-left rounded-xl border border-slate-100 hover:border-slate-200 bg-white p-3.5 transition-all cursor-pointer"
                    aria-label={`View payment details for ${p.planName || p.planCode}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-extrabold text-slate-800">{p.planName || p.planCode}</span>
                      <StatusBadge status={p.status} />
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-1.5">
                      <span className="text-[10px] font-semibold text-slate-500">{formatDate(p.createdAt)} · {ACTION_LABEL[p.action] || p.action}</span>
                      <span className="text-xs font-mono font-bold text-slate-700">{currencySymbol}{Number(p.amount || 0).toFixed(2)}</span>
                    </div>
                    {p.razorpayPaymentId && (
                      <p className="text-[9px] font-mono text-slate-400 truncate mt-1">Ref: {p.razorpayPaymentId}</p>
                    )}
                  </button>
                ))}
              </div>

              {/* Tablet landscape / desktop — full table */}
              <div className="hidden lg:block overflow-x-auto -mx-5 px-5">
                <table className="w-full text-xs min-w-[620px]">
                  <thead>
                    <tr className="border-b border-slate-100">
                      {['Date', 'Plan', 'Action', 'Billing Cycle', 'Amount', 'Status', 'Payment Reference', ''].map((h, i) => (
                        <th key={i} className="text-left py-2 pr-3 text-[9px] font-black uppercase tracking-wider text-slate-400">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((p) => (
                      <tr key={p.id} className="border-b border-slate-50 last:border-0 cursor-pointer hover:bg-slate-50/60 transition-colors" onClick={() => setPaymentDetail(p)}>
                        <td className="py-2.5 pr-3 font-semibold text-slate-600 whitespace-nowrap">{formatDate(p.createdAt)}</td>
                        <td className="py-2.5 pr-3 font-bold text-slate-700">{p.planName || p.planCode}</td>
                        <td className="py-2.5 pr-3">
                          <span className={cn(
                            'text-[9px] font-black uppercase px-2 py-0.5 rounded-full',
                            p.action === 'RENEWAL' ? 'bg-blue-50 text-blue-600' : 'bg-[#16A34A]/10 text-[#16A34A]'
                          )}>{ACTION_LABEL[p.action] || p.action}</span>
                        </td>
                        <td className="py-2.5 pr-3 font-semibold text-slate-500">{CYCLE_LABEL[p.billingCycle] || p.billingCycle || '—'}</td>
                        <td className="py-2.5 pr-3 font-mono font-bold text-slate-700">{currencySymbol}{Number(p.amount || 0).toFixed(2)}</td>
                        <td className="py-2.5 pr-3"><StatusBadge status={p.status} /></td>
                        <td className="py-2.5 font-mono font-bold text-slate-500 truncate max-w-[140px]">{p.razorpayPaymentId || '—'}</td>
                        <td className="py-2.5 pl-2"><Eye className="w-4 h-4 text-slate-400" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}

      {/* ── PAYMENT screen ──
          Selecting a plan opens this immediately — there is no separate
          confirmation step. The review uses only DB/backend values. */}
      {confirmPlan && (
        <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-3 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md max-h-[92vh] overflow-y-auto p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#16A34A]/10 flex items-center justify-center">
                  <CreditCard className="w-4.5 h-4.5 text-[#16A34A]" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wide">Payment</h3>
                  <p className="text-[10px] text-slate-400">{sub?.planName || sub?.plan || 'Current'} → {confirmPlan.plan.name}</p>
                </div>
              </div>
              <button onClick={() => setConfirmPlan(null)} className="p-2 text-slate-400 hover:text-slate-600 cursor-pointer" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase text-slate-400">Current Plan</span>
                <span className="text-xs font-bold text-slate-700">{sub?.planName || sub?.plan || '—'}</span>
              </div>
              <div className="flex items-center justify-center gap-2 text-[#16A34A] py-0.5">
                <ArrowRight className="w-4 h-4" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase text-slate-400">Selected Plan</span>
                <span className="text-xs font-extrabold text-slate-800">{confirmPlan.plan.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[10px] font-bold uppercase text-slate-400">Billing Cycle</span>
                <span className="text-xs font-bold text-slate-700">{CYCLE_LABEL[activeCycle]}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[10px] font-bold uppercase text-slate-400">Amount</span>
                <span className="text-xs font-bold text-slate-700 font-mono">{currencySymbol}{priceFor(confirmPlan.plan).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[10px] font-bold uppercase text-slate-400">Action</span>
                <span className="text-xs font-bold text-slate-700">{ACTION_LABEL[confirmPlan.action]}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[10px] font-bold uppercase text-slate-400">Current Expiry</span>
                <span className="text-xs font-bold text-slate-700">{formatDate(sub?.expiryDate) || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[10px] font-bold uppercase text-slate-400">New Expiry</span>
                <span className="text-xs font-bold text-slate-700">
                  {backendExpiry
                    ? formatDate(backendExpiry)
                    : confirmPlan.plan.expectedExpiry
                      ? formatDate(confirmPlan.plan.expectedExpiry)
                      : 'Calculated by backend'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[10px] font-bold uppercase text-slate-400">Effective</span>
                <span className="text-xs font-bold text-slate-700">
                  {confirmPlan.action === 'RENEWAL' && !expired ? 'Extends from current expiry' : 'Immediately after successful payment'}
                </span>
              </div>
            </div>

            {confirmPlan.action === 'UPGRADE' && daysLeft > 7 && !expired && (
              <div className="mt-3 flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5">
                <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                <p className="text-[10px] font-semibold text-blue-700 leading-relaxed">
                  You have <b>{daysLeft} days</b> remaining on your current plan. Your upgrade takes effect immediately after payment, and your remaining subscription period is preserved — the new expiry is calculated from your current expiry date.
                </p>
              </div>
            )}
            {confirmPlan.action === 'UPGRADE' && daysLeft <= 7 && !expired && (
              <div className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-[10px] font-semibold text-amber-700 leading-relaxed">
                  Your plan expires in <b>{daysLeft} {daysLeft === 1 ? 'day' : 'days'}</b>. Upgrade now and your new plan activates immediately after payment.
                </p>
              </div>
            )}
            {confirmPlan.action === 'RENEWAL' && (
              <div className="mt-3 flex items-start gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <p className="text-[10px] font-semibold text-emerald-700 leading-relaxed">
                  Renewal extends your subscription from your current expiry date ({formatDate(sub?.expiryDate)}) — you never lose remaining paid days.
                </p>
              </div>
            )}
            {confirmPlan.action === 'SWITCH' && (
              <div className="mt-3 flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5">
                <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                <p className="text-[10px] font-semibold text-blue-700 leading-relaxed">
                  You are changing your subscription immediately after successful payment.
                </p>
              </div>
            )}

            {payError && (
              <div className="mt-3 flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                <p className="text-[10px] font-semibold text-red-700">{payError}</p>
              </div>
            )}

            {payOutcome?.kind === 'cancelled' && (
              <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-center" role="alert">
                <XCircle className="w-9 h-9 text-amber-500 mx-auto mb-2" />
                <h4 className="text-sm font-extrabold text-slate-800">Payment cancelled</h4>
                <p className="text-[11px] text-slate-500 mt-1">Your subscription has not been changed.</p>
                <div className="grid grid-cols-2 gap-2 mt-4">
                  <button
                    onClick={startPayment}
                    disabled={paying}
                    className="h-11 rounded-xl bg-[#16A34A] hover:bg-[#15803D] disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <RefreshCw className="w-4 h-4" /> Try Again
                  </button>
                  <button
                    onClick={() => { setConfirmPlan(null); setPayOutcome(null); setPayError(''); }}
                    className="h-11 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
                  >
                    Back to Plans
                  </button>
                </div>
              </div>
            )}

            {payOutcome?.kind === 'failed' && (
              <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-center" role="alert">
                <AlertTriangle className="w-9 h-9 text-red-500 mx-auto mb-2" />
                <h4 className="text-sm font-extrabold text-slate-800">Payment failed</h4>
                <p className="text-[11px] text-slate-500 mt-1">
                  {payOutcome.message || "We couldn't complete your payment. Your current subscription is unchanged."}
                </p>
                <div className="grid grid-cols-2 gap-2 mt-4">
                  <button
                    onClick={startPayment}
                    disabled={paying}
                    className="h-11 rounded-xl bg-[#16A34A] hover:bg-[#15803D] disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <RefreshCw className="w-4 h-4" /> Try Again
                  </button>
                  <button
                    onClick={() => { setConfirmPlan(null); setPayOutcome(null); setPayError(''); }}
                    className="h-11 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
                  >
                    Back to Plans
                  </button>
                </div>
              </div>
            )}

            {payOutcome?.kind === 'verification-pending' && (
              <div className="mt-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-center" role="alert">
                <Clock className="w-9 h-9 text-blue-500 mx-auto mb-2" />
                <h4 className="text-sm font-extrabold text-slate-800">Payment verification is pending</h4>
                <p className="text-[11px] text-slate-500 mt-1">
                  We received your payment response, but couldn't verify it yet. Your subscription has not been changed.
                </p>
                <div className="grid grid-cols-2 gap-2 mt-4">
                  <button
                    onClick={handleCheckPaymentStatus}
                    disabled={checkingPayment}
                    className="h-11 rounded-xl bg-[#16A34A] hover:bg-[#15803D] disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    {checkingPayment ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Check Payment Status
                  </button>
                  <button
                    onClick={() => { setConfirmPlan(null); setPayOutcome(null); setPayError(''); }}
                    className="h-11 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
                  >
                    Back to Subscription
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-2 mt-4">
              <button
                onClick={startPayment}
                disabled={paying}
                aria-busy={paying}
                className="h-12 rounded-xl bg-[#16A34A] hover:bg-[#15803D] disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm"
              >
                {paying ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> {payStage === 'creating' ? 'Creating secure payment…' : payStage === 'opening' ? 'Opening Razorpay…' : payStage === 'verifying' ? 'Verifying payment…' : 'Processing…'}</>
                ) : (
                  <><CreditCard className="w-4 h-4" /> Pay {currencySymbol}{priceFor(confirmPlan.plan).toFixed(0)} & {ACTION_BUTTON[confirmPlan.action] || 'Upgrade Plan'}</>
                )}
              </button>
              <button
                onClick={() => setConfirmPlan(null)}
                disabled={paying}
                className="h-11 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
            <p aria-live="polite" className="text-[9px] text-slate-400 mt-3 text-center">
              {paying && payStage === 'creating' ? 'Creating secure payment…' : paying && payStage === 'opening' ? 'Complete payment in the secure Razorpay window.' : paying && payStage === 'verifying' ? 'Verifying your payment with the server…' : 'Payment is processed securely by Razorpay. Your plan activates only after the payment is verified by the server.'}
            </p>
          </div>
        </div>
      )}

      {/* ── Payment details panel (from real SubscriptionPayment record) ── */}
      {paymentDetail && (
        <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-3 animate-fade-in" onClick={() => setPaymentDetail(null)}>
          <div
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm max-h-[90vh] overflow-y-auto p-5"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Payment details"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wide">Payment Details</h3>
              <button onClick={() => setPaymentDetail(null)} className="p-2 text-slate-400 hover:text-slate-600 cursor-pointer" aria-label="Close payment details">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
              <div className="flex justify-between">
                <span className="text-[10px] font-bold uppercase text-slate-400">Plan</span>
                <span className="text-xs font-extrabold text-slate-800">{paymentDetail.planName || paymentDetail.planCode || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[10px] font-bold uppercase text-slate-400">Action</span>
                <span className="text-xs font-bold text-slate-700">{ACTION_LABEL[paymentDetail.action] || paymentDetail.action || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[10px] font-bold uppercase text-slate-400">Amount</span>
                <span className="text-xs font-bold text-slate-700 font-mono">{currencySymbol}{Number(paymentDetail.amount || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[10px] font-bold uppercase text-slate-400">Billing Cycle</span>
                <span className="text-xs font-bold text-slate-700">{CYCLE_LABEL[paymentDetail.billingCycle] || paymentDetail.billingCycle || '—'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold uppercase text-slate-400">Status</span>
                <StatusBadge status={paymentDetail.status} />
              </div>
              {paymentDetail.razorpayOrderId && (
                <div className="flex justify-between gap-3">
                  <span className="text-[10px] font-bold uppercase text-slate-400 shrink-0">Order ID</span>
                  <span className="text-[10px] font-mono font-bold text-slate-600 break-all text-right">{paymentDetail.razorpayOrderId}</span>
                </div>
              )}
              {paymentDetail.razorpayPaymentId && (
                <div className="flex justify-between gap-3">
                  <span className="text-[10px] font-bold uppercase text-slate-400 shrink-0">Payment ID</span>
                  <span className="text-[10px] font-mono font-bold text-slate-600 break-all text-right">{paymentDetail.razorpayPaymentId}</span>
                </div>
              )}
              {paymentDetail.paymentMethod && (
                <div className="flex justify-between">
                  <span className="text-[10px] font-bold uppercase text-slate-400">Payment Method</span>
                  <span className="text-xs font-bold text-slate-700">{paymentDetail.paymentMethod}</span>
                </div>
              )}
              {paymentDetail.paidAt && (
                <div className="flex justify-between">
                  <span className="text-[10px] font-bold uppercase text-slate-400">Paid At</span>
                  <span className="text-xs font-bold text-slate-700">{formatDate(paymentDetail.paidAt)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-[10px] font-bold uppercase text-slate-400">Created At</span>
                <span className="text-xs font-bold text-slate-700">{formatDate(paymentDetail.createdAt)}</span>
              </div>
              {paymentDetail.errorMessage && (
                <div className="flex justify-between gap-3">
                  <span className="text-[10px] font-bold uppercase text-slate-400 shrink-0">Note</span>
                  <span className="text-[10px] font-semibold text-red-600 text-right">{paymentDetail.errorMessage}</span>
                </div>
              )}
            </div>

            <button
              onClick={() => setPaymentDetail(null)}
              className="w-full h-11 mt-4 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
