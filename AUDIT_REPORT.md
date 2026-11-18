# FinanceIQ audit and release evidence

Audit date: 2026-11-17; release continuation updated 2026-11-18. Scope: web application, optional Express backend, financial processing, local persistence, Android, CI, source history, documentation, and deployments. All test data was synthetic. No paid infrastructure or paid AI calls were authorized or provisioned.

## Original condition

The starting commit was `be66342` on `main`, with substantial preexisting uncommitted implementation and tests. That work was preserved and included, not discarded or attributed entirely to this audit. Baseline clean installs, lint/typecheck, financial/backend assertions, builds, npm audits, and 16 desktop/mobile browser tests passed. Passing baseline tests did not cover the issues below.

The actual architecture is Next.js 16/React 19, Capacitor 8, PDF.js/Tesseract/ExcelJS, IndexedDB/localStorage, and an optional single-instance JSON-file Express backend. Earlier documentation incorrectly described SQLite, summary-only synchronization, and deployment readiness. The existing Vercel alias and historical v1.0.0 APK were not evidence of a newly deployed release. Render's authenticated ten-service inventory contained no FinanceIQ service.

## Issue ledger and counts

The original audit counts refer to the explicitly grouped findings below, not changed lines, test assertions, or vulnerabilities discovered by npm: **25 repaired findings, 8 remaining limitations/blockers**. Continuation findings and delivery evidence are tracked separately below. Dependency audits found zero reported vulnerabilities; this is not a security certification.

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

| Check                                           | Verified result                                                                                                                                                                    |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clean root/backend `npm ci`                     | Passed; zero audit findings; deprecated transitive-package/install-script warnings remain                                                                                          |
| Lint, typecheck, root/backend production builds | Passed again after clean installs and final regression addition                                                                                                                    |
| `test:all`                                      | Financial assertions, all 18 regression tests including summary-only PDF pages, ten workflow checks, backend HTTP/storage assertions passed                                        |
| Desktop/mobile production browser suite         | Updated verifier: 18 passed in 57.5 seconds                                                                                                                                        |
| Desktop/mobile static client browser suite      | Updated verifier: 16 passed, 2 server-only API tests intentionally skipped, 53.4 seconds                                                                                           |
| Formatting/whitespace                           | Formatting passed after correcting five files; `git diff --check` clean                                                                                                            |
| Source/history secret scanner                   | Continuation scan: 149 source files, 121 text files, 11 commits, no findings before final integration; heuristic scanner                                                           |
| Android debug/release builds                    | Passed; release signature verified; Android lint tasks passed with warnings and upstream baseline-filtered findings                                                                |
| Android JVM unit task                           | Up-to-date template `addition_isCorrect`; not meaningful application workflow coverage                                                                                             |
| Android API29/WebView74 instrumentation         | Failed at dashboard startup; diagnostics show intentional WebView111+ update screen, not dashboard success                                                                         |
| Newer emulator native workflow                  | Rebuilt API35 local instrumentation passed OCR, exports, erasure/backup restore; complete fresh-process verification pending CI after Windows emulator boot/disconnection failures |
| Live production workflows                       | Updated existing Vercel alias; desktop/mobile live import, totals, coach, exports, backup/restore, reload and analyze/chat API checks passed                                       |

## Security and performance

Controls include bounded requests/archives/rate maps, quotas, private HTTP caching, consent gating, bcrypt byte limits, persisted revocation, ownership checks, atomic snapshots, and private signing files. No secret/key material was intentionally published; ignored private configuration is not part of the source release.

Performance improvements bound XLSX expansion, sync downloads and cloud capacity, paginate the ledger, and retain lazily loaded charts/parsers. Builds and workflow runtimes are measured above; no fabricated Lighthouse score, latency improvement percentage, load capacity, or banking-compliance claim is made.

## Database and backend status

No PostgreSQL/Supabase migration was necessary or performed. Client reports use IndexedDB with localStorage fallback; settings/tokens/rules use localStorage, not SQLite. Cloud data uses a versioned single-writer JSON file; legacy formats load and writes use version 2. Persistence restart/rollback tests passed locally. Production volume backup/recovery and real hosted restart persistence remain unverified.

`render.yaml` requires a paid starter service and persistent disk. No FinanceIQ service exists in the inspected workspace; no backend URL is claimed. Provisioning remains blocked by cost authorization. Free ephemeral hosting is not a safe persistent-account substitute.

## Android artifact and upgrade policy

Rebuilt local release APK: 14,059,683 bytes; SHA-256 `5f1752a415ea7a0a4d3906a7e4a722cc89d6cfd51c9266c9b5c5bf94e77732d6`. Original audited debug APK: 16,451,525 bytes; SHA-256 `47e46574361eb6283a0c398041631f756bd51a5d67932b1761cc8fd2379303f8`. CI builds can have different APK hashes; the downloaded published artifact must match its own checksum and the established certificate.

Release certificate: `CN=FinanceIQ, O=FinanceIQ`, RSA3072, SHA-256 `52a59142d5ed3d63f2de5631f2d272cf14e6b1faab9a31f07a4a2d40957f90fd`. The existing private keystore was preserved. Downloaded v1.0.0 was debug-signed with a different certificate (`a29ecb9995c3272a93e42dbb47e5a09a0d242bd377c66dac1fbd8e262bc1654a`): **back up, verify backup, uninstall/reinstall, then restore**. An in-place upgrade is not possible. The downloaded manual CI artifact independently verifies with the same established release certificate.

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

- Repository: https://github.com/durveshk01/FinanceIQ ; original audit committed/pushed as `df7a356`; isolated continuation changes awaiting final review/integration.
- Existing Vercel project: `financeiq`, free Hobby scope `durvesh-s-projects1`; https://financeiq-iota.vercel.app ; deployment `dpl_9dLZ7Y7q9FjmvCjsgzCCSLiSPXnB` ready and live desktop/mobile verification passed at 2026-11-17T13:25:01Z.
- APK publication: pending verified v1.1.0 release; historical releases are not newly built artifacts.

## Continuation evidence

The user approved an isolated worktree, source push, existing-project production deployment, and verified signed GitHub release. Paid backend infrastructure and paid AI calls remain excluded. The original checkout and its unfinished edits were preserved.

- **Web deployment repaired and verified:** uploading the browser-test backend server pulled separate Express sources into Next.js typechecking without backend dependencies. `.vercelignore` now excludes the separate backend and its browser-test server. A failed deployment was inspected before the correction; the subsequent production deployment and live workflow verifier passed. Production Vercel environment inventory is empty; no provider AI is enabled.
- **Native OCR repaired; complete CI verification pending:** Android's asset packaging expands `eng.traineddata.gz` to `eng.traineddata`. The original signed APK's ZIP inventory and native worker diagnostics confirmed the resulting 404. The PDF parser now selects uncompressed language loading specifically on Android, leaving web/server behavior unchanged. Rebuilt local instrumentation passed all four scanned pages, exports, erasure, and backup restore. Subsequent host emulator disconnection/boot failures prevented complete fresh-process verification, so the same two-method native verifier is now required in existing CI using the dedicated API35 AVD. Public standard Ubuntu runner compute is free; no paid infrastructure was added. The rebuilt local release is 14,059,683 bytes, SHA-256 `5f1752a415ea7a0a4d3906a7e4a722cc89d6cfd51c9266c9b5c5bf94e77732d6`; its established release certificate verifies. This is not yet a published artifact hash.
- **Android CI setup repaired and signing identity verified:** manual workflow [44089788272](https://github.com/durveshk01/FinanceIQ/actions/runs/44089788272) failed because setup-android v3 requested the retired SDK `tools` package. Explicit platform-tools/API36/build-tools36 package selection replaces that default. Subsequent manual workflow [44095675682](https://github.com/durveshk01/FinanceIQ/actions/runs/44095675682) passed validations, signed build, signature verification, and static browser checks. Its downloaded APK has SHA-256 `23424c32fe1b2bd044ce5a385f3992a759f16ef00c9a5e5a8acfb08c58b5e6df`, matching its checksum file, and the established release certificate. That preflight artifact predates the OCR fix and is not the final published artifact. No signing secrets were replaced or exposed.
- **Fresh local checks:** isolated clean installs, production/static builds, financial/backend assertions, 18 regression tests, ten workflow checks, six release-gate tests, lint, typecheck, and formatting passed. Updated production browser suite: 18 passed in 57.5 seconds; static suite: 16 passed in 53.4 seconds and two intentional server-only skips. Resumed source/history scan: 151 source files, 123 text files, 11 commits, no findings before final integration. Root/backend dependency audits reported zero vulnerabilities.
- **Independent delivery review:** one read-only whole-branch review found no critical issue and two important inherited publication gaps. Signature checking now rejects any identity other than the established single release signer; release inventory checking rejects published/draft collisions and malformed results. Tag jobs are serialized and create-only GitHub CLI publication replaces the asset-overwriting release action. Six behavioral tests passed; a mutation check detected both disabled safeguards, and the actual previously valid debug-signed artifact was rejected by the identity gate. Full test:all, lint, typecheck, and formatting passed after the fixes. Complete report-snapshot comparison is a deferred minor; cold-restart coverage is limited to the documented financial fields.
- **Verification tooling caveat:** concurrent browser and native suites share `test-results/`; Playwright cleanup removed native diagnostics in one attempt. That attempt was not counted as passing. Subsequent suites are run serially and live evidence preserved before browser cleanup.

## Overall health

Local web/static workflows, signed builds, and the updated live web deployment are healthy under the verified synthetic coverage. This is **not a fully verified production full-stack deployment**: hosted cloud persistence, complete native modern-WebView workflows, and release publication remain separately tracked. Passing tests are evidence of tested behavior, not proof of complete correctness or security.
