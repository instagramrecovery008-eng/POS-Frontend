/**
 * Infinixo Technologies — company identity + KlarGo POS product identity shown
 * on the POS login screen.
 *
 * Everything here is CONFIGURABLE, not invented:
 *  - `logo`     — the real Infinixo Technologies logo asset
 *                 (frontend/public/infinixo-logo.png). `null` falls back to a
 *                 text wordmark so the layout never breaks.
 *  - `website`  — the company's verified public site.
 *  - `tagline`  — company-level line shown in the attribution footer.
 *  - `product*` — KlarGo POS identity (the product the visitor signs into).
 *                 The product is the PRIMARY identity of the left panel; the
 *                 company attribution is secondary and sits at the bottom.
 *  - `headline` / `description` — product-level copy for the brand panel.
 *  - `products` — fallback STATIC product entries used ONLY if the backend
 *                 product registry is unreachable. The live list comes from
 *                 GET /products/public (Super-Admin-managed). Only verified
 *                 Infinixo entries belong here — no placeholders, no fake URLs.
 */
export const COMPANY = {
  name: 'Infinixo Technologies',
  website: 'https://infinixotech.com',
  logo: '/infinixo-logo.png',
  // Company attribution shown at the BOTTOM of the login panel.
  attribution: 'A product by Infinixo Technologies',
  tagline: 'Technology that moves your business forward.',

  // ── Product identity (primary) ──
  productName: 'KlarGo POS',
  productSubtitle: 'Smart restaurant operations, billing, inventory and team management',
  headline: 'Your restaurant operations, all in one place.',
  description:
    'Orders, billing, tables, kitchen tickets, inventory and reports — managed from one workspace.',

  productUrl: '/infinixo-logo.png',
  products: [],
};
