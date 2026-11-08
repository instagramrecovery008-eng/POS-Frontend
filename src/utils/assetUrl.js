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

/**
 * Smaller, faster version of a product image.
 *
 * Cloudinary-hosted images (the app's image storage) are served through its
 * on-the-fly transformation: automatic format (WebP/AVIF where supported),
 * automatic quality, and a width cap — typically a fraction of the original
 * bytes, and cached by the CDN. Any other URL (local /uploads, data:, blob:)
 * is returned unchanged.
 */
export function optimizedImageUrl(url, width = 400) {
  const resolved = resolveAssetUrl(url);
  const m = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/.exec(resolved);
  if (!m) return resolved;
  const rest = m[2];
  // Already carries a transformation segment (e.g. "w_300,c_fill/…")? Leave it alone.
  // A version segment ("v1794150831/…") is not a transformation.
  if (/^[a-z]{1,3}_[^/]+\//.test(rest)) return resolved;
  return `${m[1]}f_auto,q_auto,w_${Math.round(width)},c_limit/${rest}`;
}

export default resolveAssetUrl;
