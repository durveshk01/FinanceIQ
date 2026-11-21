# FinanceIQ

Local-first statement analysis for web and Android. Import PDF (text, scanned, or password-protected), CSV, XLSX, and TXT; review transactions, reconcile balances, inspect recurring payments, model savings, and export reports.

- Web: https://financeiq-iota.vercel.app
- Source: https://github.com/durveshk01/FinanceIQ
- Android downloads: https://github.com/durveshk01/FinanceIQ/releases
- Verification and known limitations: [AUDIT_REPORT.md](AUDIT_REPORT.md)

## Actual architecture

| Component        | Implementation                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------- |
| Web              | Next.js 16.4.6, React 19.2.4, TypeScript, Tailwind 4                                                          |
| Android          | Capacitor 8, bundled static web client, native picker/files/share integration                                 |
| Parsing          | PDF.js, bundled English Tesseract OCR, ExcelJS, CSV/text parsers                                              |
| Local data       | IndexedDB reports; localStorage settings, bearer token, rules, and legacy goals; localStorage report fallback |
| Optional backend | Express/TypeScript, bcrypt passwords, seven-day JWTs with persisted revocable sessions                        |
| Backend storage  | Single-instance JSON file store, atomic snapshot replacement; **not PostgreSQL**                              |
| Coach            | Deterministic local answers; optional server-side OpenAI on web only                                          |

No account or backend is required for local processing. Android bundles its workers, fonts, and English OCR data. A web browser needs to load the application/assets before using them; this is not a service-worker PWA with guaranteed offline cold starts.

## Features

- Multi-file overlap deduplication, separate debit/credit columns, date validation, running balances, and internal-transfer exclusion from spending.
- Searchable, filtered, paginated ledger with manual entry and exclusion controls.
- Ten charts, explainable health scoring, forecasts with chronological validation, and five spending scenarios.
- Editable/custom goals preserved when reports are recomputed.
- On-device CSV, XLSX, PDF, and JSON export; portable backup/restore without authentication secrets.
- Explicit cloud consent, server-backed sign-out, device management, and cloud account deletion.

Parsing is heuristic, not a guarantee for every bank layout or OCR image. Review low-confidence rows and reconciliation warnings. Forecasts, subscription candidates, and health scores are estimates, not regulated financial advice.

## Run locally

Use Node 22.13+ or Node 24 LTS and npm >=10.

```sh
npm ci
npm --prefix render-backend ci
npm run dev
```

Open http://localhost:3000. The optional backend runs separately:

```sh
npm --prefix render-backend run dev
```

Configure its URL in **Privacy & Sync**, sign in, then separately enable uploads. Disabling local-only mode allows server-assisted web parsing. Android always parses locally. OpenAI requires both server `ENABLE_OPENAI=true` and user consent; an API key alone does not activate billable calls.

## Validate

```sh
npm run lint
npm run format:check
npm run typecheck
npm run test:all
npm --prefix render-backend run build
npm run build
npx playwright install chromium
npm run test:browser
npm run audit:repository
npm audit
npm --prefix render-backend audit
```

`test:all` runs financial-engine assertions, regression tests, ten workflow checks, and backend HTTP/storage assertions. Browser tests cover desktop and mobile viewports, encrypted/scanned PDFs, exports, backups, consent, sync, and APIs.

## Android

Requires JDK 21, Android SDK 36, and build-tools 36.0.0. Configure `ANDROID_HOME` or ignored `android/local.properties`.

```sh
npm run build:android -- --both
npm run test:browser:static
npm run test:android -- --serial emulator-5560 --release
```

Signed artifacts and SHA-256 files are generated in `dist/android/`. Reuse the established release keystore; do not generate a new identity for an update. Native testing clears only the specified verification emulator's FinanceIQ data and disables its networking. See [DEPLOYMENT.md](DEPLOYMENT.md).

## Limits and operations

- Local import: five files, 10 MB/file, 10,000 transactions; PDFs <=100 pages.
- XLSX: <=20 sheets, 100 columns, 512 archive entries, 32 MB actual decompressed total, 16 MB/entry.
- Cloud: 4 MB/entity, 20 MB and 1,000 entities/account; 20 devices/sessions; 100 MB total single-instance store.
- Sync is user-initiated report sync, not a background offline queue or automatic merge engine. Higher entity versions win; conflicts are counted.
- Back up the persistent backend volume. Do not horizontally scale this file-store service.
- The Render blueprint uses a **paid starter plan and persistent disk**. Deploy only with cost approval. A free ephemeral service cannot safely retain cloud accounts.

See [PRIVACY.md](PRIVACY.md), [SECURITY.md](SECURITY.md), and [DEPLOYMENT.md](DEPLOYMENT.md) before using real financial data.
