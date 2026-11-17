# FinanceIQ 1.1.0

- Bundled offline PDF, encrypted-PDF, English OCR, and XLSX assets for Android.
- Native file/share exports, portable backup/restore, and improved ledger workflows.
- Manual transactions, editable goals, keyboard dashboard tabs, and visible storage errors.
- Hardened optional cloud sessions, logout, device revocation, quotas, batched persistence, and pagination.
- Bounded web API requests, privacy headers, explicit OpenAI server enablement, and safer logging/CSP.
- Expanded financial, parser, storage, backend HTTP, desktop/mobile browser, and native verification tooling.

App ID `com.durvesh.financeiq`; version code 2. Uses the existing private FinanceIQ release keystore, **not** v1.0.0's debug signing identity. The downloaded v1.0.0 APK has a different certificate: Android cannot install this APK over it. Export a portable backup from the old app, verify the backup, uninstall the old app, install 1.1.0, and restore. Uninstalling without a backup loses local data. No signing key was replaced during this audit.

Release certificate SHA-256: `52a59142d5ed3d63f2de5631f2d272cf14e6b1faab9a31f07a4a2d40957f90fd`.

Requires Android API 24+ and Android System WebView 111+; older WebViews show an update screen. See `AUDIT_REPORT.md` for actual test/deployment results and limitations. The cloud backend requires separately provisioned persistent infrastructure; no hosted backend is implied by this release.
