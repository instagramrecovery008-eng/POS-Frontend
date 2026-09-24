import React, { useState } from 'react';
import { CheckCircle2, Loader2, AlertTriangle, FileText, Building2, User, CreditCard, Send } from 'lucide-react';
import { onboardingApi } from '../../../api/onboarding.api';
import useOnboardingStore from '../onboardingStore';
import { StepCard, Notice } from '../components/OnboardingShell';
import { StepActions } from '../components/controls';
import { formatINR } from '../onboarding.lib';

/**
 * Review step (step 6) — the final wizard page before SUBMIT APPLICATION.
 *
 * Shows every piece of the application the applicant has entered so far
 * (account, business, documents, legal, selected yearly plan) and lets them go
 * back to edit any step. Submitting calls POST /onboarding/submit, which
 * validates everything server-side and freezes the application at
 * MANUAL_PENDING — no payment is collected, the restaurant is NOT activated,
 * and the applicant is NOT logged into the POS. The wizard then shows the
 * pending page and the Super Admin reviews the application.
 */
export default function ReviewStep({ onBack, onDone, onExitToLogin }) {
  const { payload, config } = useOnboardingStore();
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const account = payload?.account || {};
  const user = account.user || {};
  const restaurant = payload?.restaurant || {};
  const documents = payload?.documents || [];
  const legal = payload?.legal || {};
  const plan = payload?.selectedPlan || null;

  const validDocs = documents.filter((d) => ['PENDING', 'UNDER_REVIEW', 'VERIFIED'].includes(d.status));

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setFormError('');
    try {
      const resp = await onboardingApi.submitApplication();
      if (resp && resp.success === false) {
        setFormError(resp.message || 'Could not submit your application. Please try again.');
        return;
      }
      await useOnboardingStore.getState().refresh();
      if (onDone) onDone();
      // Refreshed status → MANUAL_PENDING → the wizard shows the pending page.
    } catch (e) {
      setFormError(e.message || 'Could not submit your application. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <StepCard
        icon={CheckCircle2}
        title="Review Your Application"
        subtitle="Check every detail before submitting — you can go back and edit"
      >
        {formError && <Notice tone="error" onClose={() => setFormError('')}>{formError}</Notice>}

        {/* ── Account ── */}
        <Section icon={User} title="Account">
          <Row label="Owner / Contact" value={user.name || '—'} />
          <Row label="Email" value={user.email || '—'} />
          <Row label="Phone" value={user.phone || '—'} />
        </Section>

        {/* ── Business ── */}
        <Section icon={Building2} title="Business Details">
          <Row label="Business Name" value={restaurant.name || '—'} />
          <Row label="Business Type" value={String(restaurant.businessType || '').replace(/_/g, ' ') || '—'} />
          <Row label="Owner Name" value={restaurant.ownerName || user.name || '—'} />
          <Row label="Email" value={restaurant.email || '—'} />
          <Row label="Phone" value={restaurant.phone || '—'} />
          {(restaurant.address || restaurant.city) && (
            <Row label="Address" value={[restaurant.address, restaurant.city, restaurant.state, restaurant.country, restaurant.pincode].filter(Boolean).join(', ')} />
          )}
          {restaurant.gstNumber && <Row label="GST / Tax" value={restaurant.gstNumber} />}
          {restaurant.registrationNumber && <Row label="Registration No." value={restaurant.registrationNumber} />}
        </Section>

        {/* ── Documents ── */}
        <Section icon={FileText} title="Business Documents">
          {validDocs.length === 0 ? (
            <p className="text-[10px] font-semibold text-amber-600">No valid document uploaded yet — go back to Documents.</p>
          ) : (
            validDocs.map((d) => (
              <Row key={d.id} label={d.originalFileName || d.documentType} value={String(d.documentType || '').replace(/_/g, ' ')} />
            ))
          )}
          <p className="text-[9px] text-slate-400 mt-1">At least one valid document is required.</p>
        </Section>

        {/* ── Legal ── */}
        <Section icon={CheckCircle2} title="Legal Acceptance">
          {(legal.required || []).map((p) => (
            <Row
              key={p.type}
              label={p.label}
              value={legal[p.type === 'TERMS_OF_SERVICE' ? 'termsOfService' : p.type === 'PRIVACY_POLICY' ? 'privacyPolicy' : 'accuracyConfirmation'] ? `Accepted — v${legal[p.type === 'TERMS_OF_SERVICE' ? 'termsOfService' : p.type === 'PRIVACY_POLICY' ? 'privacyPolicy' : 'accuracyConfirmation']?.version || ''}` : 'Not accepted'}
            />
          ))}
        </Section>

        {/* ── Plan ── */}
        <Section icon={CreditCard} title="Selected Plan (Yearly)">
          {plan ? (
            <>
              <Row label="Plan" value={plan.name || plan.code || '—'} strong />
              <Row label="Billing" value="Yearly" />
              <Row label="Amount" value={`${formatINR(plan.amount != null ? plan.amount : plan.yearlyPrice)} / year`} strong />
            </>
          ) : (
            <p className="text-[10px] font-semibold text-amber-600">No plan selected yet — go back to Plan.</p>
          )}
        </Section>

        {/* ── No-payment notice ── */}
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 mt-4">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-[10px] font-semibold text-amber-700 leading-relaxed">
            No payment is collected now. After you submit, a Super Admin reviews your application and shares payment
            instructions. Your restaurant is only activated after the Super Admin verifies the payment and approves.
          </p>
        </div>
      </StepCard>

      <StepActions
        onExitToLogin={onExitToLogin}
        onBack={onBack}
        onContinue={submit}
        loading={submitting ? 'Submitting application…' : false}
        continueLabel="Submit Application"
      >
        <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold text-slate-400">
          <Send className="w-3.5 h-3.5" /> No payment required
        </span>
      </StepActions>
    </>
  );
}

function Section({ icon: Icon, title, children }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4 mt-4 first:mt-0">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-3.5 h-3.5 text-[#16A34A] shrink-0" />
        <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">{title}</h3>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ label, value, strong }) {
  return (
    <div className="flex items-start justify-between gap-3 py-0.5">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 shrink-0">{label}</span>
      <span className={`text-xs text-right break-words ${strong ? 'font-extrabold text-slate-800' : 'font-bold text-slate-600'}`}>{value || '—'}</span>
    </div>
  );
}