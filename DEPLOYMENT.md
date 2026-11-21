# Deployment and release guide

## Existing web project

Reuse Vercel project `financeiq` in scope `durvesh-s-projects1`; do not create a duplicate project. Production alias: https://financeiq-iota.vercel.app. Build command: `npm run build`; Next.js framework; Node 24.x. The current project uses the free Hobby plan.

Web builds use `tsconfig.build.json` to check the application without importing verification helpers or the optional backend. The full `npm run typecheck` remains part of CI after both projects' dependencies are installed. The package's Node range supports the tested 22 and 24 LTS lines and prevents deployment from automatically selecting an untested major version.

After local validation, deploy the linked repository with the Vercel CLI:

```sh
npx vercel deploy --prod --yes --scope durvesh-s-projects1
```

Keep secrets in host environment settings, never Git. No environment variables are required for local parsing. Optional AI needs **both** `ENABLE_OPENAI=true` and a private server-only `OPENAI_API_KEY`; enable only after accepting provider charges and privacy terms. `OPENAI_MODEL` is optional. Never use `NEXT_PUBLIC_` for private credentials.

Vercel functions impose their own request/runtime limits (including the platform body cap). Large/scanned statements should use default **on-device** parsing rather than the optional server parser. Local imports do not pass through a function. API responses use `no-store`; rate limiting is per warm process, not distributed. Do not treat it as a durable global billing quota for public AI access.

Verify the production homepage, import a synthetic statement, inspect ledger totals, export/restore, and verify response security headers. Live verification is separate from local Playwright results.

## Optional cloud backend

`render-backend/` is an Express Node service with a single-process JSON store. It is not Supabase, PostgreSQL, or SQLite. Users, bcrypt password hashes, device records, sessions, preferences, and synchronized entities live in `DATA_DIRECTORY/financeiq.json`.

Production startup requires:

- `NODE_ENV=production`
- `JWT_SECRET`: private random value of at least 32 characters; keep stable across restarts.
- `DATA_DIRECTORY`: mounted **persistent** directory, readable/writable only by the service user.
- `ALLOW_CORS_ORIGIN`: comma-separated exact web/native origins; no wildcard in production.
- `TRUST_PROXY_HOPS=1` only behind Render's trusted ingress; default `0` for direct hosting. Verify the proxy topology before changing it.
- `PORT`: assigned by the host.

`render.yaml` supplies these defaults for one Render service, using **paid `starter` and a 1 GB persistent disk**. Applying this blueprint can incur costs. Do not apply it without explicit authorization. A free ephemeral Render filesystem can lose accounts and synchronized data during redeploy/restart and is not a valid production substitute.

Build: `npm ci && npm run build` within `render-backend`; start: `npm start`; health: `/health`. Healthy output includes `status: ok` and `storage: persistent-file`. HTTP 503 means storage is unavailable. The health check verifies filesystem access, not an external backup or recovery procedure.

Allowlist the stable web alias and the origins actually used by Capacitor (`https://localhost`, `http://localhost`, or `capacitor://localhost` as appropriate). Add preview/custom origins deliberately, not `*`. Missing Origin is allowed for bearer-authenticated native/non-browser clients; CORS is not authentication.

### Storage and upgrade rules

- One process/instance; no concurrent writers or horizontal replicas.
- Snapshot writes use fsync and atomic file rename before acknowledging memory changes. Batch uploads and refresh rotation commit together.
- Store formats 1 and 2 load; writes use version 2. Legacy JWTs without the new issuer/audience/session identity require reauthentication.
- Downloads page by monotonic timestamps, with count/byte limits and `hasMore`.
- Limits: 100 MB total, 20 MB/1,000 entities per user, 4 MB/entity, 20 devices and 20 sessions/user.
- Make private volume backups, test restores, monitor capacity, and review single-instance synchronous write latency before real-world use. This is not an ACID distributed database or certified banking service.
- Deleting an account removes live records; operator backups may retain them until their documented retention period ends.

Backend deployment remains unverified until a real service URL, authenticated workflows, and restart persistence are tested. Never publish a guessed Render URL as live.

## Android builds

Use JDK 21, Android SDK platform 36, build-tools 36.0.0, and the checked-in Gradle wrapper. App ID: `com.durvesh.financeiq`; package version: 1.1.0; version code: 2. Capacitor 8 requires Android API 24+, plus a compatible modern Android System WebView. Unsupported WebViews receive an upgrade page; API level alone does not guarantee JS compatibility.

```sh
npm run build:android -- --both
```

The build script creates the static export, bundles offline assets, syncs Capacitor, runs Android lint/unit-test tasks, and produces `dist/android/FinanceIQ-{debug,release}.apk`, checksums, and build metadata. Unit-test task success does not imply that native JUnit test cases exist or that a device was tested.

Use the existing ignored `android/keystore.properties` and `android/signing/financeiq-release.keystore`, or private environment values:

- `FINANCEIQ_KEYSTORE_PATH`
- `FINANCEIQ_KEYSTORE_PASSWORD`
- `FINANCEIQ_KEY_ALIAS`
- `FINANCEIQ_KEY_PASSWORD`

Never commit the keystore/passwords or replace a published signing identity. Verify signatures using SDK `apksigner verify --verbose --print-certs` and compare with the previous release certificate before publishing an update.

**Confirmed v1.0.0 incompatibility:** the historical APK was signed by `CN=Android Debug` (certificate SHA-256 `a29ecb9995c3272a93e42dbb47e5a09a0d242bd377c66dac1fbd8e262bc1654a`). The existing private release keystore signs as `CN=FinanceIQ, O=FinanceIQ` (`52a59142d5ed3d63f2de5631f2d272cf14e6b1faab9a31f07a4a2d40957f90fd`). Back up and verify local data before uninstall/reinstall; this is not a seamless upgrade. The keystore itself was preserved, not regenerated.

```sh
npm run test:browser:static
npm run test:android -- --serial emulator-5560 --release
```

Use a **dedicated verification emulator**, not a user's device: the native script clears FinanceIQ app data, disables networking, imports test fixtures, exercises native sharing/backup/restore, and checks a cold process restart. It writes diagnostics under ignored `test-results/android/`. Physical-device/older-WebView coverage must be stated separately.

## GitHub release workflow

`.github/workflows/android-build.yml` supports `workflow_dispatch` and matching `v<package-version>` tags. Existing private `FINANCEIQ_*` signing secrets restore the same keystore. A tag publishes the signed APK, SHA-256 file, and `RELEASE_NOTES.md`; manual runs only upload workflow artifacts. Do not call a historical APK newly verified or claim a workflow completed before inspecting its result.
