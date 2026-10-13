import React, { useEffect, useState } from 'react';
import { KeyRound, Loader2, CheckCircle2, AlertTriangle, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { authApi } from '../../../api/auth.api';

/**
 * Secure password SETUP (public, pre-auth).
 *
 * Opened from the single-use link in an account-ready / password-reset email
 * (`?page=set-password&email=…&token=…`). The user chooses their own password;
 * no credential is ever emailed or typed on their behalf. The token is verified
 * and consumed server-side.
 */

/** Parse the setup link's query params. Returns null when this is not a setup link. */
export function getPasswordSetupParams() {
  if (typeof window === 'undefined') return null;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('page') !== 'set-password') return null;
    const email = (params.get('email') || '').trim();
    const token = (params.get('token') || '').trim();
    if (!email || !token) return null;
    return { email, token };
  } catch (_) {
    return null;
  }
}

export default function SetPasswordPage({ email, token, onDone }) {
  const [phase, setPhase] = useState('checking'); // checking | ready | invalid | success
  const [account, setAccount] = useState({ email, name: '' });
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Pre-flight: confirm the link is still valid and learn whose account it is.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await authApi.validatePasswordSetup(email, token);
        if (cancelled) return;
        if (resp && resp.valid) {
          setAccount({ email: resp.email || email, name: resp.name || '' });
          setPhase('ready');
        } else {
          setPhase('invalid');
        }
      } catch (_) {
        if (!cancelled) setPhase('invalid');
      }
    })();
    return () => { cancelled = true; };
  }, [email, token]);

  const checks = [
    { ok: password.length >= 8, label: 'At least 8 characters' },
    { ok: /[A-Z]/.test(password), label: 'An uppercase letter' },
    { ok: /[a-z]/.test(password), label: 'A lowercase letter' },
    { ok: /\d/.test(password), label: 'A number' },
    { ok: !!password && password === confirm, label: 'Both entries match' },
  ];

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (busy) return;
    setError('');
    if (password.length < 8) { setError('Password must be at least 8 characters long.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setBusy(true);
    try {
      await authApi.setupPassword(email, token, password);
      setPhase('success');
    } catch (err) {
      setError(err?.message || 'Could not set your password. Please request a new link.');
      if (err?.status === 400) setPhase('invalid');
      setBusy(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#F8FAFC] flex flex-col items-center justify-center px-4 py-6 pt-safe pb-safe font-sans">
      {/* Platform branding */}
      <div className="mb-5 flex items-center gap-2.5">
        <img src="/klargo-icon.png" alt="KlarGo" className="w-11 h-11 rounded-[12px] object-cover bg-white border border-slate-200 shadow-sm" />
        <div className="text-left">
          <h1 className="text-lg font-extrabold tracking-tight text-[#16A34A] uppercase leading-none">KlarGo POS</h1>
          <p className="text-[10px] text-[#16A34A]/80 font-bold uppercase tracking-wider mt-1">By Infinixo Technologies</p>
        </div>
      </div>

      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        {phase === 'checking' && (
          <div className="py-10 text-center">
            <Loader2 className="w-7 h-7 animate-spin text-[#16A34A] mx-auto mb-3" />
            <p className="text-xs font-semibold text-slate-400">Checking your secure link…</p>
          </div>
        )}

        {phase === 'invalid' && (
          <div className="text-center">
            <div className="w-14 h-14 rounded-full bg-red-50 border border-red-200 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-7 h-7 text-red-500" />
            </div>
            <h2 className="text-base font-extrabold text-slate-800">This link is no longer valid</h2>
            <p className="text-xs text-slate-500 mt-2 leading-relaxed">
              The password setup link has expired or was already used. Ask your administrator to send a new one, or
              sign in with the password you already know.
            </p>
            <button
              type="button"
              onClick={onDone}
              className="mt-6 w-full h-11 rounded-xl bg-[#16A34A] hover:bg-[#15803D] text-white font-extrabold text-xs uppercase tracking-wider transition-all cursor-pointer inline-flex items-center justify-center gap-2"
            >
              <ArrowRight className="w-4 h-4" /> Go to Login
            </button>
          </div>
        )}

        {phase === 'ready' && (
          <>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-11 h-11 rounded-xl bg-[#16A34A]/10 border border-[#16A34A]/20 flex items-center justify-center shrink-0">
                <KeyRound className="w-5 h-5 text-[#16A34A]" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-extrabold text-slate-800">Set your password</h2>
                <p className="text-[11px] font-semibold text-slate-500 truncate">
                  {account.name ? `${account.name} · ` : ''}{account.email || email}
                </p>
              </div>
            </div>

            <p className="text-[11px] font-semibold text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 mb-4 leading-relaxed">
              Choose a strong password for your KlarGo POS account. For your security, this link works once and expires
              shortly — we never send passwords by email.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1.5 uppercase tracking-wide">New password</label>
                <div className="relative">
                  <input
                    type={show ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(''); }}
                    autoComplete="new-password"
                    className="w-full h-11 rounded-xl border border-slate-300 bg-white px-3 pr-11 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#16A34A]/40"
                    placeholder="Choose a strong password"
                  />
                  <button
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    aria-label={show ? 'Hide password' : 'Show password'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                  >
                    {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Confirm new password</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => { setConfirm(e.target.value); setError(''); }}
                  autoComplete="new-password"
                  className="w-full h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#16A34A]/40"
                  placeholder="Repeat the new password"
                />
              </div>

              <ul className="space-y-1.5 py-1">
                {checks.map((c) => (
                  <li key={c.label} className={`flex items-center gap-2 text-[11px] font-semibold ${c.ok ? 'text-emerald-600' : 'text-slate-400'}`}>
                    <CheckCircle2 className={`w-3.5 h-3.5 ${c.ok ? 'text-emerald-500' : 'text-slate-300'}`} />
                    {c.label}
                  </li>
                ))}
              </ul>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-[11px] font-bold text-red-700">{error}</div>
              )}

              <button
                type="submit"
                disabled={busy}
                className="w-full h-11 bg-[#16A34A] hover:bg-[#15803D] disabled:opacity-60 disabled:cursor-not-allowed text-white font-extrabold rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer shadow-sm inline-flex items-center justify-center gap-2"
              >
                {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : 'Set password & continue'}
              </button>

              <button
                type="button"
                onClick={onDone}
                className="w-full h-10 bg-white hover:bg-slate-50 border border-slate-200 text-slate-500 font-bold rounded-xl text-[11px] uppercase tracking-wider transition-all cursor-pointer"
              >
                Back to login
              </button>
            </form>
          </>
        )}

        {phase === 'success' && (
          <div className="text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-[#16A34A]" />
            </div>
            <h2 className="text-base font-extrabold text-slate-800">Your password is set</h2>
            <p className="text-xs text-slate-500 mt-2 leading-relaxed">
              You can now sign in to KlarGo POS with your email and the new password.
            </p>
            <button
              type="button"
              onClick={onDone}
              className="mt-6 w-full h-11 rounded-xl bg-[#16A34A] hover:bg-[#15803D] text-white font-extrabold text-xs uppercase tracking-wider transition-all cursor-pointer inline-flex items-center justify-center gap-2"
            >
              <ArrowRight className="w-4 h-4" /> Go to Login
            </button>
          </div>
        )}
      </div>

      <p className="mt-6 text-[10px] text-slate-400 font-medium text-center">
        &copy; 2026 Infinixo Technologies. All rights reserved.
      </p>
    </div>
  );
}
