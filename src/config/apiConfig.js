/**
 * Backend API base URL resolution (Part 12 — mixed content).
 *
 * 1. VITE_API_URL wins when set (build-time configuration).
 * 2. Otherwise the dev fallback is http://localhost:5001/api.
 *
 * MIXED CONTENT GUARD: when the app itself is served over HTTPS, an http://
 * API base URL is upgraded to https:// automatically. This fixes the exact
 * request that triggered "Mixed Content: The page at 'https://…' was loaded
 * over HTTPS, but requested an insecure resource" without disabling any
 * browser security. Local http development is unaffected (page is http://).
 */
const RAW_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

function resolveApiBaseUrl() {
  let url = String(RAW_BASE_URL).trim();
  const pageIsHttps = typeof window !== 'undefined' && window.location?.protocol === 'https:';
  if (pageIsHttps && url.startsWith('http://')) {
    const upgraded = `https://${url.slice('http://'.length)}`;
    // One-time console warning so misconfigured deployments are discoverable.
    if (typeof console !== 'undefined') {
      console.warn(
        `[apiConfig] VITE_API_URL was "${url}" but the app is served over HTTPS — ` +
        `upgrading API base URL to "${upgraded}" to prevent mixed-content blocking. ` +
        `Set VITE_API_URL to an https:// URL at build time to silence this warning.`
      );
    }
    url = upgraded;
  }
  return url;
}

const API_BASE_URL = resolveApiBaseUrl();

export default API_BASE_URL;
