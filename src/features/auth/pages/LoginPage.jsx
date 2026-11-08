import React, { useState, useEffect } from 'react';
import {
  ShieldCheck, LayoutGrid, BarChart3, Receipt, ArrowRight,
  Lock, Store,
} from 'lucide-react';
import { useAuthStore, useUiStore, useSettingsStore, useTenantStore } from '../../../store';
import { PLATFORM_ROOT_DOMAIN, getPlatformOrigin } from '../../../config/tenantConfig';
import { settingApi, getPublicProducts } from '../../../api/setting.api';
import { COMPANY } from '../../../config/company';
import BrandLogo from '../../../components/common/BrandLogo';
import ProductCard from '../../../components/product/ProductCard';
import LoginForm from '../components/LoginForm';
import { resolveHomeScreen, isSelfServeOnboarding } from '../../onboarding/onboarding.lib';
import PolicyTextModal from '../../../components/legal/PolicyTextModal';
import { resolveAssetUrl } from '../../../utils/assetUrl';

// Compact capability strip shown above the product cards.
// (Inventory is intentionally not listed here — the inventory MODULE itself is untouched.)
const FEATURES = [
  { icon: Receipt, label: 'Orders & Billing' },
  { icon: LayoutGrid, label: 'Tables & KOT' },
  { icon: BarChart3, label: 'Reports' },
];

/**
 * Tenant logo mark on the login card.
 *  - A configured logo is shown CONTAINED inside a fixed square shell, so any
 *    aspect ratio is displayed undistorted and can never shift the layout.
 *  - A missing or FAILED source falls back to the business's initials — never
 *    the browser's broken-image glyph.
 */
function BusinessLogo({ logo, businessName }) {
  const [imgError, setImgError] = useState(false);
  const src = resolveAssetUrl(logo);

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
      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-slate-50">
        <span className="text-sm font-extrabold text-slate-500">{initials || 'P'}</span>
      </div>
    );
  }

  return (
    <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
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

/**
 * Official Infinixo Technologies logo pinned to the bottom-left of the
 * branding panel.
 *  - The existing `frontend/public/infinixo-logo.png` asset is reused as-is
 *    (transparency and aspect ratio preserved, object-contain, never plated).
 *  - A failed load renders nothing — never the broken-image glyph.
 */
function InfinixoLogo() {
  const [failed, setFailed] = useState(false);

  if (failed) return null;

  return (
    <img
      src={COMPANY.logo}
      alt={`${COMPANY.name} logo`}
      onError={() => setFailed(true)}
      loading="lazy"
      referrerPolicy="no-referrer"
      className="w-[96px] h-auto object-contain sm:w-[120px] lg:w-[144px]"
    />
  );
}

export default function LoginPage() {
  const { error, clearError, user, onboarding } = useAuthStore();
  const { login, isUnlocked } = useAuthStore();
  const { setScreen, setUnlocked, loginNotice, setLoginNotice } = useUiStore();

  const [localError, setLocalError] = useState('');
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(useAuthStore.getState().rememberMe !== false);

  // Footer policy links.
  const [openPolicy, setOpenPolicy] = useState(null);

  // ── Business branding state ──
  const [branding, setBranding] = useState({ name: null, logo: null });
  const [brandingLoaded, setBrandingLoaded] = useState(false);

  // ── Public product registry ──
  const [products, setProducts] = useState([]);
  const [productsStatus, setProductsStatus] = useState('loading'); // loading | ready | error
  const [productsError, setProductsError] = useState('');
  const [productsRetry, setProductsRetry] = useState(0);

  // ── Workspace (subdomain) state ──
  const tenantStatus = useTenantStore((s) => s.status);
  const tenant = useTenantStore((s) => s.tenant);
  const tenantError = useTenantStore((s) => s.error);
  const tenantErrorCode = useTenantStore((s) => s.errorCode);
  const loadTenant = useTenantStore((s) => s.loadTenant);

  // Resolve the workspace from the hostname (public, no auth required).
  useEffect(() => { loadTenant(); }, [loadTenant]);

  // Load the live product catalog. The section ALWAYS renders — loading,
  // empty, and failure states are all explicit (never silently hidden).
  useEffect(() => {
    let cancelled = false;
    setProductsStatus('loading');
    setProductsError('');

    getPublicProducts()
      .then((list) => {
        if (cancelled) return;
        setProducts(Array.isArray(list) ? list : []);
        setProductsStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setProducts([]);
        setProductsError(err?.message || 'The product catalog could not be loaded.');
        setProductsStatus('error');
      });

    return () => { cancelled = true; };
  }, [productsRetry]);

  // Fetch business branding once the workspace is known:
  //  - tenant host → the registered restaurant's own name + logo
  //  - platform host → the legacy public branding endpoint (first active tenant)
  useEffect(() => {
    if (tenantStatus === 'idle' || tenantStatus === 'loading') return undefined;
    let cancelled = false;

    if (tenant) {
      setBranding({ name: tenant.name || null, logo: tenant.logo || null });
      setBrandingLoaded(true);
      return () => { cancelled = true; };
    }

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
  }, [tenantStatus, tenant]);

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

  // One-shot notice from the authentication flow (e.g. an expired session).
  useEffect(() => {
    if (loginNotice) {
      setLocalError(loginNotice);
      setLoginNotice('');
    }
  }, [loginNotice, setLoginNotice]);

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
        // Load the business's persisted settings right after login so module
        // visibility applies immediately. Applicants cannot read POS settings
        // yet — they are routed into onboarding instead.
        if (!isSelfServeOnboarding(useAuthStore.getState().onboarding)) {
          useSettingsStore.getState().fetchSettings();
        }
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

  const displayName = branding.name || COMPANY.productName || 'QWIKOUT POS';
  const hasBusinessBranding = brandingLoaded && branding.name;

  const workspaceBlocked =
    tenantStatus === 'error' &&
    ['TENANT_NOT_FOUND', 'TENANT_INACTIVE', 'TENANT_INVALID'].includes(tenantErrorCode);
  const workspaceLabel = tenant?.subdomain
    ? `${tenant.subdomain}.${PLATFORM_ROOT_DOMAIN}`
    : null;

  const handleCreateAccount = () => {
    clearError();
    setLocalError('');
    setScreen('register');
  };

  return (
    <div className="login-theme flex min-h-[100dvh] w-full flex-col bg-[#F5F8FF] font-sans select-none lg:grid lg:min-h-[100dvh] lg:grid-cols-[minmax(0,60fr)_minmax(0,40fr)]">
      {/* ── Branding / products (left) ── */}
      <aside className="relative order-2 flex min-w-0 flex-col overflow-hidden bg-[#F5F8FF] px-5 py-7 sm:px-8 sm:py-9 md:px-10 lg:order-1 lg:px-8 lg:py-8 xl:px-12">
        {/* Subtle blue/purple decorative shapes — clipped, never interactive */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-[#0866E8]/10 blur-3xl" />
          <div className="absolute -left-24 top-1/3 h-64 w-64 rounded-full bg-[#08B9F5]/10 blur-3xl" />
          <div className="absolute -bottom-28 -left-28 h-80 w-80 rounded-full bg-[#9228F5]/10 blur-3xl" />
          <div className="absolute right-10 top-[42%] hidden h-28 w-28 rounded-full border border-[#08B9F5]/25 sm:block" />
        </div>

        <div className="relative z-10 mx-auto flex w-full max-w-[680px] min-w-0 flex-1 flex-col lg:max-w-none">
          {/* Centered content group. On desktop `lg:my-auto` balances the
              block vertically between the panel edges and the attribution
              footer; auto margins collapse to 0 when the content is taller
              than the panel, so nothing is ever clipped. On mobile the group
              simply flows naturally. */}
          <div className="flex flex-col items-center lg:my-auto">
            {/* 1 ── Original QWIKOUT logo: enlarged, centered, no plate */}
            <BrandLogo
              priority
              className="w-full max-w-[280px] sm:max-w-[360px] md:max-w-[400px] lg:max-w-[430px] xl:max-w-[470px]"
            />

            {/* 2 ── Headline: clamp sizing keeps it on ONE line on desktop,
                natural wrapping on small screens (never shrunk to unreadable). */}
            <h1 className="mx-auto mt-5 max-w-full text-center text-[clamp(1.35rem,2.2vw,2rem)] font-extrabold leading-[1.15] tracking-tight text-slate-900 sm:mt-6">
              {COMPANY.headline}
            </h1>

            {/* 3 ── Description */}
            <p className="mx-auto mt-2.5 max-w-[52ch] text-center text-[12.5px] leading-relaxed text-slate-600 sm:text-sm">
              {COMPANY.description}
            </p>

            {/* 4 ── Compact key-feature row (above the product cards) */}
            <ul className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2.5 justify-center">
              {FEATURES.map(({ icon: Icon, label }) => (
                <li key={label} className="inline-flex items-center gap-1.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#E6F8FE] text-[#0891B2] ring-1 ring-[#08B9F5]/25">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-600">
                    {label}
                  </span>
                </li>
              ))}
            </ul>

            {/* 5/6 ── Our Products (left-aligned to the grid) + live registry cards */}
            <section className="mt-6 w-full min-w-0" aria-labelledby="our-products-heading">
              <div className="w-full">
                <h2
                  id="our-products-heading"
                  className="text-[11px] font-extrabold uppercase tracking-[0.06em] text-slate-800"
                >
                  Our Products
                </h2>
                <span
                  className="mt-1.5 block h-0.5 w-8 rounded-full bg-gradient-to-r from-[#0866E8] to-[#9228F5]"
                  aria-hidden="true"
                />
              </div>

              <div className="mt-3">
                {productsStatus === 'loading' && (
                  <div
                    className="grid grid-cols-2 gap-2.5 sm:gap-3 sm:grid-cols-3 xl:grid-cols-4"
                    aria-busy="true"
                    aria-label="Loading products"
                  >
                    {[0, 1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="h-[154px] animate-pulse rounded-xl border border-slate-200 bg-white/70"
                      />
                    ))}
                  </div>
                )}

                {productsStatus === 'error' && (
                  <div
                    role="alert"
                    className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3"
                  >
                    <p className="text-[11px] font-extrabold text-amber-900">
                      Couldn&apos;t load the product catalog
                    </p>
                    <p className="mt-1 text-[10px] font-medium leading-relaxed text-amber-800">
                      {productsError}
                    </p>
                    <button
                      type="button"
                      onClick={() => setProductsRetry((n) => n + 1)}
                      className="mt-2.5 h-8 rounded-lg border border-amber-300 bg-white px-3 text-[10px] font-bold uppercase tracking-wider text-amber-800 transition-colors hover:bg-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40 cursor-pointer"
                    >
                      Retry
                    </button>
                  </div>
                )}

                {productsStatus === 'ready' && products.length === 0 && (
                  <p className="rounded-xl border border-dashed border-slate-300 bg-white/60 px-3.5 py-4 text-[11px] font-medium text-slate-500">
                    No products are published right now.
                  </p>
                )}

                {productsStatus === 'ready' && products.length > 0 && (
                  <div className="grid grid-cols-2 gap-2.5 sm:gap-3 sm:grid-cols-3 xl:grid-cols-4">
                    {products.map((product) => (
                      <ProductCard
                        key={product.id || product.slug || product.name}
                        product={product}
                      />
                    ))}
                  </div>
                )}
              </div>
            </section>

          </div>

          {/* 7 ── Company attribution: official Infinixo logo + text on one
              line (desktop), wrapping naturally on narrow screens. */}
          <footer className="mt-6 w-full shrink-0 lg:mt-5">
            <a
              href={COMPANY.website}
              target="_blank"
              rel="noreferrer noopener"
              aria-label={`${COMPANY.name} — opens in a new tab`}
              className="inline-flex max-w-full flex-wrap items-center gap-x-2.5 gap-y-1.5 opacity-80 transition-opacity hover:opacity-100"
            >
              <InfinixoLogo />
              <span className="inline-flex items-center gap-2">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#9228F5]" aria-hidden="true" />
                <span className="text-[10px] font-semibold leading-snug tracking-[0.04em] text-slate-500">
                  {COMPANY.attribution}
                </span>
              </span>
            </a>
          </footer>
        </div>
      </aside>

      {/* ── Login card (right) ── */}
      <main className="relative order-1 flex min-w-0 flex-col items-center justify-center overflow-hidden bg-[#F1F6FF] px-4 py-8 sm:px-6 sm:py-10 lg:order-2 lg:bg-[#F5F8FF] lg:px-8 lg:py-10">
        <div className="pointer-events-none absolute inset-0 overflow-hidden lg:hidden" aria-hidden="true">
          <div className="absolute -right-16 top-4 h-48 w-48 rounded-full bg-[#0866E8]/10 blur-3xl" />
        </div>

        {/* Mobile: compact centered logo above the form, so signing in is the
            first thing available while the brand panel flows underneath. */}
        <div className="relative z-10 mb-5 w-full max-w-[400px] sm:mb-6 lg:hidden">
          <BrandLogo priority className="mx-auto w-full max-w-[240px] sm:max-w-[280px]" />
        </div>

        <div className="relative z-10 w-full max-w-[400px] animate-fade-in">
          <div className="w-full rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_24px_60px_-34px_rgba(15,23,42,0.32)] sm:p-6">
            {/* Tenant / workspace identity */}
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              {!brandingLoaded ? (
                <div className="flex items-center gap-3 animate-pulse">
                  <div className="h-12 w-12 rounded-xl bg-slate-200" />
                  <div className="space-y-2">
                    <div className="h-4 w-32 rounded bg-slate-200" />
                    <div className="h-3 w-24 rounded bg-slate-100" />
                  </div>
                </div>
              ) : (
                <>
                  {hasBusinessBranding ? (
                    <BusinessLogo logo={branding.logo} businessName={branding.name} />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#0866E8]/15 bg-[#F0F6FF]">
                      <Lock className="h-5 w-5 text-[#0866E8]" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <h1 className="truncate text-[15px] font-extrabold tracking-tight text-slate-800">
                      {displayName}
                    </h1>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#F0F6FF] px-2 py-0.5 text-[8px] font-extrabold uppercase tracking-[0.12em] text-[#123EAA] ring-1 ring-[#0866E8]/15">
                        <ShieldCheck className="h-3 w-3" />
                        Secure Login
                      </span>
                      {workspaceLabel && (
                        <span className="max-w-full truncate text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                          {workspaceLabel}
                        </span>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            <p className="mt-4 text-[11px] font-medium leading-relaxed text-slate-500">
              Sign in to your QWIKOUT POS workspace.
            </p>

            {workspaceBlocked ? (
              <div className="pt-5 text-center" role="alert">
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-amber-200">
                  <Store className="h-5 w-5" />
                </div>
                <p className="mt-3 text-sm font-extrabold text-slate-800">
                  {tenantErrorCode === 'TENANT_INACTIVE' ? 'Workspace not active yet' : 'Workspace not found'}
                </p>
                <p className="mx-auto mt-1 max-w-[300px] text-[11px] font-medium leading-relaxed text-slate-500">
                  {tenantError || 'We could not load this workspace. Check the address and try again.'}
                </p>
                <div className="mt-4 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => loadTenant({ force: true })}
                    className="flex h-9 w-full items-center justify-center rounded-xl bg-gradient-to-r from-[#0866E8] to-[#9228F5] text-[11px] font-bold uppercase tracking-wider text-white transition-all hover:from-[#123EAA] hover:to-[#6415C9] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0866E8]/35 cursor-pointer"
                  >
                    Try again
                  </button>
                  <a
                    href={getPlatformOrigin()}
                    className="text-[11px] font-semibold text-[#0866E8] transition-colors hover:text-[#123EAA]"
                  >
                    Go to {PLATFORM_ROOT_DOMAIN}
                  </a>
                </div>
              </div>
            ) : (
              <>
                <div className="pt-4">
                  <LoginForm
                    onSubmit={handleLogin}
                    loading={loading || tenantStatus === 'loading'}
                    error={localError}
                    rememberMe={rememberMe}
                    onRememberChange={setRememberMe}
                  />
                </div>

                {/* OR divider */}
                <div className="my-4 flex items-center gap-3" aria-hidden="true">
                  <span className="h-px flex-1 bg-slate-200" />
                  <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">
                    OR
                  </span>
                  <span className="h-px flex-1 bg-slate-200" />
                </div>

                {tenant ? (
                  <a
                    href={getPlatformOrigin()}
                    className="group flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-[#0866E8]/35 bg-white text-[11px] font-bold uppercase tracking-wider text-[#0866E8] transition-all hover:border-[#0866E8] hover:bg-[#EEF4FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0866E8]/30"
                  >
                    <Store className="h-4 w-4" />
                    Create New Account
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={handleCreateAccount}
                    disabled={loading}
                    className="group flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-[#0866E8]/35 bg-white text-xs font-bold uppercase tracking-wider text-[#0866E8] transition-all hover:border-[#0866E8] hover:bg-[#EEF4FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0866E8]/30 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
                  >
                    Create New Account
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </button>
                )}

                <div className="mt-4 border-t border-slate-100 pt-3 text-center">
                  <p className="text-[9px] font-medium text-slate-400">
                    &copy; 2026 Infinixo Technologies. All rights reserved.
                  </p>
                  <div className="mt-1 flex items-center justify-center gap-1.5 text-[9px] text-slate-400">
                    <button
                      type="button"
                      onClick={() => setOpenPolicy('PRIVACY_POLICY')}
                      className="font-medium transition-colors hover:text-[#0866E8] cursor-pointer"
                    >
                      Privacy Policy
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() => setOpenPolicy('TERMS_OF_SERVICE')}
                      className="font-medium transition-colors hover:text-[#0866E8] cursor-pointer"
                    >
                      Terms of Service
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </main>

      {openPolicy && (
        <PolicyTextModal type={openPolicy} onClose={() => setOpenPolicy(null)} />
      )}
    </div>
  );
}
