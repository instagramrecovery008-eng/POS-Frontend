/**
 * Neutral placeholder for products without an image (or whose image failed to load).
 *
 * Deliberately an inline data-URI SVG — zero network requests, no third-party
 * host. Industry-neutral on purpose (a plain package outline, no food or
 * restaurant imagery) so it is appropriate for any kind of business.
 */
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="450" viewBox="0 0 600 450">
  <rect width="600" height="450" fill="#f8fafc"/>
  <g fill="none" stroke="#94a3b8" stroke-width="10" stroke-linecap="round" stroke-linejoin="round">
    <path d="M300 120 L390 165 V265 L300 310 L210 265 V165 Z"/>
    <path d="M210 165 L300 210 L390 165"/>
    <path d="M300 210 V310"/>
  </g>
  <text x="300" y="372" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700" fill="#94a3b8" letter-spacing="2">NO IMAGE</text>
</svg>`;

export const PLACEHOLDER_IMAGE = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
