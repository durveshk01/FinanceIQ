# FinanceIQ Production Deployment & Build Guide

This document covers production deployment for:
1. **Web Application on Vercel** (Next.js 16 App Router)
2. **Lightweight Backend on Render** (Node.js/Express + TypeScript)
3. **Android Mobile Application APK** (Native Android + Capacitor 7)

---

## 1. Vercel Deployment (Frontend Web App)

The web frontend is built using Next.js 16 App Router and is fully optimized for Vercel edge/serverless deployment.

### Steps:
1. Push this repository to GitHub: `https://github.com/durveshk01/FinanceIQ`
2. Go to [https://vercel.com](https://vercel.com) and click **Add New Project**.
3. Select the `FinanceIQ` repository and click **Import**.
4. Configure Build and Output settings:
   - Framework Preset: `Next.js`
   - Build Command: `npm run build`
   - Output Directory: `.next`
   - Node.js Version: `20.x` or `22.x`
5. Configure Environment Variables in Vercel:
   ```bash
   OPENAI_API_KEY=your_openai_api_key_here          # Optional, server-side only
   OPENAI_MODEL=gpt-4.1-mini                        # Optional
   NEXT_PUBLIC_APP_URL=https://financeiq.vercel.app # Your production Vercel URL
   NEXT_PUBLIC_SITE_NAME=FinanceIQ
   NEXT_PUBLIC_ANALYTICS_ENABLED=false
   ```
6. Click **Deploy**.
7. Verification:
   - Homepage loads with zero console errors.
   - Click "Explore Verified Demo" -> Command Center opens instantly.
   - Upload sample statement -> Verified on-device.
   - Test PDF, CSV, and XLSX exports.

---

## 2. Render Deployment (Lightweight Cloud Backend)

The Render backend (`render-backend/`) handles optional authentication, device registration, and incremental cloud synchronization.

### Automated Deployment via Blueprint:
1. A production-ready `render.yaml` file is included in the root directory.
2. Go to [https://dashboard.render.com](https://dashboard.render.com) and click **New** -> **Blueprint**.
3. Connect your GitHub repository `durveshk01/FinanceIQ`.
4. Render will detect `render.yaml` and configure:
   - Service Name: `financeiq-api`
   - Runtime: `Node`
   - Root Directory: `render-backend`
   - Build Command: `npm install && npm run build`
   - Start Command: `npm start`
   - Health Check Path: `/health`
5. Click **Apply**.
6. Post-Deployment Verification:
   - Test Health Check: `curl https://financeiq-api.onrender.com/health`
     Should return:
     ```json
     {
       "status": "ok",
       "service": "FinanceIQ Render Cloud Backend",
       "features": { "auth": true, "sync": true, "deviceRegistration": true }
     }
     ```

---

## 3. Android Mobile Application APK Build

The Android client is a genuine native Android application built with Capacitor 7 and Gradle.

### Prerequisites:
- Java JDK 21 (Microsoft OpenJDK 21 or standard Oracle/Temurin JDK 21)
- Android SDK Platform 36 / 34 and Build Tools 36.0.0

### Local Build Commands:
```bash
# 1. Sync latest assets to Android native project
npx cap sync android

# 2. Build the Debug APK using Gradle wrapper
cd android
.\gradlew.bat assembleDebug
cd ..
```

### Artifact Location:
The generated APK is located at:
`android/app/build/outputs/apk/debug/app-debug.apk`

### Testing on Android Device:
1. Connect Android phone with USB Debugging enabled or start an emulator.
2. Install APK:
   ```bash
   adb install -r android/app/build/outputs/apk/debug/app-debug.apk
   ```
3. Test offline workflow:
   - Turn on Airplane Mode.
   - Open FinanceIQ.
   - Tap "Import Statement" and pick a bank statement PDF/CSV from device storage.
   - Verify all calculations, categories, subscriptions, health score, and forecasting run locally on phone.

---

## 4. Release Signing (For Google Play Store / Production APK)

To build a release APK or AAB:
1. Generate release keystore:
   ```bash
   keytool -genkey -v -keystore financeiq-release.keystore -alias financeiq -keyalg RSA -keysize 2048 -validity 10000
   ```
2. Configure `android/app/build.gradle` signingConfigs:
   ```groovy
   signingConfigs {
       release {
           storeFile file("financeiq-release.keystore")
           storePassword System.getenv("KEYSTORE_PASSWORD")
           keyAlias "financeiq"
           keyPassword System.getenv("KEY_PASSWORD")
       }
   }
   ```
3. Run:
   ```bash
   cd android
   .\gradlew.bat bundleRelease
   ```
   Generates `android/app/build/outputs/bundle/release/app-release.aab`.
