import React, { useState } from 'react';
import { ShieldCheck, FileText, AlertTriangle, ExternalLink, X } from 'lucide-react';
import { onboardingApi } from '../../../api/onboarding.api';
import useOnboardingStore from '../onboardingStore';
import { StepCard, Notice } from '../components/OnboardingShell';
import { StepActions } from '../components/controls';

const POLICY_CONTENT = {
  TERMS_OF_SERVICE: {
    title: 'Terms & Conditions',
    body: `Welcome to Nirka POS. These Terms & Conditions govern your use of the platform.

1. Service. Nirka POS provides cloud restaurant management software (billing, orders, kitchen display, reports) under the plan you select.
2. Your account. You are responsible for safeguarding your login credentials and for all activity under your account. Business information you provide must be accurate.
3. Subscriptions & billing. Plans are billed yearly in advance. Your workspace activates only after payment has been verified by the platform. Refunds are governed by the platform's refund policy.
4. Acceptable use. You agree not to misuse the platform, attempt unauthorised access, or interfere with other tenants.
5. Suspension. The platform may suspend or terminate access for violation of these terms, fraud, or non-payment.
6. Changes. We may update these terms from time to time; continued use after changes constitutes acceptance.`,
  },
  PRIVACY_POLICY: {
    title: 'Privacy Policy',
    body: `Your privacy matters to us.

1. Data we collect. Registration and business details, uploaded verification documents, and operational data needed to run your POS.
2. How data is used. To provide and improve the service, verify your business, process payments, and communicate with you.
3. Tenant isolation. Each restaurant's data is stored in an isolated workspace. Your business documents are never shared with other tenants.
4. Security. Documents are stored privately and are accessible only through authorised, authenticated downloads.
5. Retention & deletion. You may request export or deletion of your data in line with applicable law.
6. Contact. Reach us through the support channel provided on the platform.`,
  },
  ACCURACY_CONFIRMATION: {
    title: 'Accuracy Confirmation',
    body: `Confirmation of accuracy.

By accepting, you confirm that the business information you have submitted — including your business name, contact details, registration/GST information, and uploaded documents — is accurate and belongs to your business.

Uploaded documents may be reviewed by the platform team to verify your business before activation. If any information or document is found to be inaccurate or fraudulent, the platform may reject the application or suspend the account.`,
  },
};

/**
 * Legal Agreements step (step 4).
 *
 * Three SEPARATE acceptances are required — Terms & Conditions, Privacy
 * Policy and the accuracy confirmation. They are never combined into one
 * generic checkbox, and each accepted version is the exact version the
 * backend advertises (payload.legal.required / /onboarding/config). The
 * backend remains the source of truth for acceptance records and versions.
 */
export default function LegalStep({ onBack, onDone, onExitToLogin }) {
  const { payload, config } = useOnboardingStore();
  const legal = payload?.legal || null;

  const requiredPolicies = Array.isArray(legal?.required)
    ? legal.required
    : (config && Array.isArray(config.policies)) ? config.policies : [];

  const accepted = (type) => {
    const map = {
      TERMS_OF_SERVICE: legal?.termsOfService,
      PRIVACY_POLICY: legal?.privacyPolicy,
      ACCURACY_CONFIRMATION: legal?.accuracyConfirmation,
    };
    return !!map[type];
  };

  const [checks, setChecks] = useState(() => {
    const init = {};
    requiredPolicies.forEach((p) => { init[p.type] = accepted(p.type); });
    return init;
  });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [openPolicy, setOpenPolicy] = useState(null); // policy being read

  const allChecked = requiredPolicies.length > 0 && requiredPolicies.every((p) => checks[p.type]);

  const handleSubmit = async () => {
    if (saving) return;
    if (!allChecked) {
      setFormError('Please accept the Terms & Conditions, Privacy Policy and accuracy confirmation to continue.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const acceptances = requiredPolicies.map((p) => ({ type: p.type, version: String(p.version) }));
      const resp = await onboardingApi.acceptLegal(acceptances);
      if (resp && resp.success === false) {
        setFormError(resp.message || 'Could not record your acceptance');
        return;
      }
      await useOnboardingStore.getState().refresh();
      if (onDone) onDone();
      // Refreshed status re-derives to PLAN_PENDING → the wizard moves to Plan.
    } catch (e) {
      setFormError(e.message || 'Could not record your acceptance. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const toggle = (type) => setChecks((c) => ({ ...c, [type]: !c[type] }));

  return (
    <>
      <StepCard
        icon={ShieldCheck}
        title="Legal Agreements"
        subtitle="Review and accept the platform agreements — each is a separate confirmation"
      >
        {formError && <Notice tone="error" onClose={() => setFormError('')}>{formError}</Notice>}

        <div className="space-y-3">
          {requiredPolicies.map((p) => {
            const content = POLICY_CONTENT[p.type];
            const label = p.label || content?.title || p.type;
            return (
              <div key={p.type} className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                <div className="px-4 py-3 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-4 h-4 text-[#16A34A] shrink-0" />
                    <p className="text-xs font-extrabold text-slate-700 truncate">{label}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpenPolicy({ type: p.type, version: p.version, label })}
                    className="text-[10px] font-bold text-[#16A34A] hover:underline inline-flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    Read full {label} <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
                <div className="px-4 py-3 max-h-36 overflow-y-auto text-[11px] leading-relaxed text-slate-500 space-y-2">
                  {(content?.body || '').split('\n\n').map((para, i) => (
                    <p key={i}>{para}</p>
                  ))}
                </div>
                <label className="flex items-start gap-3 px-4 py-3 bg-white cursor-pointer hover:bg-slate-50/60 transition-colors border-t border-slate-100">
                  <input
                    type="checkbox"
                    checked={!!checks[p.type]}
                    onChange={() => toggle(p.type)}
                    className="w-4 h-4 mt-0.5 rounded accent-[#16A34A]"
                  />
                  <span className="text-[11px] font-semibold text-slate-600 leading-relaxed">
                    {p.type === 'ACCURACY_CONFIRMATION'
                      ? 'I confirm that the submitted business information and documents are accurate.'
                      : `I agree to the ${label}.`}
                    {p.version ? <span className="text-slate-400"> (Version {p.version})</span> : null}
                  </span>
                </label>
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex items-start gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
          <AlertTriangle className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
          <p className="text-[10px] font-semibold text-slate-500 leading-relaxed">
            All three confirmations above are required before you can select a yearly plan. Your acceptance is recorded with the
            exact policy version you accepted.
          </p>
        </div>
      </StepCard>

      <StepActions
        onExitToLogin={onExitToLogin}
        onBack={onBack}
        onContinue={handleSubmit}
        continueDisabled={!allChecked}
        loading={saving ? 'Saving…' : false}
        continueLabel="Accept & Continue"
      />

      {/* Policy full-text modal */}
      {openPolicy && (
        <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-3" onClick={() => setOpenPolicy(null)}>
          <div
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg max-h-[85vh] flex flex-col animate-fade-in"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
              <div>
                <h3 className="text-sm font-extrabold text-slate-800">{openPolicy.label}</h3>
                <p className="text-[10px] text-slate-400">Version {openPolicy.version}</p>
              </div>
              <button onClick={() => setOpenPolicy(null)} className="p-1.5 hover:bg-slate-100 rounded-lg cursor-pointer" aria-label="Close">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>
            <div className="px-5 py-4 overflow-y-auto text-xs leading-relaxed text-slate-600 space-y-3">
              {(POLICY_CONTENT[openPolicy.type]?.body || '').split('\n\n').map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
            <div className="px-5 py-3 border-t border-slate-100 shrink-0 flex justify-end">
              <button
                onClick={() => {
                  toggle(openPolicy.type);
                  setOpenPolicy(null);
                }}
                className="h-9 px-4 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer"
              >
                {checks[openPolicy.type] ? 'Done' : 'I Agree'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
