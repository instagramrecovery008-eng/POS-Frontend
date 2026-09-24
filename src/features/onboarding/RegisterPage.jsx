import React, { useState } from 'react';
import { Lock, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { useAuthStore, useUiStore } from '../../store';
import OnboardingShell, { Notice, StepCard } from './components/OnboardingShell';
import { Field, StepActions } from './components/controls';
import { validateRegistration as validate } from './registerRules';

/**
 * Public self-service registration (step 1 — Account).
 *
 * Shown pre-auth when the applicant clicks “Create New Account” on the login
 * screen. On success the backend returns a token + REGISTERED onboarding
 * payload and the app routes into the onboarding wizard (Business step).
 * Duplicate submissions are blocked, and backend duplicate-email/phone errors
 * are surfaced verbatim.
 */
export default function RegisterPage() {
  const { register: createAccount, error: storeError, clearError } = useAuthStore();
  const { setScreen } = useUiStore();

  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', confirmPassword: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const update = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
    if (formError) setFormError('');
  };

  const handleSubmit = async () => {
    if (submitting) return; // prevent duplicate submissions
    const validation = validate(form);
    if (Object.keys(validation).length > 0) {
      setErrors(validation);
      return;
    }
    clearError();
    setErrors({});
    setFormError('');
    setSubmitting(true);
    try {
      const ok = await createAccount({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim(),
        password: form.password,
        confirmPassword: form.confirmPassword,
      });
      if (ok) {
        // The new account is REGISTERED → the wizard takes over at Business.
        // (POS settings are not fetched here — the restaurant is not ACTIVE
        // yet and settings require an active tenant.)
        setScreen('onboarding');
      } else {
        setFormError(storeError || 'Registration failed. Please try again.');
      }
    } catch (e) {
      // Backend duplicate-email / duplicate-phone / validation errors.
      const msg = e.message || 'Registration failed. Please try again.';
      const next = {};
      if (/email/i.test(msg)) next.email = msg;
      else if (/phone/i.test(msg)) next.phone = msg;
      if (Object.keys(next).length > 0) setErrors(next);
      else setFormError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <OnboardingShell page="account">
      <div className="max-w-lg mx-auto">
        <StepCard
          title="Create Your Account"
          subtitle="Set up the owner account for your business — continue with business details next"
        >
          {formError && <Notice tone="error" onClose={() => setFormError('')}>{formError}</Notice>}

          <div className="space-y-4">
            <Field
              name="ownerName"
              label="Owner / Contact Person Name"
              placeholder="e.g. Rahul Sharma"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              error={errors.name}
              required
              autoComplete="name"
            />

            <Field
              name="email"
              label="Email"
              type="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
              error={errors.email}
              required
              autoComplete="email"
            />

            <Field
              name="phone"
              label="Phone"
              type="tel"
              placeholder="+91 98765 43210"
              value={form.phone}
              onChange={(e) => update('phone', e.target.value)}
              error={errors.phone}
              required
              autoComplete="tel"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <PasswordField
                name="password"
                label="Password"
                placeholder="Enter password"
                value={form.password}
                error={errors.password}
                show={showPassword}
                onToggle={() => setShowPassword((v) => !v)}
                onChange={(v) => update('password', v)}
                autoComplete="new-password"
              />
              <PasswordField
                name="confirmPassword"
                label="Confirm Password"
                placeholder="Re-enter password"
                value={form.confirmPassword}
                error={errors.confirmPassword}
                show={showPassword}
                onToggle={() => setShowPassword((v) => !v)}
                onChange={(v) => update('confirmPassword', v)}
                autoComplete="new-password"
              />
            </div>
          </div>

          <StepActions
            onBack={() => setScreen('login')}
            onContinue={handleSubmit}
            loading={submitting ? 'Creating account…' : false}
            continueLabel="Create New Account"
          />

          <p className="mt-4 text-center text-[10px] text-slate-400">
            Already have an account?{' '}
            <button
              type="button"
              onClick={() => setScreen('login')}
              className="text-[#16A34A] font-bold hover:underline cursor-pointer inline-flex items-center gap-1"
            >
              <ArrowLeft className="w-3 h-3" /> Log in
            </button>
          </p>
        </StepCard>
      </div>
    </OnboardingShell>
  );
}

/** Password input with visibility toggle. */
function PasswordField({ name, label, value, placeholder, error, onChange, show, onToggle, autoComplete }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
        {label} <span className="text-red-500">*</span>
      </label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
          <Lock className="w-4 h-4" />
        </span>
        <input
          name={name}
          type={show ? 'text' : 'password'}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          className={`w-full h-10 pl-9 pr-10 bg-slate-50 border border-slate-200 hover:border-slate-300 focus:border-[#16A34A] focus:bg-white rounded-xl outline-none text-xs font-semibold transition-all ${error ? 'border-red-300 focus:border-red-500 bg-red-50' : ''}`}
        />
        <button
          type="button"
          onClick={onToggle}
          tabIndex={-1}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
          aria-label={show ? 'Hide password' : 'Show password'}
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      {error && <p className="text-[10px] font-semibold text-red-600">{error}</p>}
    </div>
  );
}

/**
 * Client-side validation lives in registerRules.js (pure module) so the node
 * test runner can exercise it directly. The backend validator remains
 * authoritative.
 */
export { validateRegistration as validate } from './registerRules';
