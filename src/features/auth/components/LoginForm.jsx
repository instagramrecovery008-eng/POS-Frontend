import React, { useState } from 'react';
import { Mail, Lock, Eye, EyeOff, AlertCircle, LogIn } from 'lucide-react';
import AppInput from '../../../components/common/AppInput';
import { isValidEmail } from '../../../utils/email';

/**
 * Login credentials form.
 *
 * Presentation-only + client-side validation: the parent owns the request, the
 * loading flag and the authentication error. Field-level validation is shown
 * inline (and cleared as soon as the user edits), while authentication failures
 * surface in the alert above the fields — so a rejected password is never
 * mistaken for a formatting problem.
 *
 * Accepts either a full email or a bare user id (the parent expands a bare id
 * to `<id>@restaurant.com`), therefore the email FORMAT is only enforced when
 * the value actually contains an '@'.
 */
export default function LoginForm({ onSubmit, loading, error, rememberMe, onRememberChange }) {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [capsLock, setCapsLock] = useState(false);

  const validate = () => {
    const next = {};
    const id = userId.trim();
    if (!id) {
      next.userId = 'Email or user ID is required.';
    } else if (id.includes('@') && !isValidEmail(id)) {
      next.userId = 'Please enter a valid email address.';
    }
    if (!password) next.password = 'Password is required.';
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (loading) return;
    if (!validate()) return;
    onSubmit(userId.trim(), password, rememberMe);
  };

  /** Re-validate a single field once it has been touched by a submit attempt. */
  const revalidateField = (field, nextValue) => {
    if (!fieldErrors[field]) return;
    const next = { ...fieldErrors };
    if (field === 'userId') {
      const id = String(nextValue).trim();
      if (!id) next.userId = 'Email or user ID is required.';
      else if (id.includes('@') && !isValidEmail(id)) next.userId = 'Please enter a valid email address.';
      else delete next.userId;
    } else {
      if (!nextValue) next.password = 'Password is required.';
      else delete next.password;
    }
    setFieldErrors(next);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {/* Authentication error (server / credentials) */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 animate-shake"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
          <p className="text-[11px] font-semibold leading-relaxed text-red-700">{error}</p>
        </div>
      )}

      <AppInput
        label="Email or user ID"
        value={userId}
        onChange={(e) => {
          setUserId(e.target.value);
          revalidateField('userId', e.target.value);
        }}
        placeholder="you@yourbusiness.com"
        type="text"
        inputMode="email"
        autoComplete="username"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        disabled={loading}
        error={fieldErrors.userId}
        icon={<Mail className="h-4 w-4" />}
        className="h-11 text-sm"
      />

      <div className="space-y-1">
        <label
          htmlFor="login-password"
          className="text-[10px] font-bold uppercase tracking-wider text-slate-500"
        >
          Password
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            <Lock className="h-4 w-4" />
          </span>
          <input
            id="login-password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              revalidateField('password', e.target.value);
            }}
            onKeyUp={(e) => setCapsLock(e.getModifierState && e.getModifierState('CapsLock'))}
            onBlur={() => setCapsLock(false)}
            placeholder="Enter your password"
            autoComplete="current-password"
            disabled={loading}
            aria-invalid={!!fieldErrors.password}
            className={`h-11 w-full rounded-xl border bg-slate-50 pl-9 pr-11 text-sm font-semibold text-slate-800 outline-none transition-all placeholder:font-medium placeholder:text-slate-400 hover:border-slate-300 focus:border-[#16A34A] focus:bg-white focus:ring-2 focus:ring-[#16A34A]/20 disabled:opacity-60 ${
              fieldErrors.password ? 'border-red-300 bg-red-50 focus:border-red-500 focus:ring-red-500/20' : 'border-slate-200'
            }`}
          />
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            aria-pressed={showPassword}
            tabIndex={-1}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {fieldErrors.password ? (
          <p className="text-[10px] font-semibold text-red-600">{fieldErrors.password}</p>
        ) : capsLock ? (
          <p className="text-[10px] font-semibold text-amber-600">Caps Lock is on.</p>
        ) : null}
      </div>

      {/* Remember Me — where the session lives (localStorage vs sessionStorage);
          never extends JWT validity and never stores the password. */}
      <label
        htmlFor="remember-me"
        className="flex cursor-pointer select-none items-center gap-2.5"
      >
        <input
          id="remember-me"
          type="checkbox"
          checked={!!rememberMe}
          onChange={(e) => onRememberChange && onRememberChange(e.target.checked)}
          disabled={loading}
          className="h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 text-[#16A34A] accent-[#16A34A] focus:outline-none focus:ring-2 focus:ring-[#16A34A]/30"
        />
        <span className="text-xs font-semibold text-slate-600">Remember Me</span>
      </label>

      <button
        type="submit"
        disabled={loading}
        className="group mt-1 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#16A34A] text-sm font-bold uppercase tracking-wider text-white shadow-sm transition-all hover:bg-[#15803D] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#16A34A]/30 focus:ring-offset-1 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
      >
        {loading ? (
          <>
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Signing in…
          </>
        ) : (
          <>
            <LogIn className="h-4 w-4" />
            Log In
          </>
        )}
      </button>

      {/* Live region so screen readers announce the loading state too */}
      <span className="sr-only" aria-live="polite">
        {loading ? 'Signing in, please wait.' : ''}
      </span>
    </form>
  );
}
