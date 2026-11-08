import API_BASE_URL from '../config/apiConfig';
import { getCurrentTenantSlug } from '../config/tenantConfig';

/**
 * Resolve the current browser hostname to a workspace (tenant).
 *
 * Uses plain fetch: this runs before login and must never depend on the auth
 * interceptors or on a stored token.
 */
export async function resolveTenant() {
  const slug = getCurrentTenantSlug();
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  const query = new URLSearchParams();
  if (host) query.set('host', host);
  if (slug) query.set('slug', slug);

  let response;
  try {
    response = await fetch(`${API_BASE_URL}/tenants/resolve?${query.toString()}`, {
      headers: slug ? { 'X-Tenant-Slug': slug } : undefined,
    });
  } catch {
    const error = new Error('Unable to reach the server. Check your connection and try again.');
    error.code = 'NETWORK';
    throw error;
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.success) {
    const error = new Error(
      payload?.message || 'Unable to load this workspace. Please try again.'
    );
    error.status = response.status;
    error.code = payload?.code || (response.ok ? 'TENANT_RESOLVE_FAILED' : 'HTTP_ERROR');
    error.tenant = payload?.data?.tenant || null;
    throw error;
  }

  return payload.data || { mode: 'platform', slug: null, tenant: null };
}

export default { resolveTenant };
