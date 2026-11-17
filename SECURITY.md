# Security policy

FinanceIQ is not a certified banking product. Do not interpret passing tests or zero npm audit findings as proof that no vulnerabilities exist.

## Implemented controls

- Default on-device parsing/coaching; separate consent for report synchronization and enhanced AI.
- Upload count/type/size validation, PDF page caps, actual XLSX decompression/column/row caps, and transaction schema limits.
- Bounded streamed API bodies, content-type and same-origin checks, private response cache headers, and bounded per-process rate-limit maps.
- Production web CSP without JavaScript `unsafe-eval` (WebAssembly remains allowed for OCR); frame denial, MIME-sniffing prevention, restrictive permissions policy, and no-referrer headers.
- Cloud HTTPS URL validation without embedded credentials; redirects are rejected for bearer-token requests.
- Bcrypt password hashes with UTF-8 byte limits; seven-day issuer/audience-bound JWTs backed by persisted sessions; refresh rotation, logout, and device-bound revocation.
- Per-user ownership checks, entity/account/store quotas, paginated downloads, and atomic batched snapshot persistence.
- Production backend requires a private JWT secret, persistent storage directory, and explicit CORS allowlist. Proxy trust is configured, not assumed.
- CSV formula-injection escaping; portable backups omit credentials. Android release keys are ignored/private, release signing is required, and Android backups are disabled.
- Repository source/history secret scanner and root/backend dependency audits. These are heuristic checks, not exhaustive secret detection.

## Remaining production responsibilities

- HTTPS, private persistent volumes, stable secrets, encrypted disks/backups, least-privilege host administration, and tested recovery/retention procedures.
- Do not horizontally scale the single-writer JSON file store. Use an appropriately designed durable database if its size/latency limits are exceeded.
- Rate limits are not shared across serverless instances. Public billable AI needs authentication, distributed quotas, provider spending caps, and monitoring before activation.
- Add malware/file sandboxing, durable alerting/error tracking, capacity monitoring, and operational audit logs that do not retain sensitive payloads.
- Local storage/token data is not encrypted by the application. A shared or compromised device/profile and same-origin script injection remain risks; CSP still allows Next.js inline hydration scripts.
- OCR/parsers are heuristic; review transactions and balances. Test physical devices, older compatible WebViews, accessibility tooling, large real bank layouts, and cloud restart/restore behavior before broad rollout.
- Privacy/legal review, third-party retention terms, and release/update policy remain operator responsibilities.

## Reporting vulnerabilities

Send a private report to the repository owner with impact, reproduction steps, affected version/endpoint, and suggested remediation. Never include real statements, tokens, passwords, private keys, or account numbers in a public issue.
