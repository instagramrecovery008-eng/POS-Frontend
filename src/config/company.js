/**
 * Infinixo Technologies — company identity + QWIKOUT POS product identity.
 *
 * This file is the SINGLE SOURCE OF TRUTH for the application brand:
 *  - `BRAND`    — product name, logo asset and accessible alternative text.
 *  - `COMPANY`  — company identity (logo, website, attribution) and the
 *                 product-level marketing copy used by the login / onboarding
 *                 brand panels.
 *
 * The official logo (v3 blue + purple wordmark with the POS terminal and bill)
 * lives at `frontend/public/qwikout-logo.png` and is reused everywhere through
 * the shared <BrandLogo /> component — never duplicated and never recreated
 * with CSS text. The compact icon lives at `frontend/public/qwikout-icon.png`
 * and drives the favicon / touch icon in `index.html`.
 */
export const BRAND = {
  // Exact brand spelling — QWIKOUT (not "QuickOut"/"Qwik Out").
  name: 'QWIKOUT POS',
  shortName: 'QWIKOUT',
  descriptor: 'Point of Sales',
  company: 'Infinixo Technologies',
  // Frontend public asset; the same file is used on every screen.
  // Source pack (not served): brand-assets/qwikout-logo-pack-v3/
  //   public/qwikout-logo.png ← qwikout-logo-1024-transparent.png
  //   public/qwikout-icon.png ← qwikout-icon-192.png
  logo: '/qwikout-logo.png',
  // Square transparent mark — used where the wordmark is too wide (collapsed
  // navigation rails, compact badges) so it can sit on a dark surface.
  icon: '/qwikout-icon-transparent.png',
  // Compact opaque mark — browser favicon / app icon only, never the panel wordmark.
  favicon: '/qwikout-icon.png',
  logoAlt: 'QWIKOUT POS — Point of Sales by Infinixo Technologies',
};

export const COMPANY = {
  name: BRAND.company,
  website: 'https://infinixotech.com',
  logo: '/infinixo-logo.png',
  // Company attribution shown at the BOTTOM of the login panel.
  attribution: 'A product by Infinixo Technologies',
  tagline: 'Technology that moves your business forward.',

  // ── Product identity (primary) ──
  productName: BRAND.name,
  productSubtitle: 'Point of Sales by Infinixo Technologies',
  headline: 'Every Sale, Every Table, One Workspace.',
  description:
    'Orders, billing, tables, kitchen tickets, inventory and reports — run your restaurant or retail counter from one reliable point of sale.',
  productUrl: BRAND.logo,

  // Fallback STATIC product entries used ONLY if the backend product registry
  // is unreachable. Only verified Infinixo entries belong here.
  products: [],
};
