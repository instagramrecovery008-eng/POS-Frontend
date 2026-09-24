import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, AlertTriangle, LogOut } from 'lucide-react';
import { useAuthStore, useUiStore } from '../../store';
import OnboardingShell, { Notice } from './components/OnboardingShell';
import useOnboardingStore from './onboardingStore';
import { pageForStatus, shouldPollOnboardingStatus } from './onboarding.lib';
import BusinessStep from './steps/BusinessStep';
import DocumentsStep from './steps/DocumentsStep';
import LegalStep from './steps/LegalStep';
import PlanStep from './steps/PlanStep';
import ReviewStep from './steps/ReviewStep';
import { ReviewStatus, PendingStatus, ProvisioningStatus, CompleteStatus, BlockedStatus } from './steps/StatusPages';

// Forward-order wizard pages (Back navigation moves one step earlier). There
// is no payment step — PLAN leads to REVIEW, and SUBMIT APPLICATION freezes
// the application for manual Super Admin approval.
const ORDER = ['business', 'documents', 'legal', 'plan', 'review'];

const POLL_INTERVAL_MS = 15000;

/**
 * Onboarding wizard — a single screen whose active page is DERIVED from the
 * canonical backend payload (never from frontend state alone). This is what
 * makes resume-incomplete and direct-access protection work: an applicant
 * always lands on the correct page for their backend status, and a completed /
 * ACTIVE account can never be forced back into the wizard.
 */
export default function OnboardingFlow() {
  const { payload, error, loading, refresh } = useOnboardingStore();
  const { logout } = useAuthStore();
  const { setScreen } = useUiStore();

  const [manualPage, setManualPage] = useState(null); // user pressed Back
  const [initialLoading, setInitialLoading] = useState(!payload);

  // Fresh status on mount — resume always starts from the backend's truth.
  useEffect(() => {
    let mounted = true;
    (async () => {
      await useOnboardingStore.getState().refresh();
      // Load flow config once (business/document types, policy versions).
      useOnboardingStore.getState().loadConfig();
      if (mounted) setInitialLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  const status = payload?.account?.status || null;
  const page = useMemo(() => {
    if (!status) return null;
    const canonical = pageForStatus(status);
    if (!manualPage) return canonical;
    // A manually-viewed earlier step is only honoured while the backend has
    // not advanced beyond it (an ACTIVE/blocked account can never be forced
    // back into the wizard).
    if (ORDER.indexOf(canonical) >= 0 && ORDER.indexOf(manualPage) < ORDER.indexOf(canonical)) return manualPage;
    return canonical;
  }, [status, manualPage, payload]);

  // Clear any manual back navigation whenever the canonical page changes.
  useEffect(() => {
    setManualPage(null);
  }, [status]);

  // ── Poll ONLY while the application sits in a genuine wait state
  // (MANUAL_PENDING / MANUAL_PAYMENT_PENDING / MANUAL_PAYMENT_RECEIVED /
  // UNDER_REVIEW / PROVISIONING). A pending applicant's page updates
  // automatically when the Super Admin marks payment received or approves.
  //
  // Everything else must NEVER poll:
  //   - a rejected/blocked application (nothing is coming that a poll would
  //     reveal — the user must act or contact support),
  //   - an ACTIVE/complete application (the wizard is done; polling here is
  //     the 403-loop bug), and
  //   - after a fetch error (a 403 or network failure will not heal by
  //     re-polling — stop and let the user Retry manually).
  // The effect body (and therefore the timer) is keyed on [polling, error] so
  // any status change or error tears the interval down immediately — the
  // cleanup runs on unmount, logout, and every status transition.
  const polling = shouldPollOnboardingStatus(status);
  useEffect(() => {
    if (!polling || error) return undefined;
    const id = setInterval(() => {
      useOnboardingStore.getState().refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [polling, error]);

  const handleLogout = () => {
    useOnboardingStore.getState().clear();
    setScreen('login');
    logout();
  };

  // ── Return to Login (Part 2) ──
  // An explicit exit from the wizard: clears the local wizard state and routes
  // to the EXISTING login screen. It NEVER submits the current step — no form
  // onSubmit is involved, no API call is made, no partial data is saved beyond
  // what earlier completed steps already persisted server-side. The applicant
  // can always resume later by logging in (the backend re-derives their stage).
  const handleExitToLogin = () => {
    useOnboardingStore.getState().clear();
    setScreen('login');
    logout();
  };

  // ── First load spinner ──
  if (initialLoading || (loading && !payload && !error)) {
    return (
      <OnboardingShell page="account">
        <div className="min-h-[50vh] flex flex-col items-center justify-center text-center">
          <Loader2 className="w-8 h-8 animate-spin text-[#16A34A] mb-3" />
          <p className="text-xs font-semibold text-slate-400">Loading your application…</p>
        </div>
      </OnboardingShell>
    );
  }

  // ── Status fetch failure / no payload ──
  if (!payload) {
    return (
      <OnboardingShell page="account">
        <div className="max-w-lg mx-auto text-center">
          <div className="bg-white rounded-[20px] border border-slate-200 shadow-sm p-8">
            <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
            <h2 className="text-base font-extrabold text-slate-800">Could not load your application</h2>
            <p className="text-xs text-slate-500 mt-2 leading-relaxed">{error || 'The onboarding service did not respond. Please try again.'}</p>
            <div className="grid grid-cols-2 gap-2 mt-6">
              <button
                type="button"
                onClick={async () => { await useOnboardingStore.getState().refresh(); }}
                className="h-10 rounded-xl bg-[#16A34A] hover:bg-[#15803D] text-white text-xs font-bold uppercase tracking-wider cursor-pointer"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="h-10 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold uppercase tracking-wider inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" /> Log Out
              </button>
            </div>
          </div>
        </div>
      </OnboardingShell>
    );
  }

  // ── Back navigation: one wizard step earlier when safe ──
  const currentIdx = ORDER.indexOf(page);
  const handleBack = () => {
    if (currentIdx <= 0) return;
    setManualPage(ORDER[currentIdx - 1]);
  };

  const content = (() => {
    const done = () => setManualPage(null);
    // Pre-submission wizard steps get the explicit login exit; status screens
    // (pending/under_review/complete/blocked) already have their own controls.
    switch (page) {
      case 'business':
        return <BusinessStep onBack={handleBack} onDone={done} onExitToLogin={handleExitToLogin} />;
      case 'documents':
        return <DocumentsStep onBack={handleBack} onDone={done} onExitToLogin={handleExitToLogin} />;
      case 'legal':
        return <LegalStep onBack={handleBack} onDone={done} onExitToLogin={handleExitToLogin} />;
      case 'plan':
        return <PlanStep onBack={handleBack} onDone={done} onExitToLogin={handleExitToLogin} />;
      case 'review':
        // Interactive REVIEW step — show the full application and let the
        // applicant submit it (no payment collected).
        return <ReviewStep onBack={handleBack} onDone={done} onExitToLogin={handleExitToLogin} />;
      case 'pending':
        return <PendingStatus />;
      case 'under_review':
        return <ReviewStatus />;
      case 'provisioning':
        return <ProvisioningStatus />;
      case 'complete':
        return <CompleteStatus />;
      case 'blocked':
        return <BlockedStatus />;
      default:
        return <BusinessStep />;
    }
  })();

  return <OnboardingShell page={page} onLogout={handleLogout}>{content}</OnboardingShell>;
}
