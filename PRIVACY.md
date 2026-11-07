# FinanceIQ Privacy & Sovereign Data Architecture

FinanceIQ is built on the fundamental principle that **your personal banking transactions belong to you and your device only**.

---

## 1. Local-First Processing Guarantee

- **Zero Default Document Upload**: When you select or drop a bank statement (PDF, CSV, or XLSX) on the mobile application or website, parsing, transaction extraction, categorization, health scoring, and forecasting are performed **locally on your device CPU and RAM**.
- **No Document Storage**: The original bank statement file is never stored on external cloud servers during normal local operations.
- **Client-Side Database**: Analyzed reports, categorization rules, and goals are stored in your device's private local storage (IndexedDB on web, SQLite / Preferences on Android).

---

## 2. Optional Render Cloud Synchronization

- Cloud synchronization to our lightweight Render backend is **strictly opt-in**.
- When cloud sync is enabled, only high-level summary metrics (totals, health score, active goals) are synchronized using encrypted transit (HTTPS/TLS 1.3) and bearer tokens.
- Raw statement documents are never uploaded to the cloud sync engine.
- You can revoke devices or permanently delete all cloud sync records at any time via the **Privacy & Sync** tab or the `/api/auth/account` endpoint.

---

## 3. AI Financial Coach Privacy & Consent

- By default, FinanceIQ uses a **deterministic, on-device financial rule engine** to answer questions without contacting any external AI service.
- If you explicitly opt in to the enhanced OpenAI model:
  - Only anonymized, aggregated financial totals are passed.
  - Raw unvetted statement text is stripped.
  - No personal account numbers, bank identifiers, or address details are sent.
  - The API key remains strictly server-side.

---

## 4. User Data Sovereignty & Rights

Under the Privacy & Sync tab, you have instant access to:
1. **Full Backup Export (JSON)**: Download a complete, readable JSON archive of your verified financial metrics.
2. **Permanent Data Erasure**: One-click wipe to permanently remove all stored local bank statements, reports, and transaction logs.
3. **Local-Only Toggle**: Enforce that the application operates entirely offline with all network sync capabilities locked.
