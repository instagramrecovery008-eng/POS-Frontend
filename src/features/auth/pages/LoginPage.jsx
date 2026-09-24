import React, { useState, useEffect } from 'react';
import { useAuthStore, useUiStore, useSettingsStore } from '../../../store';
import { settingApi } from '../../../api/setting.api';
import LoginForm from '../components/LoginForm';
import { resolveHomeScreen, isSelfServeOnboarding } from '../../onboarding/onboarding.lib';
import PolicyTextModal from '../../../components/legal/PolicyTextModal';

function RestaurantLogo({ logo, restaurantName }) {
  const [imgError, setImgError] = useState(false);

  // Show initials fallback when no logo or image fails
  if (!logo || imgError) {
    const initials = (restaurantName || 'R')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map(w => w[0])
      .join('')
      .toUpperCase();
    return (
      <div className="w-14 h-14 bg-slate-100 border-2 border-slate-200 rounded-2xl flex items-center justify-center">
        <span className="text-lg font-extrabold text-slate-500">{initials || 'R'}</span>
      </div>
    );
  }

  return (
    <img
      src={logo}
      alt={restaurantName || 'Restaurant logo'}
      className="w-14 h-14 object-cover rounded-2xl border-2 border-slate-200 bg-white"
      onError={() => setImgError(true)}
      referrerPolicy="no-referrer"
    />
  );
}

export default function LoginPage() {
  const { error, clearError, user, onboarding } = useAuthStore();
  const { login, isUnlocked } = useAuthStore();
  const { setScreen, setUnlocked } = useUiStore();

  const [localError, setLocalError] = useState('');
  const [loading, setLoading] = useState(false);

  // Footer policy links (Terms & Conditions / Privacy Policy) — same shared
  // policy texts used by registration and restaurant creation.
  const [openPolicy, setOpenPolicy] = useState(null);

  // ── Restaurant branding state ──
  const [branding, setBranding] = useState({ name: null, logo: null });
  const [brandingLoaded, setBrandingLoaded] = useState(false);

  // Fetch restaurant branding on mount (public endpoint, no auth required)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await settingApi.getPublicBranding();
        if (!cancelled && data) {
          setBranding({
            name: data.restaurantName || null,
            logo: data.logo || null,
          });
        }
      } catch {
        // Silently fail — use fallback branding
      } finally {
        if (!cancelled) setBrandingLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Auto-redirect if already unlocked — self-serve applicants whose restaurant
  // is not ACTIVE go into the onboarding wizard (resume); everyone else lands
  // on their role-specific default screen.
  useEffect(() => {
    if (isUnlocked && user) {
      setScreen(resolveHomeScreen(user, onboarding));
    }
  }, [isUnlocked, user, onboarding, setScreen]);

  // Sync store error
  useEffect(() => {
    if (error) {
      setLocalError(error);
      clearError();
    }
  }, [error, clearError]);

  const handleLogin = async (userId, password) => {
    if (!userId || !password) {
      setLocalError('Please enter both User ID and Password.');
      return;
    }
    setLoading(true);
    setLocalError('');
    try {
      const email = userId.includes('@') ? userId : `${userId}@restaurant.com`;
      const success = await login(email, password);
      if (success) {
        setUnlocked(true);
        // Load the restaurant's persisted settings from the database right after
        // login so all module/visibility toggles apply immediately (requirement:
        // settings load automatically on login, no frontend-only state).
        // Self-serve applicants (restaurant not ACTIVE) cannot read POS settings
        // yet — they are routed into the onboarding wizard instead.
        if (!isSelfServeOnboarding(useAuthStore.getState().onboarding)) {
          useSettingsStore.getState().fetchSettings();
        }
        // Role-based redirect — happens in the isUnlocked useEffect above
        // after user is populated by login().
      } else {
        setLocalError('Incorrect User ID or Password. Please try again.');
      }
    } catch (e) {
      if (e.status === 500) {
        setLocalError('Unable to sign in right now. Please try again.');
      } else if (e.status === 403) {
        setLocalError(e.message || 'Your account has been disabled. Contact your administrator.');
      } else {
        setLocalError(e.message || 'Login failed. Please check your connection and try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Derived display values with safe fallbacks
  const displayName = branding.name || 'Nirka POS';
  const hasRestaurantBranding = brandingLoaded && branding.name;

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-4 select-none font-sans">
      {/* ── Platform Branding (above card) ── */}
      <div className="mb-6 flex flex-col items-center text-center animate-fade-in">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-[#16A34A] rounded-[14px] flex items-center justify-center shadow-md border border-white/20">
            <span className="text-white text-2xl font-extrabold font-serif">N</span>
          </div>
          <div className="text-left">
            <h1 className="text-2xl font-extrabold tracking-tight text-[#16A34A] uppercase leading-none">
              Nirka POS
            </h1>
            <p className="text-[10px] text-[#16A34A]/80 font-bold uppercase tracking-wider mt-1">
              Restaurant Management Platform
            </p>
          </div>
        </div>
      </div>

      {/* ── Login Card ── */}
      <div className="w-full max-w-[400px] bg-white rounded-[20px] shadow-[0_12px_40px_rgba(44,62,80,0.08)] border border-slate-200 p-6 flex flex-col gap-5">
        {/* ── Restaurant Branding inside card ── */}
        <div className="flex flex-col items-center gap-2 pb-2 border-b border-slate-100">
          {!brandingLoaded ? (
            // Skeleton while loading
            <div className="flex flex-col items-center gap-2 animate-pulse">
              <div className="w-14 h-14 bg-slate-200 rounded-2xl" />
              <div className="w-32 h-4 bg-slate-200 rounded" />
            </div>
          ) : (
            <>
              <RestaurantLogo logo={branding.logo} restaurantName={branding.name} />
              <h2 className="text-sm font-extrabold text-slate-800 uppercase tracking-wide text-center">
                {displayName}
              </h2>
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">
                Terminal Secure Login
              </p>
            </>
          )}
        </div>

        <LoginForm onSubmit={handleLogin} loading={loading} error={localError} />

        {/* ── Create New Account (self-serve onboarding) ── */}
        <div className="pt-4 border-t border-slate-100 text-center space-y-2">
          <p className="text-[10px] text-slate-400 font-semibold">Don't have an account?</p>
          <button
            type="button"
            onClick={() => { clearError(); setScreen('register'); }}
            className="w-full h-10 rounded-xl border-2 border-[#16A34A] text-[#16A34A] hover:bg-[#16A34A] hover:text-white font-extrabold text-xs uppercase tracking-wider transition-all cursor-pointer"
          >
            Create New Account
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-8 text-center space-y-2 max-w-[400px] w-full">
        <p className="text-[10px] text-slate-400 font-medium">
          &copy; 2026 Nirka POS. All rights reserved.
        </p>
        <div className="flex items-center justify-center gap-1.5 text-[10px] text-slate-400">
          <button
            type="button"
            onClick={() => setOpenPolicy('PRIVACY_POLICY')}
            className="hover:text-[#16A34A] transition-colors cursor-pointer font-medium"
          >
            Privacy Policy
          </button>
          <span className="text-slate-300">|</span>
          <button
            type="button"
            onClick={() => setOpenPolicy('TERMS_OF_SERVICE')}
            className="hover:text-[#16A34A] transition-colors cursor-pointer font-medium"
          >
            Terms of Service
          </button>
        </div>
      </div>

      {openPolicy && (
        <PolicyTextModal type={openPolicy} onClose={() => setOpenPolicy(null)} />
      )}
    </div>
  );
}
