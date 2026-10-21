import React, { useState, useEffect } from 'react';
import {
  ShieldCheck, LayoutGrid, ChefHat, Receipt, Users, ArrowRight, ExternalLink,
  Lock, UserRound, Store, CheckCircle2,
} from 'lucide-react';
import { useAuthStore, useUiStore, useSettingsStore } from '../../../store';
import { settingApi } from '../../../api/setting.api';
import { COMPANY } from '../../../config/company';
import LoginForm from '../components/LoginForm';
import { resolveHomeScreen, isSelfServeOnboarding } from '../../onboarding/onboarding.lib';
import PolicyTextModal from '../../../components/legal/PolicyTextModal';
import { dedupeProducts } from '../../../utils/productList';

// Bundled KlarGo logo — used until a business uploads its own via Settings.
const DEFAULT_LOGO = '/klargo-logo.png';
const PLATFORM_MARK = '/klargo-icon.png';

// What KlarGo POS does — compact capability highlights (icons come from the
// same set the rest of the app uses; no new dependencies).
const FEATURES = [
  { icon: Receipt, title: 'Orders and billing', desc: 'Counter and table orders billed in a few taps.' },
  { icon: LayoutGrid, title: 'Floors, tables and kitchen tickets', desc: 'Live floor plan, KOTs fired per order.' },
  { icon: ChefHat, title: 'Inventory, menu and staff', desc: 'Menu, stock and team roles in one place.' },
  { icon: Users, title: 'Sales reports and analytics', desc: 'Daily sales, top items and insights.' },
];

/**
 * Infinixo Technologies company logo (secondary footer identity).
 *  - Contained inside a fixed-height shell: a wide or oversized file shrinks to
 *    fit and can NEVER stretch, crop or overflow the panel/card.
 *  - If the asset is missing or fails to load, a clean text monogram replaces it
 *    (never an empty white plate, never a broken-image glyph).
 */
function CompanyLogo({ logo, name }) {
  const [failed, setFailed] = useState(false);
  const initials = (name || 'Infinixo Technologies')
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 3)
    .toUpperCase();

  if (!logo || failed) {
    return (
      <div className="flex h-8 max-w-full items-center rounded-lg bg-white/15 px-2.5 ring-1 ring-white/25">
        <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-white">{initials}</span>
      </div>
    );
  }

  return (
    <div className="flex h-8 max-h-8 w-24 max-w-full shrink-0 items-center rounded-lg bg-white p-1 shadow-sm ring-1 ring-black/5">
      <img
        src={logo}
        alt={`${name || 'Infinixo Technologies'} logo`}
        className="h-auto w-auto max-h-6 max-w-full object-contain"
        onError={() => setFailed(true)}
        referrerPolicy="no-referrer"
      />
    </div>
  );
}

/**
 * KlarGo POS product logo (primary identity).
 *  - Responsive container: the mark is contained and can never enlarge the
 *    layout, whatever the source file's dimensions.
 */
function ProductLogo({ className = 'h-9 w-9' }) {
  return (
    <span className={`flex ${className} shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-black/5`}>
      <img src={PLATFORM_MARK} alt="KlarGo POS" className="h-full w-full object-contain p-1" />
    </span>
  );
}

/**
 * Tenant logo mark on the login card.
 *  - A configured logo is shown CONTAINED inside a fixed square shell, so any
 *    aspect ratio is displayed undistorted and can never shift the layout.
 *  - A missing or FAILED source falls back to the business's initials — never
 *    the browser's broken-image glyph.
 */
function BusinessLogo({ logo, businessName }) {
  const [imgError, setImgError] = useState(false);
  const src = logo || DEFAULT_LOGO;

  // A new source always gets a fresh chance to load.
  useEffect(() => { setImgError(false); }, [src]);

  if (!src || imgError) {
    const initials = (businessName || 'P')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase();
    return (
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-slate-100">
        <span className="text-base font-extrabold text-slate-500">{initials || 'P'}</span>
      </div>
    );
  }

  return (
    <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <img
        src={src}
        alt={businessName || 'Business logo'}
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
  // Remember Me — lives in the auth store (persisted preference).
  const [rememberMe, setRememberMe] = useState(useAuthStore.getState().rememberMe !== false);

  // Footer policy links (Terms & Conditions / Privacy Policy) — same shared
  // policy texts used by registration and restaurant creation.
  const [openPolicy, setOpenPolicy] = useState(null);

  // ── Business branding state ──
  const [branding, setBranding] = useState({ name: null, logo: null });
  const [brandingLoaded, setBrandingLoaded] = useState(false);

  // ── Company product registry (public, backend-managed) ──
  // The live list overrides the static COMPANY.products fallback; a failure
  // degrades to the static list (usually empty → no section rendered).
  const [products, setProducts] = useState(COMPANY.products);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await settingApi.getPublicProducts();
      if (!cancelled && list && list.length > 0) {
        setProducts(list);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Fetch business branding on mount (public endpoint, no auth required)
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

  // Auto-redirect if already unlocked — self-serve applicants whose business
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

  const handleLogin = async (userId, password, remember) => {
    if (!userId || !password) {
      setLocalError('Please enter both User ID and Password.');
      return;
    }
    setLoading(true);
    setLocalError('');
    try {
      const email = userId.includes('@') ? userId : `${userId}@restaurant.com`;
      const success = await login(email, password, remember);
      if (success) {
        setUnlocked(true);
        // Load the business's persisted settings from the database right after
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
  const displayName = branding.name || COMPANY.productName || 'KlarGo POS';
  const hasBusinessBranding = brandingLoaded && branding.name;

  // Live registry first, configured fallback second, deduplicated by slug/id
  // so the same product (e.g. KlarGo POS in both) is never shown twice.
  const visibleProducts = dedupeProducts(products, COMPANY.products);

  const handleCreateAccount = () => {
    clearError();
    setLocalError('');
    setScreen('register');
  };

  return (
    <div className="flex min-h-[100dvh] w-full flex-col bg-[#F8FAFC] select-none font-sans lg:grid lg:h-[100dvh] lg:max-h-[100dvh] lg:grid-cols-[minmax(0,52fr)_minmax(0,48fr)] lg:overflow-hidden lg:bg-white">
      {/* ── Brand panel (desktop / tablet-landscape) ──
          Fixed-height column: KlarGo POS identity → product copy → feature grid
          → products strip → company footer. Nothing here scrolls the page. */}
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-[#0B3D24] via-[#15803D] to-[#22C55E] px-8 py-7 lg:flex lg:min-h-0 lg:flex-col xl:px-12 xl:py-8">
        {/* Soft depth — decorative only, never intercepts pointer events */}
        <div className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-36 -left-24 h-96 w-96 rounded-full bg-black/15 blur-3xl" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-white/10" />

        <div className="relative flex min-h-0 flex-1 flex-col gap-4">
          {/* 1 ── KlarGo POS — the product being signed into (primary identity) */}
          <div className="flex items-center gap-3">
            <ProductLogo className="h-10 w-10" />
            <div className="min-w-0">
              <p className="text-xl font-extrabold uppercase leading-none tracking-tight text-white">
                {COMPANY.productName}
              </p>
              <p className="mt-1 text-[11px] font-medium leading-snug text-white/75">
                {COMPANY.productSubtitle}
              </p>
            </div>
          </div>

          {/* 2 ── Product headline + description */}
          <div>
            <h2 className="text-2xl font-extrabold leading-tight text-white xl:text-[28px]">
              {COMPANY.headline}
            </h2>
            <p className="mt-1.5 text-xs leading-relaxed text-white/75">
              {COMPANY.description}
            </p>
          </div>

          {/* 3 ── Four feature cards in a compact two-column grid */}
          <div className="grid grid-cols-2 gap-2">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="flex min-h-[64px] items-start gap-2 rounded-xl bg-white/10 p-2.5 ring-1 ring-white/15"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/20">
                  <Icon className="h-3.5 w-3.5 text-white" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[11px] font-bold leading-tight text-white">{title}</span>
                  <span className="mt-0.5 block text-[10px] font-medium leading-snug text-white/65">{desc}</span>
                </span>
              </div>
            ))}
          </div>

          {/* 4 ── Our Products — compact rectangular strip from the live registry */}
          {visibleProducts.length > 0 && (
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/55">
                Our Products
              </p>
              <div className="mt-1.5 flex w-full gap-2 overflow-x-auto overscroll-x-contain pb-1 no-scrollbar">
                {visibleProducts.map((p) => (
                  <a
                    key={p.slug || p.id || p.name}
                    href={p.url || COMPANY.website}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="group flex w-56 shrink-0 items-center gap-2.5 rounded-xl bg-white/10 px-2.5 py-2 ring-1 ring-white/15 transition-colors hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/60"
                  >
                    {p.logo ? (
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white p-1">
                        <img
                          src={p.logo}
                          alt=""
                          className="max-h-full max-w-full object-contain"
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                      </span>
                    ) : (
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15 text-[10px] font-extrabold text-white">
                        {(p.name || '?').slice(0, 2).toUpperCase()}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1 text-[11px] font-bold text-white">
                        <span className="truncate">{p.name}</span>
                        {p.isCurrent && <CheckCircle2 className="h-3 w-3 shrink-0 text-white/80" />}
                      </span>
                      {p.description && (
                        <span className="mt-0.5 block truncate text-[9px] font-medium leading-snug text-white/60">
                          {p.description}
                        </span>
                      )}
                      <span className="mt-0.5 flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-white/70">
                        Explore
                        <ArrowRight className="h-2.5 w-2.5 transition-transform group-hover:translate-x-0.5" />
                        <ExternalLink className="ml-auto h-2.5 w-2.5 shrink-0 text-white/50" />
                      </span>
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 5 ── Company identity (secondary, always at the bottom) */}
        <div className="relative mt-4 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-white/10 pt-3">
          <CompanyLogo logo={COMPANY.logo} name={COMPANY.name} />
          <a
            href={COMPANY.website}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 text-[10px] font-bold text-white/75 underline-offset-2 transition-colors hover:text-white hover:underline"
          >
            {COMPANY.attribution}
            <ExternalLink className="h-2.5 w-2.5 shrink-0" />
          </a>
          <span className="ml-auto inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-white/50">
            <ShieldCheck className="h-3.5 w-3.5" />
            Secure session
          </span>
        </div>
      </aside>

      {/* ── Sign-in column ── */}
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-6 sm:px-6 lg:h-full lg:min-h-0 lg:px-8 lg:py-6 pt-safe pb-safe">
        <div className="w-full max-w-[420px] animate-fade-in">
          {/* Mobile / tablet brand header (the panel above is desktop-only) */}
          <div className="mb-5 flex flex-col items-center gap-1.5 lg:hidden">
            <div className="flex items-center gap-2.5">
              <ProductLogo className="h-9 w-9" />
              <div className="text-left">
                <p className="text-base font-extrabold uppercase leading-none tracking-tight text-[#16A34A]">
                  {COMPANY.productName}
                </p>
                <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">
                  {COMPANY.attribution}
                </p>
              </div>
            </div>
          </div>

          <div className="w-full rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_20px_50px_-24px_rgba(15,23,42,0.35)] sm:p-6">
            {/* ── Business branding (this tenant) ── */}
            <div className="flex flex-col items-center gap-2 border-b border-slate-100 pb-4">
              {!brandingLoaded ? (
                <div className="flex flex-col items-center gap-3 animate-pulse">
                  <div className="h-14 w-14 rounded-2xl bg-slate-200" />
                  <div className="h-4 w-36 rounded bg-slate-200" />
                  <div className="h-3 w-24 rounded bg-slate-100" />
                </div>
              ) : (
                <>
                  <BusinessLogo logo={branding.logo} businessName={branding.name} />
                  <div className="space-y-1 text-center">
                    <h1 className="text-base font-extrabold tracking-tight text-slate-800">
                      {displayName}
                    </h1>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#16A34A]/10 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-[#15803D]">
                      <Lock className="h-3 w-3" />
                      Secure Login
                    </span>
                    {!hasBusinessBranding && (
                      <p className="text-[10px] font-medium text-slate-400">
                        Sign in to your POS workspace
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* ── Credentials ── */}
            <div className="pt-4">
              <LoginForm
                onSubmit={handleLogin}
                loading={loading}
                error={localError}
                rememberMe={rememberMe}
                onRememberChange={setRememberMe}
              />
            </div>

            {/* ── Secondary action: self-serve registration ── */}
            <div className="mt-4 border-t border-slate-100 pt-4">
              <p className="flex items-center justify-center gap-1.5 text-[11px] font-medium text-slate-500">
                <Store className="h-3.5 w-3.5 text-slate-400" />
                Don't have an account?
              </p>
              <button
                type="button"
                onClick={handleCreateAccount}
                disabled={loading}
                className="group mt-2 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-[#16A34A]/40 bg-[#16A34A]/5 text-xs font-bold uppercase tracking-wider text-[#15803D] transition-all hover:border-[#16A34A] hover:bg-[#16A34A] hover:text-white focus:outline-none focus:ring-2 focus:ring-[#16A34A]/30 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
              >
                <UserRound className="h-4 w-4" />
                Create New Account
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>
          </div>

          {/* ── Footer ── */}
          <div className="mt-4 space-y-1.5 text-center">
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
