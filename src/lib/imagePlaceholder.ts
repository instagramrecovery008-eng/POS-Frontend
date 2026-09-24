/**
 * Generic placeholder for menu items without an image.
 *
 * Deliberately an inline data-URI SVG — zero network requests, no third-party
 * host (no unsplash/googleusercontent dependency). Matches the "generic
 * placeholder" behaviour of the previous UI without external URLs.
 */
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f8fafc"/>
      <stop offset="1" stop-color="#e2e8f0"/>
    </linearGradient>
  </defs>
  <rect width="600" height="400" fill="url(#g)"/>
  <g opacity="0.9">
    <ellipse cx="300" cy="235" rx="120" ry="34" fill="#cbd5e1"/>
    <ellipse cx="300" cy="178" rx="96" ry="58" fill="#94a3b8"/>
    <ellipse cx="300" cy="178" rx="66" ry="46" fill="#b6c2cf"/>
    <circle cx="262" cy="150" r="9" fill="#e2e8f0"/>
    <circle cx="338" cy="150" r="9" fill="#e2e8f0"/>
    <path d="M278 204 Q300 222 322 204" stroke="#64748b" stroke-width="6" fill="none" stroke-linecap="round"/>
  </g>
  <text x="300" y="330" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#94a3b8" letter-spacing="1">NO IMAGE</text>
</svg>`;

export const PLACEHOLDER_IMAGE = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
