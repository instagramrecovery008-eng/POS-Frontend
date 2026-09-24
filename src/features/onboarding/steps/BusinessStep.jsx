import React, { useState, useEffect, useRef } from 'react';
import { Building2, AlertTriangle, ShieldCheck, MailCheck } from 'lucide-react';
import { onboardingApi } from '../../../api/onboarding.api';
import useOnboardingStore from '../onboardingStore';
import { StepCard, Notice } from '../components/OnboardingShell';
import { Field, Select, StepActions, configLabel } from '../components/controls';

/**
 * Business Details step (step 2).
 *
 * Backend validation is authoritative (businessSchema): businessType + name +
 * phone are required; everything else (GST, registration number, website …)
 * is optional. No stricter frontend requirements are invented. Submitting
 * creates the Restaurant row the first time and re-derives the stage, so the
 * wizard advances to Documents once business details are stored.
 */
export default function BusinessStep({ onBack, onDone, onExitToLogin }) {
  const { payload, config } = useOnboardingStore();
  const restaurant = payload?.restaurant || null;
  const account = payload?.account || null;
  const user = account?.user || null;

  const [form, setForm] = useState(() => initialForm(restaurant, user));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  // ── Email verification (OTP) state ──
  // The email the backend gate checks is restaurant.email || user.email —
  // i.e. the Business Email field when filled, otherwise the account email.
  // Changing the email after verification resets the verified state (they must
  // verify the NEW address); the backend enforces the same rule.
  const accountEmail = user?.email || '';
  const gateEmailRaw = (form.email || '').trim() || accountEmail;
  const gateEmail = gateEmailRaw.toLowerCase();
  const [verification, setVerification] = useState({ email: gateEmail, verified: false, pending: false });
  const [otp, setOtp] = useState('');
  const [otpBusy, setOtpBusy] = useState(false);
  const [otpMessage, setOtpMessage] = useState('');
  const [otpError, setOtpError] = useState('');
  const [resendIn, setResendIn] = useState(0);
  const resendTimer = useRef(null);

  // Sync verification state when the email changes (email change ⇒ unverified).
  useEffect(() => {
    setVerification((v) => (v.email === gateEmail ? v : { email: gateEmail, verified: false, pending: false }));
  }, [gateEmail]);

  // Load any existing server-side verification status for this email on mount
  // (e.g. the applicant verified earlier, then refreshed the page).
  useEffect(() => {
    let cancelled = false;
    if (!gateEmail) return undefined;
    onboardingApi.emailVerificationStatus(gateEmail)
      .then((resp) => {
        if (cancelled) return;
        const data = resp && resp.data ? resp.data : resp;
        if (data && typeof data.verified === 'boolean') {
          setVerification({ email: gateEmail, verified: data.verified, pending: !!data.pending });
          if (data.resendAvailableAfterSeconds > 0) setResendIn(data.resendAvailableAfterSeconds);
        }
      })
      .catch(() => { /* status is best-effort */ });
    return () => { cancelled = true; };
  }, [gateEmail]);

  // 60s resend countdown.
  useEffect(() => {
    if (resendIn <= 0) return undefined;
    resendTimer.current = setInterval(() => {
      setResendIn((s) => {
        if (s <= 1 && resendTimer.current) clearInterval(resendTimer.current);
        return s <= 1 ? 0 : s - 1;
      });
    }, 1000);
    return () => clearInterval(resendTimer.current);
  }, [resendIn > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSendOtp = async () => {
    if (otpBusy || resendIn > 0) return;
    if (!gateEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(gateEmail)) {
      setOtpError('Enter a valid email address first.');
      return;
    }
    setOtpBusy(true);
    setOtpError('');
    setOtpMessage('');
    try {
      await onboardingApi.sendEmailOtp(gateEmail);
      setOtpMessage(`Verification code sent to ${gateEmail}. It expires in 10 minutes.`);
      setResendIn(60);
      setVerification({ email: gateEmail, verified: false, pending: true });
    } catch (e) {
      setOtpError(e.message || 'Unable to send verification email. Please try again.');
    } finally {
      setOtpBusy(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otpBusy) return;
    const code = String(otp || '').trim();
    if (!/^\d{6}$/.test(code)) {
      setOtpError('Enter the 6-digit verification code.');
      return;
    }
    setOtpBusy(true);
    setOtpError('');
    try {
      await onboardingApi.verifyEmailOtp(gateEmail, code);
      setVerification({ email: gateEmail, verified: true, pending: false });
      setOtp('');
      setOtpMessage('');
      setOtpError('');
    } catch (e) {
      setOtpError(e.message || 'Invalid verification code.');
    } finally {
      setOtpBusy(false);
    }
  };

  const set = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
    if (formError) setFormError('');
  };

  const typeLabels = configLabel(config, 'businessTypes');

  const validateForm = () => {
    const errs = {};
    if (!form.businessType) errs.businessType = 'Select a business type';
    if (!form.name || !form.name.trim()) errs.name = 'Business name is required';
    else if (form.name.trim().length < 2) errs.name = 'Business name must be at least 2 characters';
    else if (form.name.trim().length > 150) errs.name = 'Business name must be at most 150 characters';
    if (!form.phone || !form.phone.trim()) errs.phone = 'Business phone is required';
    else if (form.phone.trim().length < 6 || form.phone.trim().length > 25) errs.phone = 'Enter a valid phone number';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = 'Enter a valid business email';
    if (form.website && !/^https?:\/\/.+\..+/.test(form.website)) errs.website = 'Website must start with http(s)://';
    return errs;
  };

  const handleSubmit = async () => {
    if (saving) return;
    const errs = validateForm();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      setFormError('');
      return;
    }
    // UI convenience only — the backend gate is authoritative (HTTP 400 with
    // "Please verify your email before submitting the application.").
    if (!verification.verified) {
      setFormError('Please verify your email address before submitting.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const clean = cleanPayload(form);
      const resp = await onboardingApi.submitBusiness(clean);
      const data = resp && resp.data ? resp.data : resp;
      if (data && data.account) {
        useOnboardingStore.getState().setPayload(data);
      } else {
        await useOnboardingStore.getState().refresh();
      }
      if (onDone) onDone();
      // Stage re-derivation is backend-driven — the wizard auto-advances when
      // the refreshed status moves to Documents.
    } catch (e) {
      setFormError(e.message || 'Could not save business details');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <StepCard
        icon={Building2}
        title="Business Details"
        subtitle="Tell us about your business — this powers your restaurant workspace"
      >
        {formError && (
          <Notice tone="error" onClose={() => setFormError('')}>{formError}</Notice>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select name="businessType" label="Business Type" required value={form.businessType} error={errors.businessType}
            onChange={(e) => set('businessType', e.target.value)}>
            <option value="">Select type…</option>
            {Object.entries(typeLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>

          <Field name="businessName" label="Business Name" required placeholder="Trading name — e.g. Golden Grill"
            value={form.name} onChange={(e) => set('name', e.target.value)} error={errors.name} />

          <Field label="Legal Business Name" placeholder="Optional — registered legal entity"
            value={form.legalName || ''} onChange={(e) => set('legalName', e.target.value)} />

          <Field label="Owner / Authorized Person"
            value={form.ownerName || ''} onChange={(e) => set('ownerName', e.target.value)}
            placeholder="Optional — defaults to your name" />

          <Field label="Business Email" type="email" placeholder="business@example.com"
            value={form.email || ''} onChange={(e) => set('email', e.target.value)} error={errors.email} />

          <Field label="Business Phone" required type="tel" placeholder="+91 98765 43210"
            value={form.phone || ''} onChange={(e) => set('phone', e.target.value)} error={errors.phone} />

          {/* ── Email verification (OTP) — required before application submit ── */}
          <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <ShieldCheck className={`w-4 h-4 ${verification.verified ? 'text-emerald-600' : 'text-slate-400'}`} />
                <p className="text-[11px] font-semibold text-slate-700">
                  Email verification — {gateEmail || 'no email yet'}
                </p>
              </div>
              {verification.verified ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-0.5">
                  <MailCheck className="w-3.5 h-3.5" /> Email verified
                </span>
              ) : (
                <button type="button" onClick={handleSendOtp} disabled={otpBusy || resendIn > 0 || !gateEmail}
                  className="text-[11px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed border border-indigo-200 rounded-full px-3 py-1">
                  {resendIn > 0 ? `Resend in ${resendIn}s` : (verification.pending ? 'Resend code' : 'Send verification code')}
                </button>
              )}
            </div>

            {!verification.verified && verification.pending && (
              <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="6-digit code"
                  value={otp}
                  onChange={(e) => { setOtp(e.target.value.replace(/\D/g, '').slice(0, 6)); setOtpError(''); }}
                  className="w-36 tracking-[0.3em] text-center font-mono text-sm rounded-lg border border-slate-300 bg-white px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
                <button type="button" onClick={handleVerifyOtp} disabled={otpBusy || otp.length !== 6}
                  className="text-[11px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg px-3.5 py-1.5">
                  {otpBusy ? 'Verifying…' : 'Verify email'}
                </button>
              </div>
            )}
            {otpMessage && !verification.verified && (
              <p className="mt-2 text-[10px] font-semibold text-slate-500">{otpMessage}</p>
            )}
            {otpError && (
              <p className="mt-2 text-[10px] font-bold text-red-600">{otpError}</p>
            )}
            {!verification.verified && (
              <p className="mt-2 text-[10px] font-semibold text-slate-500 leading-relaxed">
                You must verify this email before submitting your application
                {form.email && form.email.trim().toLowerCase() !== accountEmail.toLowerCase()
                  ? ' — changing the email requires verifying the new address again.'
                  : '.'}
              </p>
            )}
          </div>

          <div className="sm:col-span-2">
            <Field label="Address" placeholder="Street, building, area"
              value={form.address || ''} onChange={(e) => set('address', e.target.value)} />
          </div>

          <Field label="City" value={form.city || ''} onChange={(e) => set('city', e.target.value)} />
          <Field label="State" value={form.state || ''} onChange={(e) => set('state', e.target.value)} />

          <Field label="Country" value={form.country || 'India'}
            onChange={(e) => set('country', e.target.value)} />

          <Field label="Postal Code" value={form.pincode || ''} onChange={(e) => set('pincode', e.target.value)} />

          <Field label="GST / Tax Number" placeholder="Optional"
            value={form.gstNumber || ''} onChange={(e) => set('gstNumber', e.target.value)} />

          <Field label="Business Registration Number" placeholder="Optional"
            value={form.registrationNumber || ''} onChange={(e) => set('registrationNumber', e.target.value)} />

          <div className="sm:col-span-2">
            <Field label="Website" placeholder="https://yourbusiness.com"
              value={form.website || ''} onChange={(e) => set('website', e.target.value)} error={errors.website} />
          </div>
        </div>

        <div className="mt-4 flex items-start gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
          <AlertTriangle className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
          <p className="text-[10px] font-semibold text-slate-500 leading-relaxed">
            Jurisdiction-specific fields such as GST and registration number are optional.
            You will upload at least one business document on the next step.
          </p>
        </div>
      </StepCard>

      <StepActions
        onExitToLogin={onExitToLogin}
        onBack={onBack}
        onContinue={handleSubmit}
        loading={saving ? 'Saving…' : false}
        continueLabel={verification.verified ? 'Save & Continue' : 'Verify email to continue'}
      />
    </>
  );
}

function initialForm(restaurant, user) {
  return {
    businessType: restaurant?.businessType || 'RESTAURANT',
    name: restaurant?.name || '',
    legalName: restaurant?.legalName || '',
    registrationNumber: restaurant?.registrationNumber || '',
    ownerName: restaurant?.ownerName || user?.name || '',
    email: restaurant?.email || user?.email || '',
    phone: restaurant?.phone || user?.phone || '',
    gstNumber: restaurant?.gstNumber || '',
    fssaiNumber: restaurant?.fssaiNumber || '',
    address: restaurant?.address || '',
    city: restaurant?.city || '',
    state: restaurant?.state || '',
    country: restaurant?.country || 'India',
    pincode: restaurant?.pincode || '',
    website: restaurant?.website || '',
    currency: restaurant?.currency || 'INR',
    timezone: restaurant?.timezone || 'Asia/Kolkata',
  };
}

/** Strip empty optional strings — the backend allows null/'' for them. */
function cleanPayload(form) {
  const out = { ...form };
  ['legalName', 'registrationNumber', 'ownerName', 'email', 'gstNumber',
    'fssaiNumber', 'address', 'city', 'state', 'pincode', 'website', 'currency', 'timezone'].forEach((k) => {
    if (out[k] == null || String(out[k]).trim() === '') out[k] = null;
  });
  out.name = String(out.name || '').trim();
  out.phone = String(out.phone || '').trim();
  out.ownerName = out.ownerName || undefined;
  return out;
}
