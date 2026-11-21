import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import { PDFParse } from "pdf-parse";
import { createPdfStatement, fixtureReport, statementCsv } from "../fixtures";

test.beforeEach(async ({ page }) => {
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return ["blob:", "data:"].includes(url.protocol) ||
      ["127.0.0.1", "localhost"].includes(url.hostname)
      ? route.continue()
      : route.abort();
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Explore Verified Demo" }),
  ).toBeEnabled();
});

async function importCsv(page: Page, csv = statementCsv) {
  await page.getByLabel("Import bank statements").setInputFiles({
    name: "statement.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await expect(
    page.getByRole("heading", { name: "Financial Command Center" }),
  ).toBeVisible();
}

async function download(page: Page, button: string | RegExp) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: button }).click();
  const result = await pending;
  expect(await result.failure()).toBeNull();
  const filename = await result.path();
  if (!filename) throw new Error("Download did not produce a file.");
  return readFile(filename);
}

test("imports overlapping statements, persists exact balances, filters and excludes ledger rows", async ({
  page,
}) => {
  const fatalErrors: string[] = [];
  page.on("pageerror", (error) => fatalErrors.push(error.message));
  await page.getByLabel("Import bank statements").setInputFiles([
    {
      name: "first.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(statementCsv),
    },
    {
      name: "overlap.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(statementCsv),
    },
  ]);
  await expect(
    page.getByRole("heading", { name: "Financial Command Center" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Transactions", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(4);
  await page
    .getByPlaceholder("Search merchant, narration, or category...")
    .fill("Swiggy");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByRole("button", { name: "Exclude", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Include", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Financial Command Center" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Exports", exact: true }).click();
  const report = JSON.parse(
    (await download(page, /Structured JSON Archive/)).toString(),
  );
  expect(report.transactions).toHaveLength(4);
  expect(report.importSummary.duplicatesRemoved).toBe(4);
  expect(report.totals.expenses).toBe(300);
  expect(report.balances.calculatedClosing.amount).toBe(11579.5);
  expect(fatalErrors).toEqual([]);
});

test("rejects unsupported imports and exposes every page of a large ledger", async ({
  page,
}) => {
  const rows = Array.from(
    { length: 105 },
    (_, index) => `2026-04-01,Purchase ${index + 1},-10,REF${index}`,
  );
  await importCsv(
    page,
    ["Date,Description,Amount,Reference", ...rows].join("\n"),
  );
  await page.getByRole("tab", { name: "Transactions", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(100);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(5);
  await expect(page.getByText("Purchase 105", { exact: true })).toBeVisible();
  await page.getByLabel("Import bank statements").setInputFiles({
    name: "old.xls",
    mimeType: "application/vnd.ms-excel",
    buffer: Buffer.from("legacy"),
  });
  await expect(
    page.getByText(/convert legacy XLS files to XLSX first/),
  ).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(5);
});

test("manual transactions, custom goals, privacy and keyboard tabs persist without resetting goals", async ({
  page,
}) => {
  await importCsv(page);
  const overview = page.getByRole("tab", { name: "Overview", exact: true });
  await overview.focus();
  await overview.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Analytics", exact: true }),
  ).toBeFocused();
  await expect(page.getByRole("tabpanel")).toHaveAttribute(
    "aria-labelledby",
    "tab-1",
  );
  await page
    .getByRole("tab", { name: "Forecast & Goals", exact: true })
    .click();
  await page.getByText("Create or Edit Goal", { exact: true }).click();
  await page.getByLabel("Goal title").fill("My education");
  await page.getByLabel("Goal target (₹)").fill("20000");
  await page.getByLabel("Goal saved amount (₹)").fill("2000");
  await page.getByLabel("Monthly contribution (₹)").fill("1000");
  await page.getByLabel("Goal deadline").fill("2028-01-01");
  await page.getByRole("button", { name: "Save Goal", exact: true }).click();
  await expect(page.getByText("Goal saved on this device.")).toBeVisible();
  await page.getByRole("tab", { name: "Transactions", exact: true }).click();
  await page.getByText("Add Manual Transaction", { exact: true }).click();
  await page.getByLabel("Transaction date").fill("2026-04-05");
  await page.getByLabel("Transaction description").fill("Manual groceries");
  await page.getByLabel("Signed amount (₹)").fill("-25.50");
  await page
    .getByRole("button", { name: "Save Transaction", exact: true })
    .click();
  await expect(page.locator("tbody tr")).toHaveCount(5);
  await page.getByRole("tab", { name: "Exports", exact: true }).click();
  const updatedBalance = JSON.parse(
    (await download(page, /Structured JSON Archive/)).toString(),
  );
  expect(updatedBalance.balances.closing.amount).toBe(11554);
  expect(updatedBalance.balances.closing.source).toBe("calculated");
  await page.getByRole("tab", { name: "Transactions", exact: true }).click();
  await page
    .locator("tbody tr")
    .filter({ hasText: "Manual groceries" })
    .getByRole("button", { name: "Exclude", exact: true })
    .click();
  await page.getByRole("tab", { name: "Privacy & Sync", exact: true }).click();
  await page.getByLabel(/Local-only mode: process statements/).check();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Financial Command Center" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Exports", exact: true }).click();
  const report = JSON.parse(
    (await download(page, /Structured JSON Archive/)).toString(),
  );
  expect(
    report.goals.find(
      (goal: { title: string }) => goal.title === "My education",
    ).currentAmount,
  ).toBe(2000);
  expect(
    report.transactions.find(
      (transaction: { description: string }) =>
        transaction.description === "Manual groceries",
    ).isExcluded,
  ).toBe(true);
  expect(report.totals.expenses).toBe(420.5);
  expect(report.balances.closing.amount).toBe(11554);
});

test("legacy backups replace the IndexedDB ledger and an empty backup clears it across reloads", async ({
  page,
}) => {
  await importCsv(page);
  const report = fixtureReport();
  await page.getByLabel("Restore FinanceIQ backup").setInputFiles({
    name: "legacy.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        transactions: report.transactions.slice(0, 2),
        goals: report.goals,
      }),
    ),
  });
  await expect(
    page.getByText("FinanceIQ backup restored successfully."),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Transactions", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await page.reload();
  await page.getByRole("tab", { name: "Transactions", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await page.getByLabel("Restore FinanceIQ backup").setInputFiles({
    name: "empty.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ version: 2, report: null, transactions: [], goals: [] }),
    ),
  });
  await expect(
    page.getByRole("heading", { name: "Financial Command Center" }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Explore Verified Demo" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("heading", { name: "Financial Command Center" }),
  ).toHaveCount(0);
  const goals = [
    { ...report.goals[0], id: "legacy-goal", title: "Legacy education" },
  ];
  await page.getByLabel("Restore FinanceIQ backup").setInputFiles({
    name: "goals-only.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ version: 1, goals })),
  });
  await expect(
    page.getByText("FinanceIQ backup restored successfully."),
  ).toBeVisible();
  await importCsv(page);
  await page.getByRole("tab", { name: "Exports", exact: true }).click();
  const restoredGoals = JSON.parse(
    (await download(page, /Structured JSON Archive/)).toString(),
  );
  expect(restoredGoals.goals).toEqual(goals);
});

test("imports encrypted and multi-page text PDFs with correct credit/debit columns", async ({
  page,
}) => {
  await page.getByLabel("Import bank statements").setInputFiles({
    name: "encrypted.pdf",
    mimeType: "application/pdf",
    buffer: await createPdfStatement({ encrypted: true }),
  });
  await expect(page.getByText(/password protected/)).toBeVisible();
  await page
    .getByLabel("PDF password (only for encrypted statements)")
    .fill("statement-pass");
  await page.getByLabel("Import bank statements").setInputFiles({
    name: "encrypted.pdf",
    mimeType: "application/pdf",
    buffer: await createPdfStatement({ pages: 4, encrypted: true }),
  });
  await expect(
    page.getByRole("heading", { name: "Financial Command Center" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Exports", exact: true }).click();
  const report = JSON.parse(
    (await download(page, /Structured JSON Archive/)).toString(),
  );
  expect(
    report.transactions.map(
      (transaction: { amount: number }) => transaction.amount,
    ),
  ).toEqual([10000, -120.5, -300, -3000]);
  expect(report.balances.closing.amount).toBe(11579.5);
});

test("recognizes all four scanned PDF pages using bundled offline OCR", async ({
  page,
}) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith("http") && url.hostname !== "127.0.0.1")
      externalRequests.push(request.url());
  });
  await page.getByLabel("Import bank statements").setInputFiles({
    name: "scanned.pdf",
    mimeType: "application/pdf",
    buffer: await createPdfStatement({ pages: 4, scanned: true }),
  });
  await expect(
    page.getByRole("heading", { name: "Financial Command Center" }),
  ).toBeVisible({ timeout: 90000 });
  await page.getByRole("tab", { name: "Exports", exact: true }).click();
  const report = JSON.parse(
    (await download(page, /Structured JSON Archive/)).toString(),
  );
  expect(
    report.transactions.map(
      (transaction: { amount: number }) => transaction.amount,
    ),
  ).toEqual([10000, -120.5, -300, -3000]);
  expect(
    report.transactions.every(
      (transaction: { confidence: number }) => transaction.confidence <= 0.7,
    ),
  ).toBe(true);
  expect(externalRequests).toEqual([]);
});

test("multi-page local PDFs calculate the closing balance when the last row has no balance", async ({
  page,
}) => {
  await page.getByLabel("Import bank statements").setInputFiles({
    name: "partial-balances.pdf",
    mimeType: "application/pdf",
    buffer: await createPdfStatement({ pages: 4, omitLastBalance: true }),
  });
  await expect(
    page.getByRole("heading", { name: "Financial Command Center" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Exports", exact: true }).click();
  const report = JSON.parse(
    (await download(page, /Structured JSON Archive/)).toString(),
  );
  expect(report.transactions).toHaveLength(4);
  expect(report.balances.closing.amount).toBe(11579.5);
  expect(report.balances.closing.source).toBe("calculated");
});

test("coach and simulator work locally, all tabs render and mobile layout stays within viewport", async ({
  page,
}) => {
  const fatalErrors: string[] = [];
  const apiRequests: string[] = [];
  const chartWarnings: string[] = [];
  page.on("console", (message) => {
    if (
      message.type() === "warning" &&
      /width\(-1\)|height\(-1\)/.test(message.text())
    )
      chartWarnings.push(message.text());
  });
  page.on("pageerror", (error) => fatalErrors.push(error.message));
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/"))
      apiRequests.push(request.url());
  });
  await page.getByRole("button", { name: "Explore Verified Demo" }).click();
  await expect(
    page.getByRole("heading", { name: "Financial Command Center" }),
  ).toBeVisible();
  for (const tab of [
    "Analytics",
    "Transactions",
    "Subscriptions",
    "Forecast & Goals",
    "AI Coach",
    "Privacy & Sync",
    "Exports",
    "Overview",
  ]) {
    await page.getByRole("tab", { name: tab, exact: true }).click();
    await expect(
      page.getByRole("tab", { name: tab, exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    const dimensions = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      viewport: innerWidth,
    }));
    expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport + 1);
  }
  await page
    .getByRole("tab", { name: "Forecast & Goals", exact: true })
    .click();
  const custom = page
    .getByText("Custom What-If", { exact: true })
    .locator("..");
  const baseline = await custom.innerText();
  await page.getByLabel("Income Delta (₹)").focus();
  await page.getByLabel("Income Delta (₹)").press("End");
  await expect(custom).not.toHaveText(baseline);
  await page.getByRole("tab", { name: "AI Coach", exact: true }).click();
  await page
    .getByRole("button", { name: "How much did I save?", exact: true })
    .click();
  await expect(page.getByText(/net savings totaled/)).toBeVisible();
  expect(apiRequests).toEqual([]);
  expect(fatalErrors).toEqual([]);
  expect(chartWarnings).toEqual([]);
});

test("CSV, XLSX, PDF, JSON and portable backup exports work and can be restored after erasure", async ({
  page,
}) => {
  await importCsv(page);
  await page.getByRole("tab", { name: "Exports", exact: true }).click();
  expect((await download(page, /CSV Statement Ledger/)).toString()).toContain(
    '"-120.5"',
  );
  const book = new ExcelJS.Workbook();
  const xlsx = await download(page, /Excel Workbook/);
  await book.xlsx.load(new Uint8Array(xlsx).buffer);
  expect(book.getWorksheet("Transactions")?.rowCount).toBe(5);
  const pdf = await download(page, /PDF Health Dossier/);
  const parser = new PDFParse({ data: new Uint8Array(pdf) });
  try {
    expect((await parser.getText()).text).toContain("Self transfer to savings");
  } finally {
    await parser.destroy();
  }
  expect(
    JSON.parse((await download(page, /Structured JSON Archive/)).toString())
      .transactions,
  ).toHaveLength(4);
  await page.getByRole("tab", { name: "Privacy & Sync", exact: true }).click();
  const backup = await download(page, "Export Full Backup (JSON)");
  expect(JSON.parse(backup.toString()).preferences.authToken).toBeUndefined();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Clear Local Data", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "No Statement Loaded" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "No Statement Loaded" }),
  ).toBeVisible();
  await page.getByLabel("Restore FinanceIQ backup").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: backup,
  });
  await expect(
    page.getByRole("heading", { name: "Financial Command Center" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Transactions", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(4);
});

test("cloud sync waits for consent, restores onto a new device and deletes the account", async ({
  page,
  browser,
  request,
}, testInfo) => {
  await importCsv(page);
  await page.getByRole("tab", { name: "Privacy & Sync", exact: true }).click();
  const email = `browser-${testInfo.project.name}-${Date.now()}@example.com`;
  const password = "Cloud-Test-Password-123";
  await page.getByLabel("Backend URL").fill("http://127.0.0.1:4140");
  await page.getByLabel("Cloud email").fill(email);
  await page.getByLabel("Cloud password").fill(password);
  await page
    .getByRole("button", { name: "Create Cloud Account", exact: true })
    .click();
  await expect(page.getByText(`Signed in as ${email}`)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sync To Render Cloud", exact: true }),
  ).toBeDisabled();
  const token = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("financeiq_preferences") ?? "{}")
        .authToken,
  );
  const before = await request.get("http://127.0.0.1:4140/api/sync/download", {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect((await before.json()).records).toHaveLength(0);
  await page
    .getByLabel(
      "Allow uploading my report and transactions to this backend when I sync.",
    )
    .check();
  await page
    .getByRole("button", { name: "Sync To Render Cloud", exact: true })
    .click();
  await expect(page.getByText(/Cloud sync complete/)).toBeVisible();
  const second = await browser.newContext();
  try {
    const other = await second.newPage();
    await other.goto("http://127.0.0.1:3140");
    await expect(
      other.getByRole("heading", { name: "No Statement Loaded" }),
    ).toBeVisible();
    await other.getByLabel("Backend URL").fill("http://127.0.0.1:4140");
    await other.getByLabel("Cloud email").fill(email);
    await other.getByLabel("Cloud password").fill(password);
    await other.getByRole("button", { name: "Sign In", exact: true }).click();
    await expect(other.getByText(`Signed in as ${email}`)).toBeVisible();
    await other
      .getByLabel(
        "Allow uploading my report and transactions to this backend when I sync.",
      )
      .check();
    await other
      .getByRole("button", { name: "Sync To Render Cloud", exact: true })
      .click();
    await expect(
      other.getByRole("heading", { name: "Financial Command Center" }),
    ).toBeVisible();
    await other.getByRole("tab", { name: "Transactions", exact: true }).click();
    await expect(other.locator("tbody tr")).toHaveCount(4);
  } finally {
    await second.close();
  }
  await page
    .getByRole("button", { name: "Manage Devices", exact: true })
    .click();
  await expect(
    page.getByRole("list", { name: "Cloud devices" }).getByRole("listitem"),
  ).toHaveCount(2);
  await page.getByRole("button", { name: "Sign Out", exact: true }).click();
  await expect(
    page.getByText("Signed out. Your server session was revoked."),
  ).toBeVisible();
  expect(
    (
      await request.get("http://127.0.0.1:4140/api/auth/profile", {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).status(),
  ).toBe(401);
  await page.getByLabel("Cloud email").fill(email);
  await page.getByLabel("Cloud password").fill(password);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page.getByText(`Signed in as ${email}`)).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Delete Cloud Account", exact: true })
    .click();
  await expect(
    page.getByText("Cloud account and synchronized data deleted."),
  ).toBeVisible();
  expect(
    (
      await request.get("http://127.0.0.1:4140/api/sync/download", {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).status(),
  ).toBe(401);
});

test("production web APIs validate input, preserve uploads and export filtered reports", async ({
  request,
}) => {
  test.skip(
    process.env.PLAYWRIGHT_STATIC_EXPORT === "true",
    "API routes are intentionally absent from the native static export.",
  );
  const headers = {
    "x-forwarded-for": `browser-${Date.now()}-${Math.random()}`,
  };
  const analyzed = await request.post("/api/analyze", {
    headers,
    multipart: {
      files: {
        name: "statement.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(statementCsv),
      },
    },
  });
  expect(analyzed.status()).toBe(200);
  expect(analyzed.headers()["cache-control"]).toBe("no-store");
  expect((await analyzed.json()).report.transactions).toHaveLength(4);
  const report = fixtureReport();
  const exported = await request.post("/api/export", {
    headers,
    data: {
      report,
      format: "json",
      filters: { startDate: "2026-04-02", endDate: "2026-04-02" },
    },
  });
  expect(exported.status()).toBe(200);
  expect((await exported.json()).transactions).toHaveLength(1);
  expect(exported.headers()["cache-control"]).toBe("no-store");
  expect(
    (
      await request.post("/api/export", {
        headers: { Origin: "https://evil.example" },
        data: { report, format: "json" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (await request.post("/api/export", { headers, data: {} })).status(),
  ).toBe(400);
  const chat = await request.post("/api/chat", {
    headers,
    data: { report, question: "How much did I save?", allowAiSharing: false },
  });
  expect(chat.status()).toBe(200);
  expect((await chat.json()).source).toBe("local");
});
