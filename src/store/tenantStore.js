import { create } from 'zustand';
import { resolveTenant } from '../api/tenant.api';
import { getCurrentTenantSlug, resolveTenantHost } from '../config/tenantConfig';

/**
 * Current workspace (tenant) state.
 *
 * `status` is one of: idle | loading | ready | error.
 * On a platform host (the root domain, or localhost) `tenant` stays null and the app
 * behaves exactly as before (single-workspace deployments keep working).
 */
export const useTenantStore = create((set, get) => ({
  status: 'idle',
  mode: 'platform',
  slug: getCurrentTenantSlug(),
  tenant: null,
  error: null,
  errorCode: null,
  loadedAt: null,

  loadTenant: async ({ force = false } = {}) => {
    const current = get();
    if (current.status === 'loading') return;
    if (!force && current.status === 'ready') return;

    const hostContext =
      typeof window !== 'undefined'
        ? resolveTenantHost(window.location.hostname)
        : { mode: 'platform', slug: null };

    set({
      status: 'loading',
      mode: hostContext.mode,
      slug: getCurrentTenantSlug(),
      error: null,
      errorCode: null,
    });

    try {
      const data = await resolveTenant();
      set({
        status: 'ready',
        mode: data?.mode || 'platform',
        slug: data?.slug || null,
        tenant: data?.tenant || null,
        error: null,
        errorCode: null,
        loadedAt: Date.now(),
      });
    } catch (err) {
      set({
        status: 'error',
        mode: hostContext.mode,
        slug: getCurrentTenantSlug(),
        tenant: err?.tenant || null,
        error: err?.message || 'Unable to load this workspace.',
        errorCode: err?.code || 'TENANT_RESOLVE_FAILED',
        loadedAt: Date.now(),
      });
    }
  },
}));

export default useTenantStore;
