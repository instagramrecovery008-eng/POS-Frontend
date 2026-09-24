import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Lock,
  Eye,
  EyeOff,
  LogOut,
  X,
  Clock,
  Shield,
  AlertTriangle,
  Loader2,
  ChevronLeft,
  Key,
  User,
  Mail,
} from 'lucide-react';
import { useAuthStore, useSettingsStore, useUiStore, useCartStore } from '../../../store';
import { getRoleDisplayName } from '../../../utils/permissions';

// ─── Lockout Banner ─────────────────────────────────────────────────────────
function LockoutBanner({ remaining }) {
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center space-y-2 animate-slide-up">
      <div className="flex items-center justify-center gap-2">
        <Shield className="w-5 h-5 text-red-500" />
        <span className="text-sm font-extrabold text-red-700">Terminal Locked</span>
      </div>
      <p className="text-xs font-semibold text-red-600">
        Too many failed unlock attempts.
      </p>
      <p className="text-lg font-extrabold text-red-700 tabular-nums">
        {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
      </p>
      <p className="text-[10px] font-medium text-red-500">
        Please wait before trying again
      </p>
    </div>
  );
}

// ─── Email + Password Auth Component ────────────────────────────────────────
function CredentialsAuth({ onBack, loading, error, onSubmit }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const emailRef = useRef(null);

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  const handleSubmit = (e) => {
    e && e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    onSubmit(email.trim(), password);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Email Input */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-bold uppercase text-[#16A34A] tracking-wider">
          Email
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            <Mail className="w-4 h-4" />
          </span>
          <input
            ref={emailRef}
            type="text"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email"
            autoComplete="email"
            disabled={loading}
            className={`w-full h-12 pl-9 pr-3 text-sm font-medium rounded-xl border-2 outline-none transition-all ${
              error
                ? 'border-red-300 bg-red-50 text-red-700 placeholder-red-300'
                : 'border-slate-200 bg-slate-50 text-slate-800 placeholder-slate-400 focus:border-[#16A34A] focus:bg-[#F0FDF4]'
            } disabled:opacity-50`}
          />
        </div>
      </div>

      {/* Password Input */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-bold uppercase text-[#16A34A] tracking-wider">
          Password
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            <Lock className="w-4 h-4" />
          </span>
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            autoComplete="current-password"
            disabled={loading}
            className={`w-full h-12 pl-9 pr-12 text-sm font-medium rounded-xl border-2 outline-none transition-all ${
              error
                ? 'border-red-300 bg-red-50 text-red-700 placeholder-red-300'
                : 'border-slate-200 bg-slate-50 text-slate-800 placeholder-slate-400 focus:border-[#16A34A] focus:bg-[#F0FDF4]'
            } disabled:opacity-50`}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
            tabIndex={-1}
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-red-600 bg-red-50 rounded-lg py-2 px-3 animate-shake">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={!email.trim() || !password.trim() || loading}
        className="w-full h-11 rounded-xl bg-[#16A34A] hover:bg-[#15803D] disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Verifying...
          </>
        ) : (
          <>
            <Key className="w-4 h-4" />
            Unlock
          </>
        )}
      </button>

      {/* Cancel */}
      <div className="text-center">
        <button
          type="button"
          onClick={onBack}
          disabled={loading}
          className="text-xs font-semibold text-slate-400 hover:text-slate-600 transition-colors cursor-pointer disabled:opacity-40"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Main LockScreen Component ──────────────────────────────────────────────
export default function LockScreen() {
  const { user, logout, verifyPassword, unlockTerminal, failedUnlockAttempts, isLockedOut, getLockoutRemaining } = useAuthStore();
  const { settings } = useSettingsStore();
  const { setScreen } = useUiStore();
  const { setOrders } = useCartStore();
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [lockoutRemaining, setLockoutRemaining] = useState(0);

  // Update clock every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Update lockout countdown
  useEffect(() => {
    if (!isLockedOut()) return;
    const timer = setInterval(() => {
      const remaining = getLockoutRemaining();
      setLockoutRemaining(remaining);
      if (remaining <= 0) {
        clearInterval(timer);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [isLockedOut, getLockoutRemaining]);

  const formatDate = (date) => {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
  };

  const formatTime = (date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  };

  const handleUnlockClick = () => {
    setShowAuthDialog(true);
    setAuthError('');
  };

  const handleCredentialsSubmit = async (email, password) => {
    setAuthLoading(true);
    setAuthError('');
    try {
      const result = await verifyPassword(password);
      if (result.success) {
        unlockTerminal();
        setShowAuthDialog(false);
        setAuthError('');
      } else {
        setAuthError(result.message);
        if (isLockedOut()) {
          setLockoutRemaining(getLockoutRemaining());
        }
      }
    } catch (e) {
      setAuthError('Verification failed. Please try again.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleAuthBack = () => {
    setShowAuthDialog(false);
    setAuthError('');
  };

  const handleLogout = () => {
    setScreen('login');
    logout();
    setOrders([]);
  };

  // Format role for display — centralized utility (WAITER → Service Staff)
  const formatRole = (role) => getRoleDisplayName(role) || 'Staff';

  // Get user initials
  const getInitials = () => {
    if (user?.initials) return user.initials;
    if (user?.name) {
      const parts = user.name.split(' ');
      return parts.map(p => p[0]).join('').toUpperCase().slice(0, 2);
    }
    if (user?.firstName) {
      return (user.firstName[0] + (user.lastName?.[0] || '')).toUpperCase();
    }
    return 'U';
  };

  // Get user full name
  const getFullName = () => {
    if (user?.name) return user.name;
    if (user?.firstName) return `${user.firstName} ${user.lastName || ''}`.trim();
    return 'User';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0F172A] via-[#1E293B] to-[#0F172A] flex items-center justify-center p-4 select-none font-sans relative overflow-hidden">
      {/* Animated background grid */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(22,163,74,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(22,163,74,0.03)_1px,transparent_1px)] bg-[size:40px_40px]" />

      {/* Ambient glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-[#16A34A]/5 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 translate-y-1/2 w-80 h-80 bg-[#16A34A]/3 rounded-full blur-3xl" />

      <div className="relative z-10 w-full max-w-sm">
        {/* ── Branding Section ── */}
        <div className="text-center mb-8 animate-fade-in">
          <div className="flex items-center justify-center mb-4">
            {settings.branding.logo ? (
              <img
                src={settings.branding.logo}
                alt="Logo"
                className="w-16 h-16 rounded-[18px] object-cover shadow-lg border border-white/10"
              />
            ) : (
              <div className="w-16 h-16 bg-gradient-to-br from-[#16A34A] to-[#15803D] rounded-[18px] flex items-center justify-center shadow-lg border border-white/10">
                <Lock className="w-8 h-8 text-white" />
              </div>
            )}
          </div>
          <h1 className="text-lg font-extrabold text-white tracking-tight">
            Nirka POS
          </h1>
          <p className="text-[10px] font-semibold text-slate-400 mt-1 uppercase tracking-widest">
            Terminal Locked
          </p>
        </div>

        {/* ── Lock Card ── */}
        {!showAuthDialog ? (
          <div className="bg-white/5 backdrop-blur-xl rounded-[22px] border border-white/10 p-6 space-y-6 animate-slide-up shadow-2xl">
            {/* User Info */}
            <div className="flex items-center gap-4 pb-4 border-b border-white/10">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#16A34A] to-[#15803D] text-white border-2 border-[#16A34A]/30 flex items-center justify-center font-extrabold text-sm shrink-0 shadow-lg">
                {getInitials()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-extrabold text-white truncate">
                  {getFullName()}
                </p>
                <p className="text-[10px] font-bold text-[#16A34A] uppercase tracking-wider">
                  {formatRole(user?.role)}
                </p>
              </div>
            </div>

            {/* Date & Time */}
            <div className="text-center space-y-1">
              <div className="flex items-center justify-center gap-2 text-slate-400">
                <Clock className="w-4 h-4" />
                <span className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight tabular-nums">
                  {formatTime(currentTime)}
                </span>
              </div>
              <p className="text-[11px] font-medium text-slate-500">
                {formatDate(currentTime)}
              </p>
            </div>

            {/* Lockout Banner */}
            {isLockedOut() && (
              <LockoutBanner remaining={lockoutRemaining || getLockoutRemaining()} />
            )}

            {/* Unlock Button */}
            {!isLockedOut() && (
              <button
                onClick={handleUnlockClick}
                className="w-full h-12 rounded-xl bg-gradient-to-r from-[#16A34A] to-[#15803D] hover:from-[#15803D] hover:to-[#166534] text-white font-bold text-sm transition-all shadow-lg hover:shadow-[#16A34A]/25 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Key className="w-4 h-4" />
                Tap to Unlock
              </button>
            )}

            {/* Failed attempts indicator */}
            {failedUnlockAttempts > 0 && !isLockedOut() && (
              <p className="text-[10px] font-medium text-amber-400/70 text-center">
                {failedUnlockAttempts} failed attempt{failedUnlockAttempts !== 1 ? 's' : ''}
              </p>
            )}

            {/* Logout */}
            <div className="flex items-center justify-center pt-2 border-t border-white/10">
              {showLogoutConfirm ? (
                <div className="flex gap-2 w-full">
                  <button
                    onClick={() => setShowLogoutConfirm(false)}
                    className="flex-1 h-9 text-[10px] font-bold border border-white/20 text-slate-400 rounded-lg hover:bg-white/5 transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleLogout}
                    className="flex-1 h-9 text-[10px] font-bold bg-red-500/80 hover:bg-red-500 text-white rounded-lg transition-all cursor-pointer"
                  >
                    Confirm Logout
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowLogoutConfirm(true)}
                  className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500 hover:text-red-400 transition-colors cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign Out
                </button>
              )}
            </div>
          </div>
        ) : (
          /* ── Authentication Dialog ── */
          <div className="bg-white/5 backdrop-blur-xl rounded-[22px] border border-white/10 p-6 animate-slide-up shadow-2xl">
            {/* Dialog Header */}
            <div className="flex items-center justify-between mb-5 pb-4 border-b border-white/10">
              <button
                onClick={handleAuthBack}
                className="flex items-center gap-1 text-[10px] font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-[#16A34A]/20 border border-[#16A34A]/30 flex items-center justify-center">
                  <Key className="w-4 h-4 text-[#16A34A]" />
                </div>
                <span className="text-xs font-bold text-white">
                  Enter Credentials
                </span>
              </div>
              <button
                onClick={handleAuthBack}
                className="p-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Email + Password Auth */}
            <CredentialsAuth
              onBack={handleAuthBack}
              loading={authLoading}
              error={authError}
              onSubmit={handleCredentialsSubmit}
            />
          </div>
        )}

        {/* Footer hint */}
        {!showAuthDialog && !isLockedOut() && (
          <p className="text-[9px] text-slate-600 text-center mt-4 font-medium">
            POS is locked. Authentication required to continue.
          </p>
        )}
      </div>
    </div>
  );
}
