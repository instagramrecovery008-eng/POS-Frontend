/**
 * Client-side tenant (workspace) detection.
 *
 * Mirrors the backend rules in `backend/src/utils/tenantHost.js`:
 *   klargopos.in          → platform
 *   admin.klargopos.in    → Super Admin portal
 *   grill.klargopos.in    → tenant "grill"
 *   grill.localhost:3000 → tenant "grill" in development
 *
 * The hostname is only a LOOKUP KEY. It is sent to the backend as a hint; the
 * backend resolves it against the restaurant registry and enforces membership
 * from the authenticated user's own restaurantId.
 */
const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};

export const PLATFORM_ROOT_DOMAIN = String(
  env.VITE_PLATFORM_ROOT_DOMAIN || 'klargopos.in'
)
  .trim()
  .toLowerCase()
  .replace(/^\.+|\.+$/g, '');

export const RESERVED_SUBDOMAINS = [
  'www', 'api', 'admin', 'app', 'mail', 'smtp', 'imap', 'support', 'status',
  'docs', 'help', 'billing', 'cdn', 'static', 'assets', 'img', 'images',
  'uploads', 'socket', 'ws',
];

export const MAX_SUBDOMAIN_LENGTH = 40;
const DEV_OVERRIDE_KEY = 'pos_tenant_override';

export function isValidSubdomainLabel(value) {
  if (typeof value !== 'string') return false;
  const label = value.trim().toLowerCase();
  if (!label || label.length > MAX_SUBDOMAIN_LENGTH) return false;
  return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label);
}

export function isReservedSubdomain(value) {
  return RESERVED_SUBDOMAINS.includes(String(value || '').trim().toLowerCase());
}

function normalizeHostname(hostname) {
  return String(hostname || '')
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .split('/')[0]
    .split('?')[0]
    .split(':')[0]
    .replace(/\.$/, '');
}

/**
 * @returns {{ mode: 'platform'|'admin'|'tenant'|'unknown', slug: string|null, host: string }}
 */
export function resolveTenantHost(hostname) {
  const host = normalizeHostname(hostname);
  if (!host) return { mode: 'platform', slug: null, host };

  if (host === PLATFORM_ROOT_DOMAIN || host === `www.${PLATFORM_ROOT_DOMAIN}`) {
    return { mode: 'platform', slug: null, host };
  }

  if (host.endsWith(`.${PLATFORM_ROOT_DOMAIN}`)) {
    const label = host.slice(0, -(PLATFORM_ROOT_DOMAIN.length + 1));
    if (!label || label.includes('.')) return { mode: 'unknown', slug: null, host };
    if (label === 'admin') return { mode: 'admin', slug: null, host };
    if (isReservedSubdomain(label)) return { mode: 'platform', slug: null, host };
    if (!isValidSubdomainLabel(label)) return { mode: 'unknown', slug: null, host };
    return { mode: 'tenant', slug: label, host };
  }

  if (host === 'localhost' || host === '127.0.0.1') {
    return { mode: 'platform', slug: null, host };
  }

  if (host.endsWith('.localhost')) {
    const label = host.slice(0, -'.localhost'.length);
    if (isValidSubdomainLabel(label) && !isReservedSubdomain(label)) {
      return { mode: 'tenant', slug: label, host };
    }
    return { mode: 'unknown', slug: null, host };
  }

  // IP / unknown domain (e.g. a preview deployment) — treated as platform.
  return { mode: 'platform', slug: null, host };
}

/**
 * Development-only override: `?tenant=grill` on localhost lets a developer
 * preview a workspace without DNS. Never applied to real domains.
 */
export function getTenantOverride() {
  if (typeof window === 'undefined') return null;
  const { mode, host } = resolveTenantHost(window.location.hostname);
  const isLocal = mode === 'platform' && (host === 'localhost' || host === '127.0.0.1' || !host);
  if (!isLocal) return null;

  try {
    const fromQuery = new URLSearchParams(window.location.search).get('tenant');
    if (fromQuery) {
      const clean = fromQuery.trim().toLowerCase();
      if (isValidSubdomainLabel(clean) && !isReservedSubdomain(clean)) {
        window.sessionStorage.setItem(DEV_OVERRIDE_KEY, clean);
        return clean;
      }
      return null;
    }
    const stored = window.sessionStorage.getItem(DEV_OVERRIDE_KEY);
    return stored && isValidSubdomainLabel(stored) && !isReservedSubdomain(stored) ? stored : null;
  } catch {
    return null;
  }
}

/**
 * The tenant slug to send on API requests. Synchronous (no network) so the
 * axios interceptor can attach it on the very first request.
 */
export function getCurrentTenantSlug() {
  if (typeof window === 'undefined') return null;
  const { slug } = resolveTenantHost(window.location.hostname);
  return slug || getTenantOverride();
}

export function getPlatformOrigin() {
  if (typeof window === 'undefined') return `https://${PLATFORM_ROOT_DOMAIN}`;
  const { host } = resolveTenantHost(window.location.hostname);
  const isLocal = host === 'localhost' || host === '127.0.0.1';
  if (isLocal) return `http://localhost${window.location.port ? `:${window.location.port}` : ''}`;
  return `https://${PLATFORM_ROOT_DOMAIN}`;
}

export function getTenantOrigin(slug) {
  const clean = String(slug || '').trim().toLowerCase();
  if (!isValidSubdomainLabel(clean) || isReservedSubdomain(clean)) return getPlatformOrigin();
  return `https://${clean}.${PLATFORM_ROOT_DOMAIN}`;
}
