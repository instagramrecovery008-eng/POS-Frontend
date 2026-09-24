import React, { useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import Sidebar from '../sidebar/Sidebar';
import Header from '../header/Header';
import { useAuthStore, useUiStore, useSettingsStore, useCartStore } from '../../../store';
import LoginPage from '../../../features/auth/pages/LoginPage';
import ForceChangePasswordPage from '../../../features/auth/pages/ForceChangePasswordPage';
import LockScreen from './LockScreen';
import { useSocketConnection, useSocketEvent } from '../../../hooks/useSocket';
import { invalidateMenuData } from '../../../services/menuSync';
import DashboardPage from '../../../features/dashboard/pages/DashboardPage';
import BillingPage from '../../../features/billing/pages/BillingPage';
import PosWorkspace from '../../../features/pos/workspace/pages/PosWorkspace';
import NewOrderPage from '../../../features/pos/workspace/pages/NewOrderPage';
import TakeOrderWizard from '../../../features/pos/workspace/components/TakeOrderWizard';
import ErrorBoundary from '../../common/ErrorBoundary';
import { AlertTriangle, X, CheckCircle2, ShieldAlert } from 'lucide-react';
import { canAccessScreen, getDefaultScreenForRole, SCREEN_FEATURES, hasFeature, isScreenAllowedForBusinessMode, getRoleDisplayName } from '../../../utils/permissions';
import { getBusinessCapabilities, isBasicPosFoodBusiness, isBasicPosProductionMode } from '../../../utils/businessCapabilities';
import OnboardingFlow from '../../../features/onboarding/OnboardingFlow';
import RegisterPage from '../../../features/onboarding/RegisterPage';
import { isSelfServeOnboarding, resolveHomeScreen } from '../../../features/onboarding/onboarding.lib';

// ── Route-level code splitting ──────────────────────────────────────────────
// Heavy feature pages are lazy-loaded so the initial bundle only carries the
// shell, login, dashboard, POS workspace + billing. Each screen's chunk loads
// on first visit (Suspense fallback below), and stays cached afterwards.
const KitchenPage = lazy(() => import('../../../features/kitchen/pages/KitchenPage'));
const TablesPage = lazy(() => import('../../../features/masters/table/pages/TablePage'));
const ActiveOrdersPage = lazy(() => import('../../../features/orders/pages/ActiveOrdersPage'));
const MenuPage = lazy(() => import('../../../features/masters/menu/pages/MenuPage'));
const StaffPage = lazy(() => import('../../../features/masters/staff/pages/StaffPage'));
const ReportsPage = lazy(() => import('../../../features/reports/pages/ReportsPage'));
const SettingsPage = lazy(() => import('../../../features/settings/pages/SettingsPage'));
const DiscountsPage = lazy(() => import('../../../features/discounts/pages/DiscountsPage'));
const SubscriptionPage = lazy(() => import('../../../features/subscription/pages/SubscriptionPage'));
const BusinessApplications = lazy(() => import('../../../features/super-admin/pages/BusinessApplications'));

// ── Super Admin screens (restaurant-side users never load these chunks) ──
const SuperAdminSidebar = lazy(() => import('../../../features/super-admin/components/SuperAdminSidebar'));
const SuperAdminDashboard = lazy(() => import('../../../features/super-admin/pages/SuperAdminDashboard'));
const RestaurantList = lazy(() => import('../../../features/super-admin/pages/RestaurantList'));
const SubscriptionManagement = lazy(() => import('../../../features/super-admin/pages/SubscriptionManagement'));
const UserManagement = lazy(() => import('../../../features/super-admin/pages/UserManagement'));
// Note: UserManagement is kept in the codebase but removed from SA sidebar navigation.
const PlatformReports = lazy(() => import('../../../features/super-admin/pages/PlatformReports'));
const Notifications = lazy(() => import('../../../features/super-admin/pages/Notifications'));
const SystemSettings = lazy(() => import('../../../features/super-admin/pages/SystemSettings'));
const PaymentGateway = lazy(() => import('../../../features/super-admin/pages/PaymentGateway'));
const AuditLogs = lazy(() => import('../../../features/super-admin/pages/AuditLogs'));
const PlansManagement = lazy(() => import('../../../features/super-admin/pages/PlansManagement'));
const Invoices = lazy(() => import('../../../features/super-admin/pages/Invoices'));
const ProfilePage = lazy(() => import('../../../features/super-admin/pages/ProfilePage'));

// ── Lightweight loading fallback shown while a screen chunk loads ──
function ScreenFallback() {
  return (
    <div className="flex items-center justify-center h-64 text-slate-400">
      <Loader2 className="w-6 h-6 animate-spin mr-2" />
      <span className="text-sm font-semibold">Loading...</span>
    </div>
  );
}

// ── Super Admin screens are prefixed with sa_ ──
function isSuperAdminScreen(screen) {
  return screen && screen.startsWith('sa_');
}

// ── Expired-subscription screen (staff roles — the ADMIN goes to Subscription
// & Billing instead so they can renew; everyone else sees this notice). ──
function SubscriptionExpiredScreen() {
  const { logout } = useAuthStore();
  const { setScreen } = useUiStore();

  return (
    <div className="flex-1 flex items-center justify-center p-5">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="text-lg font-extrabold text-slate-800 mb-2">Subscription Expired</h2>
        <p className="text-sm text-slate-500 mb-6">
          Your restaurant's subscription has expired, so the POS is currently locked.
          Please contact your restaurant administrator to renew the plan.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => { setScreen('login'); logout(); }}
            className="h-9 px-5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 font-bold rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer"
          >
            Log Out
          </button>
        </div>
      </div>
    </div>
  );
}

const ScreenRenderer = {
  login: LoginPage,
  expired_locked: SubscriptionExpiredScreen,
  dashboard: DashboardPage,
  orders: KitchenPage,
  tables: TablesPage,
  active_orders: ActiveOrdersPage,
  menu: MenuPage,
  discounts: DiscountsPage,
  staff: StaffPage,
  reports: ReportsPage,
  settings: SettingsPage,
  subscription: SubscriptionPage,
  order_taking: PosWorkspace,
  new_order: NewOrderPage,
  // Super Admin screens
  sa_dashboard: SuperAdminDashboard,
  sa_restaurants: RestaurantList,
  sa_subscriptions: SubscriptionManagement,
  sa_users: UserManagement,
  sa_plans: PlansManagement,
  sa_invoices: Invoices,
  sa_reports: PlatformReports,
  sa_notifications: Notifications,
  sa_settings: SystemSettings,
  sa_gateway: PaymentGateway,
  sa_audit: AuditLogs,
  sa_profile: ProfilePage,
  sa_applications: BusinessApplications,
};

// ── Maps screen names → settings key for module visibility ──
const SCREEN_TO_SETTING = {
  orders: 'enableKitchen',
  tables: 'enableFloorManagement',
  active_orders: 'enableActiveOrders',
  menu: 'enableMenu',
  reports: 'enableReports',
  order_taking: 'enablePosOrdering',
  staff: 'enableStaffRoster',
};

// ── §10: route-level BUSINESS-CAPABILITY guards ──
// Hiding sidebar entries is UX only. This map blocks the screen entirely when
// the tenant's business type lacks the capability — a retail user typing
// /kitchen or /tables into the URL bar is redirected, never shown the page.
// The backend requireBusinessCapability gates remain the final authority.
const SCREEN_BUSINESS_CAPABILITY = {
  orders: 'kitchen',      // Kitchen Tickets
  tables: 'tables',       // Floors & Tables
  // §12: Active Orders is the in-progress order workflow — restaurant orders
  // and BASIC_POS production orders. Retail counter-sale businesses have no
  // such screen; a BASIC_POS food business in Quick Billing mode is redirected
  // by the mode check below (not by a blanket capability block).
  // active_orders intentionally NOT listed here.
};
// §7: Kitchen Tickets is a RESTAURANT screen — a BASIC_POS food business
// (businessType resolves kitchen=true but the mode is counter) never gets the
// dedicated KOT screen; its kitchen status lives inside Active Orders.
const BASIC_POS_SCREENS = ['orders'];

// ── Super Admin screens never need module visibility checks ──
const SUPER_ADMIN_SCREENS = [  'sa_dashboard', 'sa_restaurants', 'sa_subscriptions',
  'sa_plans', 'sa_invoices', 'sa_reports', 'sa_notifications', 'sa_settings', 'sa_gateway', 'sa_audit', 'sa_profile',
  'sa_applications',
];

// ── Priority-ordered fallback screens (first enabled module wins) ──
const FALLBACK_SCREEN_PRIORITY = [
  'dashboard',
  'new_order',       // Restaurant: TakeOrderWizard (full restaurant order flow)
  'order_taking',    // Counter/Hybrid: Basic POS (quick billing)
  'active_orders',
  'menu',
  'reports',
  'tables',
  'orders',
  'staff',
];

/** Find the best available screen for the current settings, role & plan features */
function findBestAvailableScreen(settings, userRole, subscription) {
  for (const screen of FALLBACK_SCREEN_PRIORITY) {
    // Check role permission
    if (!canAccessScreen(userRole, screen)) continue;
    // Check business-mode applicability
    if (!isScreenAllowedForBusinessMode(screen, settings?.businessMode)) continue;
    // Check module visibility
    const settingKey = SCREEN_TO_SETTING[screen];
    if (settingKey && settings[settingKey] === false) continue;
    // Check plan feature access
    const requiredFeature = SCREEN_FEATURES[screen];
    if (requiredFeature && !hasFeature(subscription, requiredFeature)) continue;
    return screen;
  }
  return 'dashboard'; // ultimate fallback
}

// ── Auto-lock timer hook ──────────────────────────────────────────────────
function useAutoLock() {
  const { settings } = useSettingsStore();
  const { isUnlocked, isAuthenticated, lockTerminal } = useAuthStore();
  const { currentScreen } = useUiStore();
  const idleTimerRef = useRef(null);
  const lastActivityRef = useRef(Date.now());

  const resetIdleTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  useEffect(() => {
    // Don't auto-lock if not unlocked or not authenticated
    if (!isUnlocked || !isAuthenticated) return;

    // Don't auto-lock on login screen
    if (currentScreen === 'login') return;

    const autoLockSetting = settings?.security?.autoLock || 'disabled';
    if (autoLockSetting === 'disabled') return;

    const timeoutMinutes = parseInt(autoLockSetting, 10);
    if (isNaN(timeoutMinutes) || timeoutMinutes <= 0) return;

    const timeoutMs = timeoutMinutes * 60 * 1000;

    // Clear existing timer
    if (idleTimerRef.current) {
      clearInterval(idleTimerRef.current);
    }

    // Check every 30 seconds if idle timeout has been exceeded
    idleTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current;
      if (elapsed >= timeoutMs) {
        lockTerminal(currentScreen);
      }
    }, 30000);

    return () => {
      if (idleTimerRef.current) {
        clearInterval(idleTimerRef.current);
      }
    };
  }, [isUnlocked, isAuthenticated, currentScreen, settings?.security?.autoLock, lockTerminal]);

  // Reset idle timer on user activity
  useEffect(() => {
    if (!isUnlocked) return;

    const activityEvents = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll', 'click'];
    
    const handleActivity = () => {
      resetIdleTimer();
    };

    activityEvents.forEach(event => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    return () => {
      activityEvents.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, [isUnlocked, resetIdleTimer]);
}

// ─── Unauthorized Screen ────────────────────────────────────────────────────
function UnauthorizedPage() {
  const { user, logout } = useAuthStore();
  const { setScreen } = useUiStore();

  const handleLogout = () => {
    setScreen('login');
    logout();
  };
  // Presentation label via the centralized utility — WAITER shows as "Service Staff"
  const roleDisplay = getRoleDisplayName((user?.role || '').toUpperCase());
  
  return (
    <div className="flex-1 flex items-center justify-center p-5">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center mx-auto mb-4">
          <ShieldAlert className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="text-lg font-extrabold text-slate-800 mb-2">Access Denied</h2>
        <p className="text-sm text-slate-500 mb-1">
          You don't have permission to access this page.
        </p>
        <p className="text-[11px] text-slate-400 mb-6">
          Your role (<span className="font-bold uppercase">{roleDisplay}</span>) does not have the required permissions.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => setScreen('dashboard')}
            className="h-9 px-5 bg-[#16A34A] hover:bg-[#15803D] text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer shadow-sm"
          >
            Go to Dashboard
          </button>
          <button
            onClick={handleLogout}
            className="h-9 px-5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 font-bold rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer"
          >
            Log Out
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AppShell() {
  // ── Manage Socket.IO connection lifecycle ──
  useSocketConnection();

  // ── Global menu/stock cache invalidation: fires on every order lifecycle
  // event that changes inventory — order placed (stock reserved), updated
  // (items added/edited), cancelled/deleted (stock restored), and payment.
  // (AppShell stays mounted for the whole session, so even unmounted screens
  // drop their caches and fetch fresh stock the next time they open). ──
  const invalidateOnOrderChange = () => invalidateMenuData();
  useSocketEvent({ event: 'order:created', handler: invalidateOnOrderChange });
  useSocketEvent({ event: 'order:updated', handler: invalidateOnOrderChange });
  useSocketEvent({ event: 'order:cancelled', handler: invalidateOnOrderChange });
  useSocketEvent({ event: 'order:deleted', handler: invalidateOnOrderChange });
  useSocketEvent({ event: 'order:payment', handler: invalidateOnOrderChange });

  // ── Auto-lock idle timer ──
  useAutoLock();

  const { currentScreen, setScreen } = useUiStore();
  const { user, subscription, onboarding, isUnlocked, isAuthenticated, sessionReady, restoreSession } = useAuthStore();
  const { settings, lastFetched, fetchSettings, moduleVisibilityVersion } = useSettingsStore();
  const { toasts, apiError, clearApiError } = useUiStore();

  // ── Cross-restaurant cache safety ──
  // React Query caches fetched tenant data in memory. When a session ends (logout,
  // lock + switch user, 401 expiry) the cache is cleared so the NEXT restaurant
  // that logs in on this browser can never be served the previous restaurant's
  // cached data (query keys are not tenant-scoped by design). Also covers a direct
  // user switch without an intermediate logout.
  const queryClient = useQueryClient();
  const prevIdentityRef = useRef(null);
  useEffect(() => {
    const identity = user ? `${user.id}|${user.restaurantId ?? ''}|${user.role}` : null;
    if (identity && prevIdentityRef.current && identity !== prevIdentityRef.current) {
      queryClient.clear();
    } else if (!identity && prevIdentityRef.current !== null) {
      queryClient.clear();
    }
    prevIdentityRef.current = identity;
  }, [user, queryClient]);

  // ── Restore session on mount (validate JWT, rehydrate user) ──
  useEffect(() => {
    restoreSession();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Global session-expiry handler ──
  // The API client fires 'pos:session-expired' once when any protected request
  // returns 401 (stale/invalid token). We log out and land on the login screen
  // — no infinite retry loop, no repeated /api/auth/login calls.
  useEffect(() => {
    const handleSessionExpired = () => {
      useAuthStore.getState().logout();
      useUiStore.getState().setScreen('login');
    };
    window.addEventListener('pos:session-expired', handleSessionExpired);
    return () => window.removeEventListener('pos:session-expired', handleSessionExpired);
  }, []);

  // ── Auto-load restaurant settings ONCE the session is known to be an ACTIVE
  // POS account. Onboarding applicants (restaurant not ACTIVE yet) must never
  // call POS-protected endpoints, so they are skipped here — their settings
  // load on “Enter Restaurant POS” after activation.
  const autoSettingsFetchedRef = useRef(false);
  useEffect(() => {
    if (!sessionReady || !isAuthenticated || !user) return;
    if (isSelfServeOnboarding(onboarding)) return;
    if (autoSettingsFetchedRef.current) return;
    autoSettingsFetchedRef.current = true;
    if (!lastFetched || Date.now() - lastFetched > 60000) {
      fetchSettings();
    }
  }, [sessionReady, isAuthenticated, user, onboarding, lastFetched, fetchSettings]);

  // ── After session restored, redirect to the user's home screen if still on login ──
  // Self-serve applicants whose restaurant is not ACTIVE yet go into the
  // onboarding wizard (resume at the correct step); everyone else lands on
  // their role's default screen. Backend status decides, never the client.
  useEffect(() => {
    if (sessionReady && isAuthenticated && user && currentScreen === 'login') {
      setScreen(resolveHomeScreen(user, onboarding));
    }
  }, [sessionReady, isAuthenticated, user, onboarding, currentScreen, setScreen]);

  // ── Onboarding routing guard ──
  // An applicant (ADMIN whose restaurant is not ACTIVE yet) is confined to the
  // wizard — any POS screen redirects back to onboarding. An ACTIVE account
  // (or any non-applicant) that somehow lands on the onboarding screen is sent
  // to their normal home screen. Frontend guarding is UX only; the backend
  // auth middlewares remain the authoritative access boundary.
  useEffect(() => {
    if (!sessionReady || !isAuthenticated || !user) return;
    if (currentScreen === 'login') return;
    if (!isUnlocked) return;
    const applicant = isSelfServeOnboarding(onboarding);
    if (currentScreen === 'register') {
      setScreen(resolveHomeScreen(user, onboarding));
      return;
    }
    if (applicant && currentScreen !== 'onboarding') {
      setScreen('onboarding');
      return;
    }
    if (!applicant && currentScreen === 'onboarding') {
      setScreen(getDefaultScreenForRole(user.role));
    }
  }, [sessionReady, isAuthenticated, isUnlocked, user, onboarding, currentScreen, setScreen]);

  // ── Route Protection: Redirect if role lacks permission or module is disabled ──
  // Also re-checks whenever moduleVisibilityVersion increments (reactive to settings changes)
  useEffect(() => {
    if (isAuthenticated && isUnlocked && user && currentScreen !== 'login') {
      // Onboarding wizard + registration are gated by their own guard/render
      // branches (backend-status driven) — never re-routed as POS screens.
      if (currentScreen === 'onboarding' || currentScreen === 'register') return;
      const userRole = (user.role || '').toUpperCase();
      
      // SUPER_ADMIN screens are always allowed for SUPER_ADMIN role
      if (userRole === 'SUPER_ADMIN' && isSuperAdminScreen(currentScreen)) {
        return; // Allow all super admin screens
      }
      
      // Check role permission
      if (!canAccessScreen(userRole, currentScreen)) {
        const bestScreen = findBestAvailableScreen(settings, userRole, subscription);
        setScreen(bestScreen);
        return;
      }
      // Check business-mode applicability (e.g. POS Ordering blocked in Restaurant mode)
      if (!isScreenAllowedForBusinessMode(currentScreen, settings?.businessMode)) {
        const bestScreen = findBestAvailableScreen(settings, userRole, subscription);
        setScreen(bestScreen);
        return;
      }
      // §10: business-capability guard — checked BEFORE module visibility so
      // even an enabled toggle cannot expose a screen the business type
      // doesn't support (e.g. Kitchen Tickets for a supermarket).
      const requiredCapability = SCREEN_BUSINESS_CAPABILITY[currentScreen];
      // §7: BASIC_POS food businesses never get the Kitchen Tickets screen.
      if (BASIC_POS_SCREENS.includes(currentScreen) && isBasicPosFoodBusiness(settings?.businessType)) {
        const bestScreen = findBestAvailableScreen(settings, userRole, subscription);
        setScreen(bestScreen);
        return;
      }
      // §12: Active Orders is hidden for a BASIC_POS food business running in
      // Quick Billing mode (enableCounterSale ON) — no production workflow.
      // Restaurants and BASIC_POS production tenants pass through. The same
      // centralized predicate drives the Sidebar, this guard and the POS mode
      // resolution — they can never disagree.
      if (currentScreen === 'active_orders') {
        const caps = settings?.capabilities || getBusinessCapabilities(settings?.businessType);
        const isBasicPos = isBasicPosFoodBusiness(settings?.businessType);
        const productionHidden = isBasicPos && !isBasicPosProductionMode(settings);
        if (caps.kitchen === false || settings?.enableActiveOrders === false || productionHidden) {
          const bestScreen = findBestAvailableScreen(settings, userRole, subscription);
          setScreen(bestScreen);
          return;
        }
      }
      if (requiredCapability) {
        const caps = settings?.capabilities || getBusinessCapabilities(settings?.businessType);
        if (caps[requiredCapability] === false) {
          const bestScreen = findBestAvailableScreen(settings, userRole, subscription);
          setScreen(bestScreen);
          return;
        }
      }
      // Check module visibility setting
      const settingKey = SCREEN_TO_SETTING[currentScreen];
      if (settingKey && settings[settingKey] === false) {
        const bestScreen = findBestAvailableScreen(settings, userRole, subscription);
        setScreen(bestScreen);
        return;
      }
      // Check plan feature access
      const requiredFeature = SCREEN_FEATURES[currentScreen];
      if (requiredFeature && !hasFeature(subscription, requiredFeature)) {
        const bestScreen = findBestAvailableScreen(settings, userRole, subscription);
        setScreen(bestScreen);
      }
    }
  }, [currentScreen, isAuthenticated, isUnlocked, user, subscription, setScreen, settings, moduleVisibilityVersion]);

  // ── Expired-subscription guard (server-side enforcement, mirrored in the UI):
  // when the subscription is expired the POS is locked. The ADMIN is kept on
  // Subscription & Billing so they can renew; staff roles get the expired notice
  // screen instead of a broken page. ──
  useEffect(() => {
    if (!isAuthenticated || !isUnlocked || !user || currentScreen === 'login') return;
    if ((user.role || '').toUpperCase() === 'SUPER_ADMIN') return;
    const expired =
      subscription?.status === 'EXPIRED' ||
      (typeof subscription?.daysRemaining === 'number' && subscription.daysRemaining <= 0);
    if (!expired) return;
    if ((user.role || '').toUpperCase() === 'ADMIN') {
      if (currentScreen !== 'subscription') setScreen('subscription');
    } else if (currentScreen !== 'expired_locked') {
      setScreen('expired_locked');
    }
  }, [isAuthenticated, isUnlocked, user, subscription, currentScreen, setScreen]);

  // ── Show loading spinner while session is being restored ──
  if (!sessionReady) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-[#16A34A] mx-auto mb-3" />
          <p className="text-xs font-semibold text-slate-400">Restoring session...</p>
        </div>
      </div>
    );
  }

  // ── Forced first-login password change ──
  // Users provisioned with an emailed temporary password (mustChangePassword,
  // set by the backend and mirrored on login/profile responses) MUST change it
  // before anything else renders. The backend independently refuses every
  // other route until the change is done — this UI is a mirror, not the gate.
  if (isAuthenticated && isUnlocked && user?.mustChangePassword) {
    return <ForceChangePasswordPage />;
  }

  // Show lock screen if terminal is locked but user is authenticated (token exists)
  if (!isUnlocked && isAuthenticated) {
    return <LockScreen />;
  }

  // Show login if not unlocked and not authenticated. "Create New Account"
  // renders the public registration screen instead (also pre-auth).
  if (!isUnlocked) {
    if (currentScreen === 'register') return <RegisterPage />;
    return <LoginPage />;
  }

  // ── Self-serve onboarding wizard — standalone (no POS shell) ──
  // `onboarding` here comes from authStore (login/profile). The auth store
  // sanitizes payloads: a non-null value is ALWAYS a genuine in-progress
  // self-serve application (selfServe restaurant + non-ACTIVE lifecycle
  // state). A normal/ACTIVE POS user therefore never renders the wizard and
  // never triggers /onboarding/status polling — the root cause of the 403
  // "Could not load your application" loop.
  const applicant = !!user && isSelfServeOnboarding(onboarding);
  if (currentScreen === 'onboarding') {
    if (applicant) return <OnboardingFlow />;
    // Non-applicant transiently on the wizard screen — show their normal home
    // (the routing-guard effect below redirects to the role's home screen).
    return <DashboardPage />;
  }

  // Route protection: check if current screen is allowed for this role
  const userRole = (user?.role || '').toUpperCase();
  const isSuperAdmin = userRole === 'SUPER_ADMIN';
  
  // SUPER_ADMIN screens are always allowed for SUPER_ADMIN role
  const isSuperAdminRouting = isSuperAdmin && isSuperAdminScreen(currentScreen);
  // expired_locked is a system screen (not role-gated) — allowed for anyone
  const isScreenAllowed = isSuperAdminRouting || currentScreen === 'expired_locked' || (
    canAccessScreen(userRole, currentScreen) &&
    isScreenAllowedForBusinessMode(currentScreen, settings?.businessMode)
  );
  // Also check module visibility (e.g. order_taking blocked when enablePosOrdering=false)
  const moduleSettingKey = SCREEN_TO_SETTING[currentScreen];
  const isModuleEnabled = isSuperAdminRouting || !moduleSettingKey || settings[moduleSettingKey] !== false;

  // If screen is not allowed or module is disabled, show unauthorized page instead
  // But always allow login screen
  if (currentScreen !== 'login' && !(isScreenAllowed && isModuleEnabled)) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex select-none font-sans overflow-hidden">
        <Suspense fallback={null}>{isSuperAdmin ? <SuperAdminSidebar /> : <Sidebar />}</Suspense>
        <div className="flex-1 flex flex-col h-screen overflow-hidden min-w-0">
          <Header />
          <main className="flex-1 p-3 sm:p-5 overflow-y-auto bg-[#F8FAFC]">
            <UnauthorizedPage />
          </main>
        </div>
      </div>
    );
  }

  const ScreenComponent = ScreenRenderer[currentScreen] || DashboardPage;

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex select-none font-sans overflow-hidden">
      {!isSuperAdmin && (
        <>
          {/* TakeOrderWizard renders as modal overlay on all screens except
              new_order, where NewOrderPage renders it in full-screen page mode. */}
          {currentScreen !== 'new_order' && (
            <ErrorBoundary>
              <TakeOrderWizard />
            </ErrorBoundary>
          )}
          {/* Payment Overlay — renders on top of any screen when checkoutOrderId is set */}
          <BillingPage />
        </>
      )}
      <Suspense fallback={null}>{isSuperAdmin ? <SuperAdminSidebar /> : <Sidebar />}</Suspense>
      <div className="flex-1 flex flex-col h-screen overflow-hidden min-w-0">
        <Header />
        <main className="flex-1 p-3 sm:p-5 overflow-y-auto bg-[#F8FAFC]">
          {/* Lazy screens render inside ErrorBoundary so a chunk-load failure
              never blanks the app — it falls back to the error state. */}
          <ErrorBoundary>
            <Suspense fallback={<ScreenFallback />}>
              <ScreenComponent />
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>

      {/* API Error Banner */}
      {apiError && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-red-50 border border-red-200 rounded-xl shadow-lg px-4 py-3 flex items-center gap-2 text-xs text-red-700 font-semibold max-w-lg animate-slide-down">
          <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
          <span className="flex-1">{apiError}</span>
          <button
            onClick={clearApiError}
            className="p-1 hover:bg-red-100 rounded text-red-500 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Toast Notifications */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none select-none max-w-sm">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`p-3.5 rounded-xl shadow-xl border text-xs font-bold leading-relaxed flex items-start gap-2.5 pointer-events-auto animate-slide-up ${
              toast.type === 'print'
                ? 'bg-slate-900 text-white border-slate-950'
                : 'bg-emerald-50 text-emerald-900 border-emerald-200'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
            <p className="flex-1">{toast.message}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
