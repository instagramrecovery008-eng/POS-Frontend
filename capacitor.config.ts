import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor configuration — Android build target for the existing React/Vite
 * Restaurant POS.
 *
 * This is ADDITIVE: the web build (vite build → dist/) is unchanged and stays
 * the primary web deployment. The Android app simply loads the same dist/ output
 * and talks to the SAME production backend via VITE_API_URL — no second
 * frontend, backend, or database.
 *
 * Build flow:
 *   npm run build            → dist/ (shared by web + android)
 *   npx cap sync android     → copies dist/ into android/ + updates plugins
 *   Android Studio / Gradle  → Debug APK, Release APK, Play AAB
 */
const config: CapacitorConfig = {
  // Unique Android application ID. The product is "Restaurant POS" (pos-buff-tavern
  // / restaurant-pos package name); no existing package ID was configured before
  // this change, so this derives one from the product identity.
  appId: 'com.restaurantpos.app',
  // Product name — must match existing branding ("Restaurant POS",
  // index.html <title> and metadata.json "POS App" family). Not a new brand.
  appName: 'Restaurant POS',
  // The existing Vite build output — shared verbatim with the web deployment.
  webDir: 'dist',
};

export default config;
