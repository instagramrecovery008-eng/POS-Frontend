import React, { useState } from 'react';
import { KeyRound, AlertTriangle, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import useAuthStore from '../../../store/authStore';
import { authApi } from '../../../api/auth.api';

/**
 * Forced first-login password change.
 *
 * Shown when the authenticated user still has the temporary password that was
 * emailed to them (user.mustChangePassword === true). Until they change it the
 * backend refuses every other API route (PASSWORD_CHANGE_REQUIRED), so this
 * screen is the only thing they can do. After a successful change the old
 * temporary credential stops working and the user signs in again.
 */
export default function ForceChangePasswordPage() {
  const logout = useAuthStore((s) => s.logout);
  const userName = useAuthStore((s) => s.user?.name || '');
  const userEmail = useAuthStore((s) => s.user?.email || '');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const passwordChecks = [
    { ok: newPassword.length >= 8, label: 'At least 8 characters' },
    { ok: /[A-Z]/.test(newPassword), label: 'An uppercase letter' },
    { ok: /[a-z]/.test(newPassword), label: 'A lowercase letter' },
    { ok: /\d/.test(newPassword), label: 'A number' },
    { ok: newPassword && newPassword === confirmPassword, label: 'Both entries match' },
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    if (!currentPassword) { setError('Enter the temporary password from your email.'); return; }
    if (newPassword.length < 8) { setError('New password must be at least 8 characters long.'); return; }
    if (newPassword === currentPassword) { setError('New password cannot be the same as the current password.'); return; }
    if (newPassword !== confirmPassword) { setError('Passwords do not match.'); return; }

    setBusy(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      // Password changed — the temporary credential is retired, tokens issued
      // before the change are invalidated server-side. Sign in fresh.
      logout();
      window.location.hash = '';
      window.location.reload();
    } catch (err) {
      setError(err.message || 'Could not change the password. Please try again.');
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4 select-none font-sans">
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-11 h-11 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center">
            <KeyRound className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-base font-extrabold text-slate-800">Change your password</h1>
            <p className="text-[11px] font-semibold text-slate-500">
              Security requirement — {userName || userEmail || 'your account'}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 mb-5">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-[11px] font-semibold text-amber-800 leading-relaxed">
            You are using a temporary password that was emailed to you. You must set a new
            password before you can continue. The temporary password stops working after this.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Temporary password</label>
            <div className="relative">
              <input
                type={show ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => { setCurrentPassword(e.target.value); setError(''); }}
                autoComplete="current-password"
                className="w-full h-10 rounded-xl border border-slate-300 bg-white px-3 pr-10 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#16A34A]/40"
                placeholder="From the email"
              />
              <button type="button" onClick={() => setShow((s) => !s)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1.5 uppercase tracking-wide">New password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => { setNewPassword(e.target.value); setError(''); }}
              autoComplete="new-password"
              className="w-full h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#16A34A]/40"
              placeholder="Choose a strong password"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Confirm new password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => { setConfirmPassword(e.target.value); setError(''); }}
              autoComplete="new-password"
              className="w-full h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#16A34A]/40"
              placeholder="Repeat the new password"
            />
          </div>

          <ul className="space-y-1">
            {passwordChecks.map((c) => (
              <li key={c.label} className={`flex items-center gap-1.5 text-[11px] font-semibold ${c.ok ? 'text-emerald-600' : 'text-slate-400'}`}>
                <CheckCircle2 className={`w-3.5 h-3.5 ${c.ok ? 'text-emerald-500' : 'text-slate-300'}`} />
                {c.label}
              </li>
            ))}
          </ul>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-[11px] font-bold text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full h-11 bg-[#16A34A] hover:bg-[#15803D] disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer shadow-sm"
          >
            {busy ? 'Saving…' : 'Set new password & continue'}
          </button>

          <button
            type="button"
            onClick={() => { logout(); }}
            className="w-full h-9 bg-white hover:bg-slate-50 border border-slate-200 text-slate-500 font-bold rounded-xl text-[11px] uppercase tracking-wider transition-all cursor-pointer"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
