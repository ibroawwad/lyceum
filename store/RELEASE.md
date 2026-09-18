# Release runbook (iOS + Android)

## Once
1. **Accounts**: Apple Developer Program (individual) and Google Play Console. Create the app on both consoles with the identity in `LISTING.md` and the in-app product `com.lyceum.app.course`.
2. **Server**: `deploy/release.sh root@146.190.139.68 api.<domain>` after the DNS A record exists; in `/srv/lyceum/app/.env` set `FREE_FACULTY=0`, `IAP_DEV_SECRET=` (blank), `OPENROUTER_API_KEY`, `VERIFY_BASE=https://verify.<domain>`, and for Play verification `GOOGLE_SERVICE_ACCOUNT_JSON` (Play Console → Setup → API access → service account with *View financial data*). Apple purchases need nothing: StoreKit 2 transactions are verified against Apple's root certificate.
3. **Build with the server baked in**: `LYCEUM_API=https://api.<domain> npm run mobile:sync`.
4. **Xcode** (once installed): `npx cap open ios` → Signing & Capabilities → your team; add the *In-App Purchase* capability. Product → Archive → Distribute → TestFlight.
5. **Android signing**: in Android Studio, Build → Generate Signed Bundle → create an upload key (`android/upload.jks`); then write `android/keystore.properties`:
   ```
   storeFile=upload.jks
   storePassword=…
   keyAlias=upload
   keyPassword=…
   ```
   Both files are git-ignored. `./gradlew bundleRelease` in `android/` then produces a signed `.aab`. Enrol in Play App Signing on upload.
6. **Play closed test**: a new personal account must run a closed test with 12+ testers for 14 days before production is unlocked. Start it with the first build.

## Every release
1. Bump `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` in `ios/App/App.xcodeproj/project.pbxproj` and `versionName` / `versionCode` in `android/app/build.gradle`.
2. `npm test` (offline smoke, 0 failed) → `LYCEUM_API=https://api.<domain> npm run mobile:sync`.
3. `node tools/shots.js` if screens changed; upload from `store/screenshots/`.
4. iOS: Archive → TestFlight → submit. Android: `bundleRelease` → Play Console → the track.

## What the app does with the purchase
Contract step → “Sign and pay <store price>” → the store sheet → the receipt (Apple JWS / Play token) goes to
`POST /v1/iap/verify` → a device-bound entitlement token is stored on the course → faculty proxy + registered
certificate for that course. A purchase the server could not confirm (no network) is kept on the device and settled
on the next attempt; the user is never charged twice. The web build never charges.
