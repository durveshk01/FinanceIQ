# Privacy and data handling

FinanceIQ is a portfolio project, not a certified banking platform. These statements describe the implementation, not a legal compliance certification.

## Default local mode

PDF/CSV/XLSX/TXT parsing, English OCR, calculations, forecasts, and deterministic coaching run on the device by default. Android always parses locally. Web assets must first be loaded from the web host; this is not guaranteed offline PWA installation.

Reports and their transactions/goals use IndexedDB on both web and Android WebView, with localStorage fallback. Settings, category rules, legacy goals, device identity, and cloud bearer token use localStorage. **There is no client SQLite database and no application-level encryption at rest.** OS/browser access controls and device encryption remain important. Anyone with access to the same browser profile/device or successful same-origin script injection could access this data.

## Optional server-assisted web parsing

Disabling local-only mode permits statement files and any supplied PDF password to be sent to the web host's `/api/analyze`. The code processes them for the request, does not write them to persistent storage, and does not send them to OpenAI. Provider/network operational logs are controlled by the hosting provider; application parser logs record error class, not statement contents.

## Optional cloud synchronization

Sign-in alone does not upload a report. A separate upload-consent checkbox and explicit Sync action are required. Sync sends the **full report, including transaction descriptions, merchants, amounts, references, goals, and other report fields**, to the backend URL you choose over HTTPS. This is **not summary-only sync and not end-to-end encryption**. Original statement files are not part of this sync payload.

The backend operator can read synchronized records. It persists account email, bcrypt password hash, devices, revocable sessions, and synchronized entities in a private JSON file. Backend disk encryption, backup retention, and administrative access are the operator's responsibility.

Sign Out revokes the current server session; failures are shown rather than claiming revocation. Manage Devices revokes sessions bound to a device. Delete Cloud Account erases live account records and synchronized data, not local reports or operator backups. Choose a trusted backend; its privacy policy applies.

## Optional OpenAI web coach

The default coach makes no external AI calls. Enhanced coaching needs user consent plus server `ENABLE_OPENAI=true` and a private API key. Android/static builds do not offer it.

The web request sends the question and report to the web host. The OpenAI payload uses the question, period, aggregated financial metrics, selected categories/merchants/subscriptions, forecasts, and goal titles/amounts. **It is not fully anonymized**: merchant names, goal titles, and the question can identify sensitive information. Do not put account numbers or other secrets into questions/goals. The API key remains server-side. Provider retention and billing terms apply.

## Backup, erasure, and local-only controls

- Portable JSON backups omit authentication tokens, email/device identity, and cloud consent; they still contain sensitive financial records in readable form.
- Restore validates schemas; invalid backups do not replace the report. Multi-store restore is not a single transaction across IndexedDB/localStorage.
- Clear Local Data removes app-managed local reports/settings/rules and private native export cache. It does not erase cloud data, already downloaded/shared copies, or OS backups. Sign out before clearing if server revocation is required.
- Local-only mode disables cloud-upload and AI-sharing consent and keeps statement/coach processing local. It does **not** disable all browser network traffic, host asset loads, or deliberate account-management requests.

Keep independent private backups; browser storage may be evicted or cleared. Review [SECURITY.md](SECURITY.md) before handling real bank statements.
