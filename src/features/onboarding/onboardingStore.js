import { create } from 'zustand';
import { onboardingApi } from '../../api/onboarding.api';

/**
 * Zustand store for the self-serve onboarding wizard.
 *
 * Holds the canonical backend payload (account status/steps, restaurant,
 * documents, legal, selected plan, payment) plus the static public flow
 * config (business types / document types / policy versions). Every mutation
 * in the wizard goes through the backend and then calls refresh() so the
 * backend status always overrides any stale local state.
 */
const useOnboardingStore = create((set, get) => ({
  // Canonical GET /onboarding/status payload.
  payload: null,
  // Public GET /onboarding/config + /onboarding/plans caches.
  config: null,
  plans: null,
  loading: false,
  error: null,

  setPayload: (payload) => set({ payload: payload || null, error: null }),

  clear: () => set({ payload: null, config: null, plans: null, error: null }),

  loadConfig: async () => {
    if (get().config) return get().config;
    try {
      const resp = await onboardingApi.getConfig();
      const config = resp && resp.data ? resp.data : resp;
      set({ config });
      return config;
    } catch (e) {
      set({ error: e.message || 'Failed to load onboarding configuration' });
      return null;
    }
  },

  loadPlans: async () => {
    try {
      // The stored businessType (when the application exists) scopes the list
      // server-side. Before business details are saved the full active list
      // is returned and the wizard filters it client-side for display.
      const businessType = get().payload?.restaurant?.businessType || null;
      const resp = await onboardingApi.getPlans(businessType);
      const plans = resp && resp.data ? resp.data : resp;
      set({ plans: Array.isArray(plans) ? plans : [] });
      return plans;
    } catch (e) {
      set({ error: e.message || 'Failed to load plans' });
      return [];
    }
  },

  /**
   * Refresh the canonical payload from the backend. Returns the payload or
   * null on failure. Used after every wizard action and by the review/provisioning
   * poller — the backend is always the source of truth.
   */
  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const resp = await onboardingApi.getStatus();
      const payload = resp && resp.data ? resp.data : resp;
      set({ payload: payload || null, loading: false });
      return payload || null;
    } catch (e) {
      set({ loading: false, error: e.message || 'Failed to load onboarding status' });
      return null;
    }
  },
}));

export default useOnboardingStore;
