import React, { useState } from 'react';
import {
  Loader2, CheckCircle2, XCircle, AlertTriangle, Clock, Hourglass, ShieldAlert, LogOut, ArrowRight, RefreshCw,
} from 'lucide-react';
import { useAuthStore, useUiStore, useSettingsStore } from '../../../store';
import useOnboardingStore from '../onboardingStore';
import { StepCard } from '../components/OnboardingShell';
import { formatINR } from '../onboarding.lib';

/* ─────────────────────────────────────────────────────────────────────────
 * Application Submitted — waiting for Super Admin (manual review flow)
 * ───────────────────────────────────────────────────────────────────────── */
export function PendingStatus() {
  const { payload, refresh } = useOnboardingStore();
  const { logout } = useAuthStore();
  const { setScreen } = useUiStore();
  const [refreshing, setRefreshing] = useState(false);

  const status = payload?.account?.status || 'MANUAL_PENDING';
  const restaurant = payload?.restaurant || {};
  const plan = payload?.selectedPlan || null;

  const meta = {
    MANUAL_PENDING: {
      title: 'Application Submitted Successfully',
      body: 'Your application has been submitted and is waiting for Super Admin approval.',
      icon: CheckCircle2,
      tone: 'text-emerald-600 bg-emerald-50 border-emerald-200',
    },
    MANUAL_PAYMENT_PENDING: {
      title: 'Application Under Review',
      body: 'Your application is awaiting payment verification by the administrator.',
      icon: Hourglass,
      tone: 'text-amber-500 bg-amber-50 border-amber-200',
    },
    MANUAL_PAYMENT_RECEIVED: {
      title: 'Payment Received — Awaiting Approval',
      body: 'Payment received. Your application is now awaiting final approval from the administrator.',
      icon: Hourglass,
      tone: 'text-blue-500 bg-blue-50 border-blue-200',
    },
  }[status] || {
    title: 'Application Submitted',
    body: 'Your application is waiting for Super Admin approval.',
    icon: CheckCircle2,
    tone: 'text-emerald-600 bg-emerald-50 border-emerald-200',
  };

  const Icon = meta.icon;

  const checkStatus = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto text-center">
      <StepCard>
        <div className={`w-16 h-16 rounded-full border flex items-center justify-center mx-auto mb-4 ${meta.tone}`}>
          <Icon className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-extrabold text-slate-800">{meta.title}</h2>
        <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">{meta.body}</p>

        <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50/70 p-5 text-left space-y-2.5">
          {restaurant.id != null && (
            <div className="flex justify-between">
              <span className="text-[10px] font-bold uppercase text-slate-400">Application ID</span>
              <span className="text-xs font-extrabold text-slate-800 font-mono">APP-{String(restaurant.id).padStart(4, '0')}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-[10px] font-bold uppercase text-slate-400">Business</span>
            <span className="text-xs font-extrabold text-slate-800">{restaurant.name || '—'}</span>
          </div>
          {plan && (
            <div className="flex justify-between">
              <span className="text-[10px] font-bold uppercase text-slate-400">Plan</span>
              <span className="text-xs font-bold text-slate-700">{plan.name || plan.code || '—'} — Yearly</span>
            </div>
          )}
          {plan && plan.amount != null && (
            <div className="flex justify-between">
              <span className="text-[10px] font-bold uppercase text-slate-400">Plan Amount</span>
              <span className="text-xs font-bold text-slate-700">{formatINR(plan.amount)} / year</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-[10px] font-bold uppercase text-slate-400">Status</span>
            <span className="text-[10px] font-extrabold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
              PENDING ADMIN APPROVAL
            </span>
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3">
          <p className="text-[10px] font-semibold text-slate-500 leading-relaxed">
            Your restaurant application has been submitted successfully. Our administrator will review your application
            and share payment instructions. Your restaurant POS stays locked until the administrator approves your
            application.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-6">
          <button
            type="button"
            onClick={checkStatus}
            disabled={refreshing}
            className="h-10 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold text-xs uppercase tracking-wider transition-all cursor-pointer inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Check Status
          </button>
          <button
            type="button"
            onClick={() => { setScreen('login'); logout(); }}
            className="h-10 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold text-xs uppercase tracking-wider transition-all cursor-pointer inline-flex items-center justify-center gap-1.5"
          >
            <LogOut className="w-3.5 h-3.5" /> Log Out
          </button>
        </div>
      </StepCard>
    </div>
  );
}


/* ─────────────────────────────────────────────────────────────────────────
 * Application Under Review (manual review mode — default)
 * ───────────────────────────────────────────────────────────────────────── */
export function ReviewStatus() {
  const { payload } = useOnboardingStore();
  const { logout } = useAuthStore();
  const { setScreen } = useUiStore();

  const steps = [
    { label: 'Account Created', done: true },
    { label: 'Business Details Completed', done: true },
    { label: 'Documents Submitted', done: true },
    { label: 'Terms & Privacy Accepted', done: true },
    { label: 'Yearly Plan Selected', done: true },
    { label: 'Application Submitted', done: true },
    { label: 'Application Approved', done: false, pending: true },
  ];

  return (
    <div className="max-w-lg mx-auto text-center">
      <StepCard title="" subtitle="">
        <div className="w-16 h-16 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto mb-4">
          <Hourglass className="w-8 h-8 text-amber-500" />
        </div>
        <h2 className="text-xl font-extrabold text-slate-800">Application Under Review</h2>
        <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
          {payload?.account?.label || 'Your application is being reviewed by our team.'}
        </p>

        <div className="mt-6 space-y-2 text-left max-w-sm mx-auto">
          {steps.map((s) => (
            <div key={s.label} className="flex items-center gap-2.5">
              {s.done ? (
                <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0" />
              ) : (
                <Loader2 className="w-4 h-4 animate-spin text-slate-300 shrink-0" />
              )}
              <span className={`text-xs font-semibold ${s.done ? 'text-slate-700' : 'text-slate-400'}`}>{s.label}</span>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3 text-left">
          <p className="text-[10px] font-semibold text-slate-500 leading-relaxed">
            Your business application is now being reviewed. You will receive access to your Restaurant POS after approval.
            This page refreshes automatically — no need to log in again.
          </p>
        </div>

        <button
          type="button"
          onClick={() => { setScreen('login'); logout(); }}
          className="mt-6 h-10 px-5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1.5 cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" /> Log Out
        </button>
      </StepCard>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Provisioning (workspace setup in progress)
 * ───────────────────────────────────────────────────────────────────────── */
export function ProvisioningStatus() {
  const { payload } = useOnboardingStore();
  const { logout } = useAuthStore();
  const { setScreen } = useUiStore();
  const restaurant = payload?.restaurant || {};

  const items = [
    { label: 'Payment verified', done: true },
    { label: 'Application approved', done: true },
    { label: 'Creating restaurant workspace', spinning: true },
    { label: 'Preparing settings', spinning: true },
    { label: 'Setting up your account', spinning: true },
  ];

  return (
    <div className="max-w-lg mx-auto text-center">
      <StepCard>
        <div className="w-16 h-16 rounded-full bg-[#16A34A]/10 border border-[#16A34A]/20 flex items-center justify-center mx-auto mb-4">
          <Loader2 className="w-8 h-8 animate-spin text-[#16A34A]" />
        </div>
        <h2 className="text-xl font-extrabold text-slate-800">Setting up your Restaurant POS…</h2>
        <p className="text-xs text-slate-500 mt-1">{restaurant.name || 'Your business'}</p>

        <div className="mt-6 space-y-2 text-left max-w-sm mx-auto">
          {items.map((s, i) => (
            <div key={i} className="flex items-center gap-2.5">
              {s.done ? (
                <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0" />
              ) : (
                <Loader2 className="w-4 h-4 animate-spin text-[#16A34A] shrink-0" />
              )}
              <span className="text-xs font-semibold text-slate-600">{s.label}</span>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3">
          <p className="text-[10px] font-semibold text-slate-500 leading-relaxed">
            This usually takes under a minute. The page refreshes automatically and will take you inside once ready.
          </p>
        </div>

        <button
          type="button"
          onClick={() => { setScreen('login'); logout(); }}
          className="mt-6 h-10 px-5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1.5 cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" /> Log Out
        </button>
      </StepCard>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Blocked / terminal states (REJECTED, SUSPENDED, EXPIRED)
 * ───────────────────────────────────────────────────────────────────────── */
export function BlockedStatus() {
  const { payload } = useOnboardingStore();
  const { logout } = useAuthStore();
  const { setScreen } = useUiStore();
  const status = payload?.account?.status || 'REJECTED';
  const note = payload?.restaurant?.onboardingNote;

  const meta = {
    REJECTED: {
      title: 'Application Not Approved',
      body: note || 'Your business application was not approved. Please contact support for next steps.',
      icon: XCircle,
      tone: 'text-red-500 bg-red-50 border-red-200',
    },
    MANUAL_REJECTED: {
      title: 'Application Rejected',
      body: note || 'Your business application was rejected. Please contact support for next steps.',
      icon: XCircle,
      tone: 'text-red-500 bg-red-50 border-red-200',
    },
    SUSPENDED: {
      title: 'Account Suspended',
      body: 'Your account has been suspended. Please contact support.',
      icon: ShieldAlert,
      tone: 'text-amber-500 bg-amber-50 border-amber-200',
    },
    EXPIRED: {
      title: 'Application Expired',
      body: 'Your application window has expired. Please contact support.',
      icon: Clock,
      tone: 'text-slate-500 bg-slate-50 border-slate-200',
    },
  }[status] || { title: 'Account Blocked', body: 'Please contact support.', icon: AlertTriangle, tone: 'text-red-500 bg-red-50 border-red-200' };

  const Icon = meta.icon;

  return (
    <div className="max-w-lg mx-auto text-center">
      <StepCard>
        <div className={`w-16 h-16 rounded-full border flex items-center justify-center mx-auto mb-4 ${meta.tone}`}>
          <Icon className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-extrabold text-slate-800">{meta.title}</h2>
        <p className="text-xs text-slate-500 mt-2 max-w-md mx-auto leading-relaxed">{meta.body}</p>
        {note && status !== 'REJECTED' && (
          <p className="text-[11px] text-slate-400 mt-2 font-semibold">Reason: {note}</p>
        )}
        <div className="mt-6 rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3">
          <p className="text-[10px] font-semibold text-slate-500 leading-relaxed">
            You can reach the support team for help with your application.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setScreen('login'); logout(); }}
          className="mt-6 h-10 px-5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1.5 cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" /> Log Out
        </button>
      </StepCard>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Complete / ACTIVE — enter the POS with the existing session
 * ───────────────────────────────────────────────────────────────────────── */
export function CompleteStatus() {
  const { payload } = useOnboardingStore();
  const { refreshProfile, logout } = useAuthStore();
  const { setScreen } = useUiStore();
  const { fetchSettings } = useSettingsStore();
  const restaurant = payload?.restaurant || {};
  const selectedPlan = payload?.selectedPlan || {};

  const [entering, setEntering] = useState(false);
  const [enterError, setEnterError] = useState('');

  // The applicant's JWT is a normal ADMIN token; once the restaurant is ACTIVE
  // the POS route guard accepts it. Re-fetch profile (live subscription +
  // settings) and land on the dashboard — no new auth system is invented.
  const enterPos = async () => {
    if (entering) return;
    setEntering(true);
    setEnterError('');
    try {
      const ok = await refreshProfile();
      if (!ok) throw new Error('Could not refresh your session. Please log in again.');
      await fetchSettings().catch(() => {});
      setScreen('dashboard');
    } catch (e) {
      setEnterError(e.message || 'Could not enter the POS. Please try again.');
      setEntering(false);
    }
  };

  const steps = [
    'Account Created',
    'Business Details Completed',
    'Documents Submitted',
    'Terms & Privacy Accepted',
    'Yearly Plan Selected',
    'Application Submitted',
  ];

  return (
    <div className="max-w-lg mx-auto text-center">
      <StepCard>
        <div className="w-16 h-16 rounded-full bg-[#16A34A]/10 border border-[#16A34A]/20 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-9 h-9 text-[#16A34A]" />
        </div>
        <h2 className="text-xl font-extrabold text-slate-800">Your Restaurant POS is ready!</h2>
        <p className="text-xs text-slate-500 mt-1">{payload?.account?.label || 'Active'}</p>

        <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50/70 p-5 text-left space-y-2.5">
          <div className="flex justify-between">
            <span className="text-[10px] font-bold uppercase text-slate-400">Business</span>
            <span className="text-xs font-extrabold text-slate-800">{restaurant.name || '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[10px] font-bold uppercase text-slate-400">Subscription</span>
            <span className="text-xs font-bold text-slate-700">
              {selectedPlan.name || selectedPlan.code || '—'} — Yearly
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[10px] font-bold uppercase text-slate-400">Plan Amount</span>
            <span className="text-xs font-bold text-slate-700">{selectedPlan.amount != null ? formatINR(selectedPlan.amount) : '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[10px] font-bold uppercase text-slate-400">Status</span>
            <span className="text-[10px] font-extrabold text-[#16A34A] bg-[#16A34A]/10 px-2 py-0.5 rounded-full">Active</span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-1.5 text-left">
          {steps.map((s) => (
            <div key={s} className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#16A34A] shrink-0" />
              <span className="text-[10px] font-semibold text-slate-500">{s}</span>
            </div>
          ))}
        </div>

        {enterError && (
          <div className="mt-4 flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-left">
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
            <p className="text-[10px] font-semibold text-red-600 flex-1">{enterError}</p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-2 mt-6">
          <button
            type="button"
            onClick={enterPos}
            disabled={entering}
            aria-busy={entering}
            className="h-11 rounded-xl bg-[#16A34A] hover:bg-[#15803D] disabled:opacity-60 disabled:cursor-not-allowed text-white font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm"
          >
            {entering ? <><Loader2 className="w-4 h-4 animate-spin" /> Opening your POS…</> : <><ArrowRight className="w-4 h-4" /> Enter Restaurant POS</>}
          </button>
          <button
            type="button"
            onClick={() => { setScreen('login'); logout(); }}
            disabled={entering}
            className="h-10 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold text-xs uppercase tracking-wider transition-all cursor-pointer inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <LogOut className="w-3.5 h-3.5" /> Log Out
          </button>
        </div>
      </StepCard>
    </div>
  );
}

/** Small refresh affordance used by long-running status pages. */
export function PollingHint({ refreshing, onRefresh }) {
  return (
    <div className="mt-3 text-center">
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        className="inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-400 hover:text-[#16A34A] cursor-pointer disabled:opacity-40"
      >
        <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} /> Check status now
      </button>
    </div>
  );
}
