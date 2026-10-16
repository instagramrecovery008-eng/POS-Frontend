import React, { useState, useEffect } from 'react';
import {
  ShieldCheck, LayoutGrid, ChefHat, BarChart3, ArrowRight,
  Lock, UserRound, Store,
} from 'lucide-react';
import { useAuthStore, useUiStore, useSettingsStore } from '../../../store';
import { settingApi } from '../../../api/setting.api';
import LoginForm from '../components/LoginForm';
import { resolveHomeScreen, isSelfServeOnboarding } from '../../onboarding/onboarding.lib';
import PolicyTextModal from '../../../components/legal/PolicyTextModal';

// Bundled KlarGo logo — used until a restaurant uploads its own via Settings.
const DEFAULT_LOGO = '/klargo-logo.png';
const PLATFORM_MARK = '/klargo-icon.png';

// What the POS does — shown on the desktop brand panel (visual hierarchy, not
// decoration for its own sake: it tells a first-time user what they are signing
// into). Icons come from the same icon set as the rest of the app.
const BRAND_POINTS = [
  { icon: LayoutGrid, label: 'Floors & tables in real time' },
  { icon: ChefHat, label: 'Kitchen tickets the moment an order lands' },
  { icon: BarChart3, label: 'Sales, stock and staff in one place' },
];

/**
 * Tenant logo mark on the login card.
 *  - A configured logo is shown CONTAINED inside a fixed square shell, so any
 *    aspect ratio is displayed undistorted and can never shift the layout.
 *  - A missing or FAILED source falls back to the restaurant's initials — never
 *    the browser's broken-image glyph.
 */
function RestaurantLogo({ logo, restaurantName }) {
  const [imgError, setImgError] = useState(false);
  const src = logo || DEFAULT_LOGO;

  // A new source always gets a fresh chance to load.
  useEffect(() => { setImgError(false); }, [src]);

  if (!src || imgError) {
    const initials = (restaurantName || 'R')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase();
    return (
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-200 bg-slate-100">
        <span className="text-lg font-extrabold text-slate-500">{initials || 'R'}</span>
      </div>
    );
  }

  return (
    <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <img
        src={src}
        alt={restaurantName || 'Restaurant logo'}
        className="h-full w-full object-contain p-1.5"
        onError={() => setImgError(true)}
        referrerPolicy="no-referrer"
      />
    </div>
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
  const displayName = branding.name || 'KlarGo POS';
  const hasRestaurantBranding = brandingLoaded && branding.name;

  const handleCreateAccount = () => {
    clearError();
    setLocalError('');
    setScreen('register');
  };

  // ── Shared platform wordmark (brand panel on desktop, header on mobile) ──
  const platformMark = (
    <div className="flex items-center gap-3">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white shadow-md ring-1 ring-black/5">
        <img src={PLATFORM_MARK} alt="KlarGo" className="h-8 w-8 object-contain" />
      </span>
      <div className="min-w-0">
        <p className="text-lg font-extrabold uppercase leading-none tracking-tight text-[#16A34A] lg:text-white">
          KlarGo POS
        </p>
        <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#16A34A]/70 lg:text-white/70">
          By Infinixo Technologies
        </p>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen w-full flex-col bg-[#F8FAFC] select-none font-sans lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:bg-white">
      {/* ── Brand panel (desktop / tablet-landscape) ── */}
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-[#0B3D24] via-[#15803D] to-[#22C55E] p-10 lg:flex lg:flex-col lg:justify-between xl:p-14">
        {/* Soft depth — decorative only, never intercepts pointer events */}
        <div className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-36 -left-24 h-96 w-96 rounded-full bg-black/15 blur-3xl" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-white/10" />

        <div className="relative">{platformMark}</div>

        <div className="relative max-w-md space-y-5">
          <h2 className="text-3xl font-extrabold leading-tight text-white xl:text-4xl">
            Your restaurant floor,
            <br />
            running in real time.
          </h2>
          <p className="text-sm font-medium leading-relaxed text-white/80">
            One fast, reliable terminal for orders, tables, kitchen tickets and billing —
            built for service hours that never slow down.
          </p>
          <ul className="space-y-3 pt-1">
            {BRAND_POINTS.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20">
                  <Icon className="h-4 w-4 text-white" />
                </span>
                <span className="text-xs font-semibold text-white/90">{label}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-white/60">
          <ShieldCheck className="h-4 w-4" />
          Secure session · Isolated restaurant data
        </div>
      </aside>

      {/* ── Sign-in column ── */}
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-8 sm:px-6 lg:px-10 lg:py-12 pt-safe pb-safe">
        <div className="w-full max-w-[420px] animate-fade-in">
          {/* Mobile / tablet brand header (the panel above is desktop-only) */}
          <div className="mb-6 flex justify-center lg:hidden">{platformMark}</div>

          <div className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_20px_50px_-24px_rgba(15,23,42,0.35)] sm:p-7">
            {/* ── Restaurant branding (this tenant) ── */}
            <div className="flex flex-col items-center gap-3 border-b border-slate-100 pb-5">
              {!brandingLoaded ? (
                <div className="flex flex-col items-center gap-3 animate-pulse">
                  <div className="h-16 w-16 rounded-2xl bg-slate-200" />
                  <div className="h-4 w-36 rounded bg-slate-200" />
                  <div className="h-3 w-24 rounded bg-slate-100" />
                </div>
              ) : (
                <>
                  <RestaurantLogo logo={branding.logo} restaurantName={branding.name} />
                  <div className="space-y-1.5 text-center">
                    <h1 className="text-base font-extrabold tracking-tight text-slate-800">
                      {displayName}
                    </h1>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#16A34A]/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-[#15803D]">
                      <Lock className="h-3 w-3" />
                      Terminal secure login
                    </span>
                    {!hasRestaurantBranding && (
                      <p className="text-[10px] font-medium text-slate-400">
                        Sign in to your POS workspace
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* ── Credentials ── */}
            <div className="pt-5">
              <LoginForm onSubmit={handleLogin} loading={loading} error={localError} />
            </div>

            {/* ── Secondary action: self-serve registration ── */}
            <div className="mt-6 border-t border-slate-100 pt-5">
              <p className="flex items-center justify-center gap-1.5 text-[11px] font-medium text-slate-500">
                <Store className="h-3.5 w-3.5 text-slate-400" />
                Don't have an account?
              </p>
              <button
                type="button"
                onClick={handleCreateAccount}
                disabled={loading}
                className="group mt-2.5 flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-[#16A34A]/40 bg-[#16A34A]/5 text-xs font-bold uppercase tracking-wider text-[#15803D] transition-all hover:border-[#16A34A] hover:bg-[#16A34A] hover:text-white focus:outline-none focus:ring-2 focus:ring-[#16A34A]/30 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
              >
                <UserRound className="h-4 w-4" />
                Create New Account
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>
          </div>

          {/* ── Footer ── */}
          <div className="mt-6 space-y-2 text-center">
            <p className="text-[10px] font-medium text-slate-400">
              &copy; 2026 Infinixo Technologies. All rights reserved.
            </p>
            <div className="flex items-center justify-center gap-1.5 text-[10px] text-slate-400">
              <button
                type="button"
                onClick={() => setOpenPolicy('PRIVACY_POLICY')}
                className="font-medium transition-colors hover:text-[#16A34A] cursor-pointer"
              >
                Privacy Policy
              </button>
              <span className="text-slate-300">|</span>
              <button
                type="button"
                onClick={() => setOpenPolicy('TERMS_OF_SERVICE')}
                className="font-medium transition-colors hover:text-[#16A34A] cursor-pointer"
              >
                Terms of Service
              </button>
            </div>
          </div>
        </div>
      </main>

      {openPolicy && (
        <PolicyTextModal type={openPolicy} onClose={() => setOpenPolicy(null)} />
      )}
    </div>
  );
}
