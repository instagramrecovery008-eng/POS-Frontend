# Android build (Capacitor)

The Android app is an **additional build target of this same frontend** — same
React/Vite source, same backend, same PostgreSQL, same multi-tenant auth.
Nothing about the Web POS changes.

```
SAME FRONTEND SOURCE (this repo)
       |
   +---+---+
   |       |
  WEB    ANDROID (Capacitor)
   |       |
   v       v
 Web      APK/AAB
Hosting
   |       |
   +---+---+
       |
  SAME BACKEND (Railway)
       |
  SAME PostgreSQL
```

## One-time setup

1. Install JDK 17 + Android Studio (provides the Android SDK).
2. Set environment variables:
   - `JAVA_HOME` → JDK 17
   - `ANDROID_HOME` → Android SDK
3. Copy the Android env template and adjust if needed (defaults to the existing
   production backend):

   ```bash
   cp .env.android.example .env.android
   ```

## Building

```bash
# 1. Web bundle (dist/) — shared by web + android
npm run build -- --mode android

# 2. Copy dist/ into the Android project + update plugins
npx cap sync android

# 3. Open Android Studio
npx cap open android
```

npm shortcuts:

```bash
npm run android:sync   # build + cap sync
npm run android:open   # open Android Studio
```

## Outputs (from Android Studio / Gradle)

| Target | Command (in `android/`) |
|---|---|
| Debug APK | `./gradlew assembleDebug` → `app/build/outputs/apk/debug/app-debug.apk` |
| Release APK | `./gradlew assembleRelease` (needs signing config) |
| Play AAB | `./gradlew bundleRelease` → `app/build/outputs/bundle/release/app-release.aab` |

## Signing a release build

Create `android/keystore.properties` (git-ignored) with your signing config and
reference it from `android/app/build.gradle` — or configure signing directly in
Android Studio (`Build → Generate Signed Bundle / APK`). Never commit keystores
or passwords.

## Notes

- **Backend**: unchanged, deployed once on Railway. The Android app calls the
  SAME production API (`VITE_API_URL` from `.env.android`).
- **CORS**: the backend allow-list includes the Capacitor WebView origins
  (`com.restaurantpos.app`, `localhost`). See
  `restaurant-pos-backend/src/config/origins.js`.
- **Printing**: uses the existing `window.open` + browser print flow, which the
  Android WebView supports (routes to the system print service). Hardware
  printers (thermal/network/Bluetooth) go through Android's printing framework —
  vendor-specific direct printing is out of scope for this conversion.
- **Razorpay**: unchanged — the checkout script loads inside the WebView exactly
  as on web.
- **Offline**: out of scope. The app is online-only, like the Web POS.
- **Versioning**: bump `versionName`/`versionCode` in
  `android/app/build.gradle` for each Play release.
