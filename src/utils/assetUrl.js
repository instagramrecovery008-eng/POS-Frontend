import API_BASE_URL from '../config/apiConfig';

/**
 * Resolve a backend-hosted asset path to an absolute URL.
 *
 * Uploaded files (restaurant logos, product logos, menu images) are stored in
 * PostgreSQL as server paths such as `/uploads/products/logo-3-1712.png`. The
 * SPA is served from a different origin than the API (`<root-domain>` vs
 * `api.<root-domain>`, or `localhost:3000` vs `localhost:5001`), so rendering the
 * raw path would request the file from the SPA host and show a broken image.
 *
 * - absolute http(s), protocol-relative, blob: and data: URLs pass through
 * - `/uploads/...` is resolved against the API origin (the API base URL with
 *   its trailing `/api` segment removed)
 * - anything else (bundled asset paths like `/qwikout-logo.png`) is unchanged
 */
export function resolveAssetUrl(path) {
  if (!path || typeof path !== 'string') return '';
  const value = path.trim();
  if (!value) return '';

  if (/^(https?:)?\/\//i.test(value)) return value;
  if (/^(blob:|data:)/i.test(value)) return value;

  if (value.startsWith('/uploads/')) {
    const origin = String(API_BASE_URL).replace(/\/api\/?$/, '');
    return `${origin}${value}`;
  }

  return value;
}

export default resolveAssetUrl;
