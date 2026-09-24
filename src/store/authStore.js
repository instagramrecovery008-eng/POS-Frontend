import { create } from 'zustand';
import { authApi } from '../api/auth.api';
import { subscriptionApi } from '../api/subscription.api';
import { userApi } from '../api/user.api';
import {
  canAccessScreen,
  canPerformAction,
  getAccessibleScreens,
  getRoleDisplayName,
  getDefaultScreenForRole,
  hasFeature,
  resolveStaffPermissions,
  hasStaffPermission,
  screenPermissionKey,
} from '../utils/permissions';
import { useSettingsStore } from './settingsStore';
import { isSelfServeOnboarding } from '../features/onboarding/onboarding.lib';

/**
 * Keep ONLY genuine self-serve applicant payloads in auth state.
 *
 * The backend may attach an `onboarding` object to login/register/profile
 * responses; for a normal (non-self-serve) POS account that payload is at
 * best irrelevant and at worst harmful — the app shell treats a non-null
 * applicant payload as "route this user into the onboarding wizard", which is
 * exactly the bug that sent approved POS users into a 403 loop against
 * /onboarding/status. Normalizing here makes the auth store authoritative:
 * an approved/normal user NEVER carries an applicant payload.
 */
function sanitizeOnboardingPayload(onboarding) {
  return isSelfServeOnboarding(onboarding) ? onboarding : null;
}

// ─── Persistence keys ───────────────────────────────────────────────────────
const STORAGE_KEY_TOKEN = 'pos_token';
const STORAGE_KEY_USER = 'pos_user';
const STORAGE_KEY_FAILED_ATTEMPTS = 'pos_failed_unlock_attempts';
const STORAGE_KEY_LOCKOUT_UNTIL = 'pos_lockout_until';
const STORAGE_KEY_PREVIOUS_SCREEN = 'pos_previous_screen';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 minutes

/** Load serialized user from localStorage (returns null on parse failure) */
function loadStoredUser() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_USER);
    return raw ? JSON.parse(raw) : null;
  } catch {
    localStorage.removeItem(STORAGE_KEY_USER);
    return null;
  }
}

/** Load failed unlock attempts from localStorage */
function loadFailedAttempts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_FAILED_ATTEMPTS);
    return raw ? parseInt(raw, 10) : 0;
  } catch {
    return 0;
  }
}

/** Load lockout expiration from localStorage */
function loadLockoutUntil() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LOCKOUT_UNTIL);
    return raw ? parseInt(raw, 10) : 0;
  } catch {
    return 0;
  }
}

// ─── Idempotency guard for StrictMode ───────────────────────────────────────
let restoreSessionPromise = null;

/**
 * Sync plan-derived feature entitlements into the settings store.
 * Part 11: `barcodeScannerAvailable` = the subscription snapshot includes the
 * barcode_scanner plan feature. The tenant toggle
 * (settings.barcodeScannerEnabled) is separate and lives in settingsStore.
 */
function syncFeatureEntitlements(subscription) {
  try {
    useSettingsStore.setState({
      barcodeScannerAvailable: hasFeature(subscription, 'barcode_scanner'),
    });
  } catch { /* settings store not ready — defaults to false (safe) */ }
}

const useAuthStore = create((set, get) => ({
  // State
  user: loadStoredUser(),
  mustChangePassword: false, // set from login/profile responses (backend-authoritative)
  subscription: null, // live subscription snapshot (plan, limits, features) — never cached, refreshed at login/profile
  // Self-serve onboarding payload returned by /auth/login|register|profile for
  // ADMIN applicants whose restaurant is not ACTIVE yet. Backend status is the
  // source of truth for every step decision in the onboarding wizard.
  onboarding: null,
  token: localStorage.getItem(STORAGE_KEY_TOKEN) || null,
  isAuthenticated: !!localStorage.getItem(STORAGE_KEY_TOKEN),
  isUnlocked: !!localStorage.getItem(STORAGE_KEY_TOKEN),
  loading: false,
  error: null,
  sessionReady: false, // true after restoreSession completes

  // Unlock security state
  failedUnlockAttempts: loadFailedAttempts(),
  lockoutUntil: loadLockoutUntil(),
  previousScreen: localStorage.getItem(STORAGE_KEY_PREVIOUS_SCREEN) || 'dashboard',

  // ── Role-based permission helpers (computed from user.role) ──

  /**
   * Per-staff permission state (Part 23). Loaded from /users/me/permissions
   * after login for tenant staff. ADMIN/SUPER_ADMIN resolve to full access
   * without a fetch (Part 21) — they are never restricted.
   */
  staffPermissions: null, // { full, keys } | null (not loaded yet)
  staffDietaryAccess: null, // 'VEG_ONLY' | 'VEG_AND_NON_VEG' | null
  // Assigned order types from the Staff Roster ('TAKEAWAY'/'DINE_IN' list).
  // null = unrestricted (no assignment rows) → all order types allowed.
  staffAssignedOrderTypes: null,
  staffPermissionsLoading: false,

  /** Load the current user's effective permissions (idempotent per session). */
  loadStaffPermissions: async () => {
    const { user, staffPermissions, staffPermissionsLoading } = get();
    if (!user) return null;
    const role = String(user.role || '').toUpperCase();
    if (role === 'ADMIN' || role === 'SUPER_ADMIN') {
      set({ staffPermissions: { full: true, keys: new Set() }, staffDietaryAccess: 'VEG_AND_NON_VEG', staffAssignedOrderTypes: null });
      return get().staffPermissions;
    }
    if (staffPermissions || staffPermissionsLoading) return staffPermissions;
    set({ staffPermissionsLoading: true });
    try {
      const resp = await userApi.getMyPermissions();
      const data = resp?.data || resp;
      const effective = resolveStaffPermissions(
        role,
        data.effectivePermissions
          ? data.effectivePermissions.map((k) => ({ permissionKey: k, enabled: true }))
          : data.overrides || [],
        {},
        null
      );
      set({
        staffPermissions: effective,
        staffDietaryAccess: data.dietaryAccess || 'VEG_AND_NON_VEG',
        staffAssignedOrderTypes: Array.isArray(data.assignedOrderTypes) ? data.assignedOrderTypes : null,
        staffPermissionsLoading: false,
      });
      return effective;
    } catch {
      // Fail CLOSED would lock existing staff out on a transient error — fail
      // OPEN to the role defaults instead (backend still enforces per route).
      set({ staffPermissions: resolveStaffPermissions(role), staffDietaryAccess: 'VEG_AND_NON_VEG', staffAssignedOrderTypes: null, staffPermissionsLoading: false });
      return get().staffPermissions;
    }
  },

  /** Has the current user an effective staff permission (screen or action)? */
  hasPermission: (key) => {
    const { user, staffPermissions } = get();
    if (!user) return false;
    const role = String(user.role || '').toUpperCase();
    if (role === 'ADMIN' || role === 'SUPER_ADMIN') return true;
    if (!staffPermissions) return canAccessScreen(role, screenPermissionKey(key) || '') || canPerformAction(role, key);
    return hasStaffPermission(staffPermissions, key);
  },

  /** Can the current user open a screen (role + staff permission)? */
  canAccessScreen: (screen) => {
    const { user, staffPermissions } = get();
    if (!user) return false;
    if (!canAccessScreen(user.role, screen)) return false;
    const key = screenPermissionKey(screen);
    if (!key) return true; // screen not staff-configurable → role check only
    const role = String(user.role || '').toUpperCase();
    if (role === 'ADMIN' || role === 'SUPER_ADMIN') return true;
    if (!staffPermissions) return true; // not loaded yet → role default
    return hasStaffPermission(staffPermissions, key);
  },

  /** Check if current user can perform an action */
  can: (action) => {
    const { user } = get();
    if (!user) return false;
    return canPerformAction(user.role, action);
  },

  /** Get all screens the current user can access */
  getAccessibleScreens: () => {
    const { user } = get();
    if (!user) return [];
    return getAccessibleScreens(user.role);
  },

  /** Get the user's role display name */
  getRoleDisplay: () => {
    const { user } = get();
    if (!user) return '';
    return getRoleDisplayName(user.role);
  },

  /** Get the default landing screen for the current user's role */
  getDefaultScreen: () => {
    const { user } = get();
    if (!user) return 'dashboard';
    return getDefaultScreenForRole(user.role);
  },

  /**
   * Check whether the current restaurant's plan includes a feature.
   * SUPER_ADMIN always has access to everything.
   */
  hasFeature: (feature) => {
    const { user, subscription } = get();
    if (!user) return false;
    if (user.role === 'SUPER_ADMIN') return true;
    return hasFeature(subscription, feature);
  },

  /** Check if user has admin-level access (SUPER_ADMIN or ADMIN) */
  isAdmin: () => {
    const { user } = get();
    if (!user) return false;
    const role = user.role.toUpperCase();
    return role === 'SUPER_ADMIN' || role === 'ADMIN';
  },

  /** Check if user can manage staff (SUPER_ADMIN, ADMIN, MANAGER) */
  canManageStaff: () => {
    const { user } = get();
    if (!user) return false;
    const role = user.role.toUpperCase();
    return ['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(role);
  },

  /** Check if user can manage menu (SUPER_ADMIN, ADMIN, MANAGER) */
  canManageMenu: () => {
    const { user } = get();
    if (!user) return false;
    const role = user.role.toUpperCase();
    return ['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(role);
  },

  /** Get remaining lockout time in seconds (0 if not locked out) */
  getLockoutRemaining: () => {
    const { lockoutUntil } = get();
    if (!lockoutUntil) return 0;
    const remaining = Math.ceil((lockoutUntil - Date.now()) / 1000);
    return Math.max(0, remaining);
  },

  /** Check if currently locked out */
  isLockedOut: () => {
    const { lockoutUntil } = get();
    return lockoutUntil > 0 && Date.now() < lockoutUntil;
  },

  // ── Auth Actions ──

  /** Store the onboarding payload handed back by the backend (or clear it). */
  setOnboarding: (onboarding) => set({ onboarding: onboarding || null }),

  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const resp = await authApi.login(email, password);
      if (resp.success && resp.token) {
        localStorage.setItem(STORAGE_KEY_TOKEN, resp.token);
        if (resp.user) {
          localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(resp.user));
        }
        set({
          token: resp.token,
          user: resp.user,
          // First-login forced password change flag comes from the login body
          // (mustChangePassword, backend-authoritative) or the user row.
          mustChangePassword: resp.mustChangePassword === true || resp.user?.mustChangePassword === true,
          subscription: resp.subscription || null,
          onboarding: sanitizeOnboardingPayload(resp.onboarding),
          isAuthenticated: true,
          isUnlocked: true,
          loading: false,
          sessionReady: true,
        });
        syncFeatureEntitlements(resp.subscription || null);
        // Load per-staff permissions for this session (fire and forget).
        get().loadStaffPermissions().catch(() => {});
        return true;
      }
      // success:false with an applicant code — the credentials are correct but
      // the application is pending / rejected, so the applicant must NOT get a
      // POS session. Surface the backend's message (APPLICATION_PENDING /
      // APPLICATION_REJECTED) instead of a generic "Invalid credentials".
      if (resp.code === 'APPLICATION_PENDING' || resp.code === 'APPLICATION_REJECTED') {
        const pendingError = new Error(resp.message || 'Your application is pending approval.');
        pendingError.code = resp.code;
        pendingError.status = 403;
        set({ error: pendingError.message, loading: false });
        throw pendingError;
      }
      set({ error: 'Invalid credentials', loading: false });
      return false;
    } catch (e) {
      // Preserve HTTP status so callers can distinguish auth errors from server errors
      const authError = new Error(e.message || 'Login failed');
      authError.status = e.status;
      set({ error: authError.message, loading: false });
      throw authError;
    }
  },

  /**
   * Public self-serve registration. The backend always creates a role=ADMIN
   * account with no restaurant and returns an onboarding payload in REGISTERED
   * state; the caller routes into the onboarding wizard afterwards.
   */
  register: async (data) => {
    set({ loading: true, error: null });
    try {
      const resp = await authApi.register(data);
      if (resp.success && resp.token) {
        localStorage.setItem(STORAGE_KEY_TOKEN, resp.token);
        if (resp.user) {
          localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(resp.user));
        }
        set({
          token: resp.token,
          user: resp.user,
          subscription: resp.subscription || null,
          onboarding: sanitizeOnboardingPayload(resp.onboarding),
          isAuthenticated: true,
          isUnlocked: true,
          loading: false,
          sessionReady: true,
        });
        return true;
      }
      set({ error: 'Registration failed', loading: false });
      return false;
    } catch (e) {
      // Preserve HTTP status (400 duplicate email/phone, network, server …)
      const authError = new Error(e.message || 'Registration failed');
      authError.status = e.status;
      set({ error: authError.message, loading: false });
      throw authError;
    }
  },

  logout: () => {
    localStorage.removeItem(STORAGE_KEY_TOKEN);
    localStorage.removeItem(STORAGE_KEY_USER);
    localStorage.removeItem(STORAGE_KEY_FAILED_ATTEMPTS);
    localStorage.removeItem(STORAGE_KEY_LOCKOUT_UNTIL);
    localStorage.removeItem(STORAGE_KEY_PREVIOUS_SCREEN);
    // Reset idempotency guard so restoreSession works again after re-login
    restoreSessionPromise = null;
    set({
      user: null,
      token: null,
      subscription: null,
      onboarding: null,
      mustChangePassword: false,
      isAuthenticated: false,
      isUnlocked: false,
      // Clear per-staff permission state — the next login reloads it
      staffPermissions: null,
      staffDietaryAccess: null,
      sessionReady: true,
      failedUnlockAttempts: 0,
      lockoutUntil: 0,
    });
    // Plan entitlements are revoked with the session (Part 11)
    syncFeatureEntitlements(null);
  },

  /**
   * Called once on app boot to validate the stored JWT and rehydrate user.
   * IDEMPOTENT: Under StrictMode (double-mount), the second call returns the
   * same promise as the first, ensuring only ONE /api/auth/profile request.
   */
  restoreSession: async () => {
    const token = localStorage.getItem(STORAGE_KEY_TOKEN);
    if (!token) {
      set({ sessionReady: true });
      return;
    }

    // If restoreSession is already in progress, return the existing promise.
    // This prevents duplicate API calls under StrictMode double-mounting.
    if (restoreSessionPromise) {
      return restoreSessionPromise;
    }

    restoreSessionPromise = (async () => {
      try {
        const resp = await authApi.profile();
        if (resp.success && resp.user) {
          localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(resp.user));
          set({
            user: resp.user,
            // Keep the flag fresh on rehydration — the user object carries
            // mustChangePassword straight from /auth/profile.
            mustChangePassword: resp.user?.mustChangePassword === true,
            subscription: resp.subscription || null,
            onboarding: sanitizeOnboardingPayload(resp.onboarding),
            token,
            isAuthenticated: true,
            isUnlocked: true,
            sessionReady: true,
          });
          syncFeatureEntitlements(resp.subscription || null);
          // Load per-staff permissions for the restored session (fire and
          // forget — resolveStaffPermissions fail-open keeps the role defaults).
          get().loadStaffPermissions().catch(() => {});
        } else {
          // Token invalid — force logout
          localStorage.removeItem(STORAGE_KEY_TOKEN);
          localStorage.removeItem(STORAGE_KEY_USER);
          set({
            user: null,
            token: null,
            subscription: null,
            onboarding: null,
            isAuthenticated: false,
            isUnlocked: false,
            sessionReady: true,
          });
        }
      } catch (e) {
        // Network error — keep stored state, user stays logged in
        set({ sessionReady: true });
      } finally {
        restoreSessionPromise = null;
      }
    })();

    return restoreSessionPromise;
  },

  /**
   * Re-fetch the profile + onboarding payload from the backend (used when the
   * applicant becomes ACTIVE so the same session can enter the POS). Returns
   * true when the profile refreshed successfully.
   */
  refreshProfile: async () => {
    try {
      const resp = await authApi.profile();
      if (resp.success && resp.user) {
        localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(resp.user));
        set({
          user: resp.user,
          subscription: resp.subscription || null,
          onboarding: sanitizeOnboardingPayload(resp.onboarding),
        });
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  },

  /**
   * Lock the terminal and save the current screen so it can be restored after unlock.
   */
  lockTerminal: (currentScreen) => {
    if (currentScreen) {
      localStorage.setItem(STORAGE_KEY_PREVIOUS_SCREEN, currentScreen);
      set({ previousScreen: currentScreen });
    }
    localStorage.removeItem(STORAGE_KEY_FAILED_ATTEMPTS);
    localStorage.removeItem(STORAGE_KEY_LOCKOUT_UNTIL);
    set({ isUnlocked: false, failedUnlockAttempts: 0, lockoutUntil: 0 });
  },

  unlockTerminal: () => {
    // Reset failed attempts on successful unlock
    localStorage.removeItem(STORAGE_KEY_FAILED_ATTEMPTS);
    localStorage.removeItem(STORAGE_KEY_LOCKOUT_UNTIL);
    set({
      isUnlocked: true,
      failedUnlockAttempts: 0,
      lockoutUntil: 0,
    });
  },

  /**
   * Verify password against the backend.
   * Returns { success: boolean, message?: string }
   */
  verifyPassword: async (password) => {
    const state = get();
    
    // Check lockout first
    if (state.isLockedOut()) {
      const remaining = state.getLockoutRemaining();
      return {
        success: false,
        message: `Too many failed attempts. Try again in ${Math.ceil(remaining / 60)} minute(s).`
      };
    }

    try {
      const resp = await authApi.verifyPassword(password);
      if (resp.success) {
        return { success: true };
      }
      return { success: false, message: resp.message || 'Invalid password' };
    } catch (e) {
      const errorMsg = e.message || 'Invalid password';
      
      // Increment failed attempts
      const newAttempts = state.failedUnlockAttempts + 1;
      localStorage.setItem(STORAGE_KEY_FAILED_ATTEMPTS, String(newAttempts));
      
      let lockoutUntil = 0;
      if (newAttempts >= MAX_FAILED_ATTEMPTS) {
        lockoutUntil = Date.now() + LOCKOUT_DURATION_MS;
        localStorage.setItem(STORAGE_KEY_LOCKOUT_UNTIL, String(lockoutUntil));
        set({ failedUnlockAttempts: newAttempts, lockoutUntil });
        return {
          success: false,
          message: `Too many failed attempts. Terminal locked for 5 minutes.`
        };
      }
      
      set({ failedUnlockAttempts: newAttempts });
      return {
        success: false,
        message: `${errorMsg} (${newAttempts}/${MAX_FAILED_ATTEMPTS} attempts)`
      };
    }
  },

  /**
   * Change the authenticated user's own password (self-service).
   * Verifies the current password on the backend, hashes the new one,
   * and records passwordChangedAt. The caller must then force a logout.
   * Returns { success: boolean, message?: string }
   */
  changePassword: async (currentPassword, newPassword) => {
    try {
      const resp = await authApi.changePassword(currentPassword, newPassword);
      if (resp.success) {
        return { success: true };
      }
      return { success: false, message: resp.message || 'Failed to change password' };
    } catch (e) {
      return { success: false, message: e.message || 'Failed to change password' };
    }
  },

  /**
   * Merge updated profile fields into the store + localStorage so the UI
   * updates immediately and survives a refresh — no logout required.
   * Used by the Super Admin Edit Profile flow.
   */
  updateProfile: (profile) => {
    const current = get().user || {};
    const updated = { ...current, ...profile };
        localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(updated));
        set({ user: updated });
  },

  clearError: () => set({ error: null }),

  /**
   * Re-fetch the live subscription snapshot from the backend and update the
   * store. Called after a successful subscription purchase so the header pill,
   * sidebar modules, route guards and feature checks all refresh immediately.
   * Returns true on success.
   */
  refreshSubscription: async () => {
    try {
      const resp = await subscriptionApi.refresh();
      if (resp.success && resp.data) {
        set({ subscription: resp.data });
        syncFeatureEntitlements(resp.data);
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  },
}));

export { MAX_FAILED_ATTEMPTS, LOCKOUT_DURATION_MS };
export default useAuthStore;
