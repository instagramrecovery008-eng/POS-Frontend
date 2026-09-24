import React, { useState } from 'react';
import { Lock, Eye, EyeOff, ArrowLeft, Building2, CreditCard, AlertTriangle } from 'lucide-react';
import { useAuthStore, useUiStore, useOnboardingStore } from '../../store';
import OnboardingShell, { Notice, StepCard } from './components/OnboardingShell';
import { Field, StepActions } from './components/controls';
import { onboardingApi } from '../../api/onboarding.api';
import { superAdminApi } from '../../api/superAdmin.api';
import { validateRegistration as validate } from './registerRules';
import { BUSINESS_TYPES, filterPlansForBusinessType } from '../../utils/businessTypes';
import { usePlans } from './hooks/usePlans';

/**
 * Manual payment registration page.
 * 
 * New simplified flow:
 * 1. User creates account (email/password)
 * 2. User fills restaurant details + selects plan
 * 3. Application submitted → MANUAL_PENDING status
 * 4. No payment during signup
 * 5. User sees application status page
 * 6. Super Admin reviews, verifies payment manually, and approves
 *    (no QR / checkout is ever generated)
 */
export default function ManualRegisterPage() {
  const { register: createAccount, error: storeError, clearError, user } = useAuthStore();
  const { setScreen } = useUiStore();
  const { loadPlans } = usePlans();
  
  const [step, setStep] = useState('account'); // 'account' | 'business' | 'submitting' | 'success'
  const [form, setForm] = useState({ 
    name: '', email: '', phone: '', password: '', confirmPassword: '',
    businessName: '', businessType: 'RESTAURANT', address: '', city: '', 
    state: 'India', pincode: '', planId: null
  });
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [applicationId, setApplicationId] = useState(null);
  const [plans, setPlans] = useState([]);
  
  const update = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
    if (formError) setFormError('');
  };
  
  // Load plans on mount (unfiltered — the server validates compatibility on
  // submit; the radio list below is scoped by the shared client-side filter).
  React.useEffect(() => {
    loadPlans().then(loaded => {
      if (loaded && loaded.length > 0) {
        setPlans(loaded);
      }
    });
  }, []);

  // When the business type changes, drop a pre-selected plan that is no longer
  // compatible (e.g. RESTAURANT default pre-selection + user picks SUPERMARKET).
  const compatiblePlans = filterPlansForBusinessType(plans, form.businessType);
  const planCompatible = compatiblePlans.some((p) => p.id === form.planId);
  React.useEffect(() => {
    if (!planCompatible && compatiblePlans.length > 0) {
      setForm((f) => (f.planId === compatiblePlans[0].id ? f : { ...f, planId: compatiblePlans[0].id }));
    }
  }, [planCompatible, compatiblePlans]);
  
  const handleAccountSubmit = async () => {
    if (submitting) return;
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
        setStep('business');
      } else {
        setFormError(storeError || 'Registration failed. Please try again.');
      }
    } catch (e) {
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
  
  const handleBusinessSubmit = async () => {
    if (submitting) return;
    
    // Validate business form
    if (!form.businessName.trim()) {
      setFormError('Business name is required');
      return;
    }
    if (!form.planId) {
      setFormError('Please select a plan');
      return;
    }
    
    setFormError('');
    setSubmitting(true);
    try {
      // Start manual payment application
      const result = await onboardingApi.startManualApplication({
        name: form.businessName.trim(),
        businessType: form.businessType,
        address: form.address.trim(),
        city: form.city.trim(),
        state: form.state,
        pincode: form.pincode.trim(),
        planId: form.planId,
      });
      
      if (result.success && result.data) {
        setApplicationId(result.data.id);
        setStep('success');
      } else {
        setFormError(result.message || 'Failed to submit application');
      }
    } catch (e) {
      setFormError(e.message || 'Failed to submit application. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };
  
  return (
    <OnboardingShell page="account">
      <div className="max-w-lg mx-auto">
        {step === 'account' && (
          <StepCard
            title="Create Your Account"
            subtitle="Set up the owner account for your business"
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
              onContinue={handleAccountSubmit}
              loading={submitting ? 'Creating account…' : false}
              continueLabel="Continue with Business Details"
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
        )}
        
        {step === 'business' && (
          <StepCard
            title="Restaurant Details"
            subtitle={`Application will be submitted for ${plans.find(p => p.id === form.planId)?.name || 'selected'} plan`}
          >
            {formError && <Notice tone="error" onClose={() => setFormError('')}>{formError}</Notice>}
            
            <div className="space-y-4">
              <Field
                name="businessName"
                label="Restaurant Name"
                placeholder="e.g. Spice Villa Restaurant"
                value={form.businessName}
                onChange={(e) => update('businessName', e.target.value)}
                error={errors.businessName}
                required
              />
              
              <Field
                name="businessType"
                label="Business Type"
                placeholder="Select type"
                value={form.businessType}
                onChange={(e) => update('businessType', e.target.value)}
                error={errors.businessType}
                required
              >
                <select
                  value={form.businessType}
                  onChange={(e) => update('businessType', e.target.value)}
                  className="w-full h-10 px-3 bg-slate-50 border border-slate-200 hover:border-slate-300 focus:border-[#16A34A] focus:bg-white rounded-xl outline-none text-xs font-semibold transition-all"
                >
                  {BUSINESS_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </Field>
              
              <Field
                name="address"
                label="Address"
                placeholder="Full address"
                value={form.address}
                onChange={(e) => update('address', e.target.value)}
                error={errors.address}
              />
              
              <div className="grid grid-cols-2 gap-4">
                <Field
                  name="city"
                  label="City"
                  placeholder="City"
                  value={form.city}
                  onChange={(e) => update('city', e.target.value)}
                  error={errors.city}
                />
                <Field
                  name="pincode"
                  label="Pincode"
                  placeholder="PIN code"
                  value={form.pincode}
                  onChange={(e) => update('pincode', e.target.value)}
                  error={errors.pincode}
                />
              </div>
              
              <div className="border-t border-slate-100 pt-4">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Select Plan *
                </label>
                <div className="mt-2 space-y-2">
                  {filterPlansForBusinessType(plans, form.businessType).map(plan => (
                    <label
                      key={plan.id}
                      className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                        form.planId === plan.id
                          ? 'border-[#16A34A] bg-[#16A34A]/5'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="planId"
                        value={plan.id}
                        checked={form.planId === plan.id}
                        onChange={(e) => update('planId', Number(e.target.value))}
                        className="w-4 h-4 text-[#16A34A] focus:ring-[#16A34A]"
                      />
                      <div className="flex-1">
                        <p className="text-xs font-bold text-slate-700">{plan.name}</p>
                        <p className="text-[10px] text-slate-500">
                          ₹{plan.yearlyPrice.toLocaleString('en-IN')} / year
                        </p>
                      </div>
                      <CreditCard className="w-4 h-4 text-slate-400" />
                    </label>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mt-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[10px] font-semibold text-amber-700">
                  No payment required now. After submission, a Super Admin will review your application and contact you with payment instructions. The restaurant activates once the Super Admin verifies your payment and approves.
                </p>
              </div>
            </div>
            
            <StepActions
              onBack={() => setStep('account')}
              onContinue={handleBusinessSubmit}
              loading={submitting ? 'Submitting application…' : false}
              continueLabel="Submit Application"
            />
          </StepCard>
        )}
        
        {step === 'success' && (
          <StepCard
            title="Application Submitted"
            subtitle="Your application is pending review"
          >
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <Building2 className="w-8 h-8 text-green-600" />
              </div>
              
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Application ID</p>
                <p className="text-lg font-extrabold text-slate-800 mt-1 font-mono">APP-{String(applicationId).padStart(4, '0')}</p>
              </div>
              
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <p className="text-sm font-bold text-slate-700">Application Status</p>
                <p className="text-[10px] text-slate-500 mt-1">
                  Your application has been submitted successfully. A Super Admin will review it and share payment instructions.
                </p>
              </div>
              
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">What's Next?</p>
                <ul className="mt-2 space-y-2 text-xs text-slate-600">
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 bg-[#16A34A]/10 rounded-full flex items-center justify-center shrink-0">1</span>
                    <span>Super Admin reviews your application</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 bg-[#16A34A]/10 rounded-full flex items-center justify-center shrink-0">2</span>
                    <span>You'll receive payment instructions from the Super Admin</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 bg-[#16A34A]/10 rounded-full flex items-center justify-center shrink-0">3</span>
                    <span>Super Admin verifies your payment manually</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 bg-[#16A34A]/10 rounded-full flex items-center justify-center shrink-0">4</span>
                    <span>Super Admin approves — your restaurant becomes active</span>
                  </li>
                </ul>
              </div>
              
              <button
                onClick={() => {
                  setScreen('login');
                  // Store application ID for status check
                  localStorage.setItem('pendingApplicationId', String(applicationId));
                }}
                className="w-full h-10 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
              >
                Go to Login
              </button>
              
              <p className="text-[10px] text-slate-400">
                You can log in to check your application status anytime.
              </p>
            </div>
          </StepCard>
        )}
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
