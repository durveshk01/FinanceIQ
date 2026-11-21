# FinanceIQ audit and release evidence

The [2026-11-21 follow-up](#follow-up-verification-2026-11-21) below supersedes the earlier pending modern-Android verification status. The original audit remains as a historical record.

Audit date: 2026-11-17. Scope: web application, optional Express backend, financial processing, local persistence, Android, CI, source history, documentation, and deployments. All test data was synthetic. No paid infrastructure or paid AI calls were authorized or provisioned.

## Original condition

The starting commit was `be66342` on `main`, with substantial preexisting uncommitted implementation and tests. That work was preserved and included, not discarded or attributed entirely to this audit. Baseline clean installs, lint/typecheck, financial/backend assertions, builds, npm audits, and 16 desktop/mobile browser tests passed. Passing baseline tests did not cover the issues below.

The actual architecture is Next.js 16/React 19, Capacitor 8, PDF.js/Tesseract/ExcelJS, IndexedDB/localStorage, and an optional single-instance JSON-file Express backend. Earlier documentation incorrectly described SQLite, summary-only synchronization, and deployment readiness. The existing Vercel alias and historical v1.0.0 APK were not evidence of a newly deployed release. Render's authenticated ten-service inventory contained no FinanceIQ service.

## Issue ledger and counts

Counts refer to the explicitly grouped findings below, not changed lines, test assertions, or vulnerabilities discovered by npm: **25 repaired findings, 8 remaining limitations/blockers**. Dependency audits found zero reported vulnerabilities; this is not a security certification.

| ID  | Finding                                                          | Repair and evidence                                                                                        |
| --- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| F01 | File-store state published before successful persistence         | Proposed snapshots fsynced/renamed before memory publication; failed-write assertion                       |
| F02 | Sync batches could partially apply                               | Atomic batch commit; oversized-batch rollback assertion                                                    |
| F03 | Sessions did not survive process restarts                        | Persisted session identity; fresh-store restart assertion                                                  |
| F04 | JWT/session lifecycle insufficiently constrained                 | Seven-day issuer/audience-bound JWTs; device-bound sessions                                                |
| F05 | Refresh rotation could leave inconsistent sessions               | One persisted rotation commit; old-token HTTP rejection                                                    |
| F06 | Sign-out only cleared local token                                | Server logout integrated; browser and backend revocation assertions                                        |
| F07 | Expired/revoked client sessions remained stale                   | Explicit session error and durable local clearing; regression assertion                                    |
| F08 | Device revocation lacked usable client controls                  | Device list/revoke UI and bound-session rejection; backend/browser coverage                                |
| F09 | Unbounded cloud entity/account/device/session storage            | Byte/count quotas and tested batch rejection/session eviction                                              |
| F10 | Download payloads and client sync were unbounded/unpaged         | Count/byte-bounded pages with advancing cursor; client paging test                                         |
| F11 | Permissive production CORS and implicit proxy trust              | Required exact production allowlist, configurable trusted hops; CORS tests                                 |
| F12 | Backend malformed/oversized requests and readiness weak          | JSON limits/types, private headers, readiness, bounded rate maps; HTTP tests                               |
| F13 | Bearer requests could use credential-bearing URLs/redirects      | HTTPS URL validation, omitted credentials, rejected redirects                                              |
| F14 | Web request bodies lacked actual streamed byte caps              | Bounded reads plus origin/content-type checks; regression/API tests                                        |
| F15 | Sensitive responses could be cached                              | `no-store`, no-referrer/nosniff headers; browser/API checks                                                |
| F16 | Production CSP allowed JavaScript unsafe evaluation              | Removed JS `unsafe-eval`; WebAssembly allowance retained for OCR                                           |
| F17 | Ambient API key could activate billable AI                       | Server enable flag plus consent, no retries; mocked zero-provider-call test                                |
| F18 | Error messages could put sensitive details into logs             | Error-class logging without statement/provider error bodies                                                |
| F19 | Unknown balances became zero                                     | Optional-money parsing distinguishes invalid/missing values; regression                                    |
| F20 | Descending same-day rows reconciled incorrectly                  | Stable chronological ordering with balance-continuity inference; regression                                |
| F21 | PDF summary-only pages lost observed balances                    | Preserve page summaries independently of transaction rows; explicit fixture                                |
| F22 | XLSX archive expansion/shape could exhaust memory                | Actual decompression limits, normalized archive, sheet/column/row caps; bomb/wide-sheet tests              |
| F23 | Manual ledger/custom goal workflows missing or destructive       | Manual entry, editable goals, preservation on recomputation/import; browser regression                     |
| F24 | Settings writes/report read failures and dashboard errors hidden | Reject unavailable storage, expose errors, retain successful IndexedDB writes; tests                       |
| F25 | Accessibility/validation/documentation overstated coverage       | Keyboard tabs/panels, broader lint/typecheck/format/secret CI, corrected architecture/privacy/signing docs |

The preserved baseline additionally contains offline native assets, native share/backup support, parser/export corrections, decimal-safe arithmetic, chronological forecasting, local coach, and broader synthetic tests. Formatting changes are not counted as functional fixes.

## Validation evidence

| Check                                           | Verified result                                                                                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Clean root/backend `npm ci`                     | Passed; zero audit findings; deprecated transitive-package/install-script warnings remain                                                   |
| Lint, typecheck, root/backend production builds | Passed again after clean installs and final regression addition                                                                             |
| `test:all`                                      | Financial assertions, all 18 regression tests including summary-only PDF pages, ten workflow checks, backend HTTP/storage assertions passed |
| Desktop/mobile production browser suite         | 18 passed in 55.4 seconds                                                                                                                   |
| Desktop/mobile static client browser suite      | 16 passed, 2 server-only API tests intentionally skipped, 52.0 seconds                                                                      |
| Formatting/whitespace                           | Formatting passed after correcting five files; `git diff --check` clean                                                                     |
| Source/history secret scanner                   | 145 source files, 117 text files, nine commits, no findings before final additions; heuristic scanner                                       |
| Android debug/release builds                    | Passed; release signature verified; Android lint tasks passed with warnings and upstream baseline-filtered findings                         |
| Android JVM unit task                           | Up-to-date template `addition_isCorrect`; not meaningful application workflow coverage                                                      |
| Android API29/WebView74 instrumentation         | Failed at dashboard startup; diagnostics show intentional WebView111+ update screen, not dashboard success                                  |
| Newer emulator native workflow                  | Pending; must not be represented as passed                                                                                                  |
| Live production workflows                       | Pending new deployment verification; local browser tests are not live-host evidence                                                         |

## Security and performance

Controls include bounded requests/archives/rate maps, quotas, private HTTP caching, consent gating, bcrypt byte limits, persisted revocation, ownership checks, atomic snapshots, and private signing files. No secret/key material was intentionally published; ignored private configuration is not part of the source release.

Performance improvements bound XLSX expansion, sync downloads and cloud capacity, paginate the ledger, and retain lazily loaded charts/parsers. Builds and workflow runtimes are measured above; no fabricated Lighthouse score, latency improvement percentage, load capacity, or banking-compliance claim is made.

## Database and backend status

No PostgreSQL/Supabase migration was necessary or performed. Client reports use IndexedDB with localStorage fallback; settings/tokens/rules use localStorage, not SQLite. Cloud data uses a versioned single-writer JSON file; legacy formats load and writes use version 2. Persistence restart/rollback tests passed locally. Production volume backup/recovery and real hosted restart persistence remain unverified.

`render.yaml` requires a paid starter service and persistent disk. No FinanceIQ service exists in the inspected workspace; no backend URL is claimed. Provisioning remains blocked by cost authorization. Free ephemeral hosting is not a safe persistent-account substitute.

## Android artifact and upgrade policy

Release APK: 14,059,599 bytes; SHA-256 `8f7928914a8749648ebf534a477b907e29c606a0c68fdb21cfeb959f3d4cf725`. Debug APK: 16,451,525 bytes; SHA-256 `47e46574361eb6283a0c398041631f756bd51a5d67932b1761cc8fd2379303f8`.

Release certificate: `CN=FinanceIQ, O=FinanceIQ`, RSA3072, SHA-256 `52a59142d5ed3d63f2de5631f2d272cf14e6b1faab9a31f07a4a2d40957f90fd`. The existing private keystore was preserved. Downloaded v1.0.0 was debug-signed with a different certificate (`a29ecb9995c3272a93e42dbb47e5a09a0d242bd377c66dac1fbd8e262bc1654a`): **back up, verify backup, uninstall/reinstall, then restore**. An in-place upgrade is not possible. GitHub signing secrets exist but their certificate has not independently been compared.

App ID `com.durvesh.financeiq`, version 1.1.0/code2, Android API24+ and compatible WebView111+. Build warnings include flatDir repositories, SDK XML tooling mismatch, Gradle deprecations, resource/icon advisories, and Capacitor baseline findings. These are disclosed, not silently suppressed by this audit.

## Remaining issues (8 groups)

1. **Hosted backend/cost:** needs approved persistent infrastructure and live auth/sync/restart testing.
2. **Paid AI:** real provider calls intentionally untested; public activation needs authentication, distributed quotas, spending caps, and privacy review.
3. **Native compatibility:** API29's old WebView blocks dashboard; newer native verification pending, physical-device/wider-WebView coverage unavailable; v1.0.0 reinstall required.
4. **Cloud scaling/recovery:** synchronous single-writer JSON snapshots and process-local limits; no distributed database/limiter or exercised production disaster recovery.
5. **At-rest confidentiality:** no app-level encryption for local reports/tokens or cloud JSON; OS/provider controls remain essential.
6. **Parser coverage/security:** heuristic OCR/bank layouts, no malware sandbox; synthetic tests cannot guarantee arbitrary real statements.
7. **Local resilience:** cross-store backup restore is not one atomic transaction; browser eviction/data loss possible; no guaranteed web offline cold start.
8. **Operational assurance:** broad accessibility tooling, production load profiling, monitoring/alerts, legal/privacy review, and host backup retention are not complete.

## Repository and deployment record

- Repository: https://github.com/durveshk01/FinanceIQ ; source changes and report currently awaiting commit/push.
- Existing Vercel project: `financeiq`, free Hobby scope `durvesh-s-projects1`; https://financeiq-iota.vercel.app ; new deploy pending.
- APK publication: pending verified v1.1.0 release; historical releases are not newly built artifacts.

## Overall health

Local web/static workflows and signed builds are healthy under the verified synthetic coverage. This is **not yet a fully verified production full-stack deployment**: hosted cloud persistence, native modern-WebView workflows, updated live deployment, and release publication remain separately tracked. Passing tests are evidence of tested behavior, not proof of complete correctness or security.

## Follow-up verification: 2026-11-21

Follow-up fixes cover closing balances after trailing transactions, overlapping same-day statement order, cent rounding, legacy backup and goal restoration, restore notifications, chart measurement, and Windows verification cleanup. Native testing found that Android packaging strips `.gz` language-data aliases; OCR now uses the canonical `eng.traineddata` filename on web and Android. Android builds compare every packaged web asset against the static export before accepting an APK.

| Check                                                               | Result                                                                                                                                               |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lint, type checking, formatting, financial engine and backend tests | Passed                                                                                                                                               |
| Regression and workflow checks                                      | 23 regressions and 10 workflow checks passed                                                                                                         |
| Production website browser suite                                    | 22 desktop/mobile tests passed                                                                                                                       |
| Static Android-client browser suite                                 | 20 passed; two server-only tests intentionally skipped                                                                                               |
| Website, backend, debug and signed release builds                   | Passed; Android lint and JVM checks passed                                                                                                           |
| Signed Android 36 / WebView 133 offline workflow                    | Passed: system picker, CSV, encrypted PDF, XLSX, four scanned pages, navigation, local coach, all export formats, cache/data erasure, backup restore |
| Native cold process restart with networking disabled                | Restored report retained                                                                                                                             |
| Dependency and source/history scans                                 | Zero reported dependency vulnerabilities; no source/history scanner findings                                                                         |
| Existing live website before this follow-up was published           | Desktop/mobile smoke passed at https://financeiq-iota.vercel.app                                                                                     |

Browser output now uses `test-results/browser/` so its cleanup preserves native diagnostics in `test-results/android/`. Native verification uses real taps for blocking confirmation dialogs, preserves original failures when diagnostic evaluation is unavailable, and retries unavailable cold-start UI dumps.

Release APK: `dist/android/FinanceIQ-release.apk`, 14,060,303 bytes, SHA-256 `6113d73b75d010e7b9f4348fcf345456808f5ea39589c5fc8e6180db3d761493`. Its signature verifies against the established release certificate described above. APKs and private signing files remain excluded from source commits; publishing a new APK release is separate from pushing these fixes.

Physical-device coverage, old WebView compatibility, hosted cloud persistence/recovery, and real paid-AI provider calls retain the limitations described in the original audit.

## Published website verification: 2026-11-21

All source fixes were pushed to `main`. The final serverless PDF fix in commit `dcba1ff` includes PDF.js's worker, Tesseract's worker dependencies, and its WASM binaries in the `/api/analyze` deployment trace. The new `test:serverless` check independently traces worker dependencies and verifies that the deployable artifact contains them; it failed against the previous build and passes after the fix. GitHub CI run [44924115506](https://github.com/durveshk01/FinanceIQ/actions/runs/44924115506) passed, including all tests, production builds, and worker packaging.

The existing `financeiq` project was deployed successfully as `dpl_8WuxZs4VjdRkZTnXsVxJioFFpxMS`; its production alias is https://financeiq-iota.vercel.app. Live desktop (1440 × 900) and Pixel 7 verification passed CSV import, ledger, local coach, CSV/JSON exports, backup/restore, reload persistence, responsive layout, security headers, and analyze/chat APIs. Four scanned PDF pages returned four transactions and closing balance `11579.5` on the hosted API. Both overview charts rendered SVG graphics after reload, and no page errors occurred. The latest deployment's warning/error log query returned no records during verification.

The chart verification now waits for actual SVG graphics before recording screenshots; targeted desktop/mobile browser tests passed with those assertions. Local lint, typecheck, formatting, 23 regressions, and the production build passed for the serverless fix. The signed Android artifact retains the verified SHA-256 recorded above; these server-only changes do not alter the Android client. Optional hosted account/sync infrastructure and paid AI provider integration retain their previously documented limits.
