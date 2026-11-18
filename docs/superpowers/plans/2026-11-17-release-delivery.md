# FinanceIQ 1.1.0 Delivery Plan

> **For agentic workers:** Use executing-plans to complete the existing release inline; use one fresh whole-branch review before public delivery.

**Goal:** Finish the previously audited release, verify the updated live site and modern Android workflow, and publish only verified artifacts.
**Architecture:** Retain Next.js web delivery, Capacitor's existing signed static bundle, and the optional undeployed JSON-file backend. This is release completion, not a product redesign.
**Spec:** `AUDIT_REPORT.md`, `DEPLOYMENT.md`, `RELEASE_NOTES.md`, and the user's approval of isolated-worktree public delivery on 2026-11-17.

## Global Constraints

- Preserve the original checkout and its five unfinished verification/deployment files.
- Use the existing `financeiq` Vercel project and `durveshk01/FinanceIQ` repository.
- No paid backend infrastructure, paid AI calls, signing-key replacement, force push, or fabricated verification.
- Native testing uses only the dedicated `FinanceIQVerificationAPI35` emulator.
- Android 1.1.0 cannot install over the debug-signed historical 1.0.0: retain backup/uninstall/restore warnings.
- Do not run browser and native suites concurrently in one checkout: Playwright clears `test-results/`.

## Review Focus

- Signing-certificate mismatch between local and CI artifacts must not reach publication unnoticed.
- Live evidence must exercise the actual new production alias, not just local or historical builds.
- Do not overwrite existing work, remote commits, release assets, or tags.
- Private signing/configuration files must remain excluded from Git and deployment uploads.
- Failed native diagnostics must not become a passing workflow claim.

### Task 1: Verify remaining tooling and artifacts

**Files:** Existing `.gitignore`, `.vercelignore`, `scripts/verify-live.ts`, `scripts/verify-android.ts`, and `android/app/src/androidTest/java/com/durvesh/financeiq/OfflineWorkflowTest.java`.
**Interfaces:** Produces validated source and exact APK hash/certificate for the delivery gates.

- [x] Run `npm run test:all`, lint, typecheck, formatting, repository audit, and `npm run build` in the isolated checkout. Expected: successful exits.
- [x] Run production/static browser suites serially. Expected: 18 production passes; 16 static passes and 2 intentional server-only skips.
- [ ] Run native release workflow after browser cleanup is complete. Expected: `OK (1 test)` and offline cold-restart retention.
- [x] If a tool fails, investigate its actual cause and use a failing reproducer before any fix; preserve unrelated existing edits.
- [x] Verify release APK SHA-256 and certificate using `apksigner`. Expected: the certificate documented in `RELEASE_NOTES.md`.

### Task 2: Deliver and verify the existing web project

**Files:** `.vercelignore`, `AUDIT_REPORT.md`.
**Interfaces:** Consumes verified web source; produces the live alias and desktop/mobile verification results.

- [x] Link explicitly to the existing Vercel project without creating a new project.
- [x] Deploy with `vercel deploy --prod --yes --scope durvesh-s-projects1`. Expected: ready production deployment and existing alias.
- [x] Run `npx tsx scripts/verify-live.ts https://financeiq-iota.vercel.app`. Expected: desktop/mobile import, totals, exports, backup/restore, reload, and API checks pass with hardened headers.
- [x] Update audit evidence accurately, including failures or any blocked cloud features.

### Task 3: Review, integrate, and publish verified Android release

**Files:** `AUDIT_REPORT.md`, `RELEASE_NOTES.md`, existing release workflow.
**Interfaces:** Consumes verified source/live evidence and signed artifact; produces public source/tag/release URLs.

- [x] Fresh whole-branch review; fix important findings with a reproducer and a passing suite.
- [ ] Commit only this worktree's scoped files and push without force; reconcile remote progress without discarding it.
- [ ] Inspect the manual signing workflow/artifact certificate before a tag-triggered publication, or publish the already verified artifact only if no workflow can replace it with an unchecked identity.
- [ ] Publish version `v1.1.0` only after native verification passes; inspect completed workflow and downloaded release checksum/certificate.
- [ ] Record final public URLs and exact remaining limitations in audit evidence; retain the original checkout's work.
