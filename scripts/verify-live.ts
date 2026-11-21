import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium, devices, expect, type Page } from "@playwright/test";
import { createPdfStatement, statementCsv } from "../tests/fixtures";

async function main() {
  const base = process.argv[2];
  if (!base || new URL(base).protocol !== "https:")
    throw new Error(
      "Usage: npx tsx scripts/verify-live.ts https://production-alias",
    );
  const directory = "test-results/live";
  await mkdir(directory, { recursive: true });
  const browser = await chromium.launch();
  const results: unknown[] = [];
  async function downloaded(page: Page, name: RegExp) {
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name }).click();
    const path = await (await pending).path();
    assert.ok(path);
    return readFile(path);
  }
  try {
    for (const [name, options] of [
      ["desktop", { viewport: { width: 1440, height: 900 } }],
      ["mobile", devices["Pixel 7"]],
    ] as const) {
      const context = await browser.newContext({
        ...options,
        acceptDownloads: true,
      });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/*", (route) => {
        const url = new URL(route.request().url());
        return ["blob:", "data:"].includes(url.protocol) ||
          url.origin === new URL(base).origin
          ? route.continue()
          : route.abort();
      });
      const response = await page.goto(base);
      assert.equal(response?.status(), 200);
      const headers = response!.headers();
      assert.equal(headers["x-frame-options"], "DENY");
      assert.equal(headers["x-content-type-options"], "nosniff");
      assert.ok(!headers["content-security-policy"]?.includes("'unsafe-eval'"));
      await expect(
        page.getByRole("button", { name: "Explore Verified Demo" }),
      ).toBeEnabled();
      await page.getByLabel("Import bank statements").setInputFiles({
        name: "live-synthetic.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(statementCsv),
      });
      await page
        .getByRole("heading", { name: "Financial Command Center" })
        .waitFor();
      await page
        .getByRole("tab", { name: "Transactions", exact: true })
        .click();
      assert.equal(await page.locator("tbody tr").count(), 4);
      await page.getByRole("tab", { name: "AI Coach", exact: true }).click();
      await page
        .getByRole("button", { name: "How much did I save?", exact: true })
        .click();
      await page.getByText(/net savings totaled/).waitFor();
      await page.getByRole("tab", { name: "Exports", exact: true }).click();
      const json = JSON.parse(
        (await downloaded(page, /Structured JSON Archive/)).toString(),
      );
      assert.equal(json.transactions.length, 4);
      assert.equal(json.totals.income, 10000);
      assert.equal(json.totals.expenses, 420.5);
      assert.equal(json.balances.closing.amount, 11579.5);
      assert.match(
        (await downloaded(page, /CSV Statement Ledger/)).toString(),
        /ACME Salary/,
      );
      await page
        .getByRole("tab", { name: "Privacy & Sync", exact: true })
        .click();
      const backup = await downloaded(page, /Export Full Backup/);
      page.once("dialog", (dialog) => dialog.accept());
      await page
        .getByRole("button", { name: "Clear Local Data", exact: true })
        .click();
      await page.getByLabel("Restore FinanceIQ backup").setInputFiles({
        name: "backup.json",
        mimeType: "application/json",
        buffer: backup,
      });
      await page
        .getByRole("heading", { name: "Financial Command Center" })
        .waitFor();
      await page.reload();
      await page
        .getByRole("heading", { name: "Financial Command Center" })
        .waitFor();
      for (const chart of [
        "Income vs Expenses Overview",
        "Spending by Category",
      ]) {
        const graphic = page.getByRole("img", { name: chart });
        await graphic.scrollIntoViewIfNeeded();
        await expect(graphic.locator("svg.recharts-surface")).toBeVisible();
      }
      await page.evaluate(() => scrollTo(0, 0));
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 2,
        ),
      );
      assert.deepEqual(errors, []);
      await page.screenshot({
        path: `${directory}/${name}.png`,
        fullPage: true,
      });
      const form = new FormData();
      form.append(
        "files",
        new File([statementCsv], "api-synthetic.csv", { type: "text/csv" }),
      );
      const analyzed = await fetch(`${base}/api/analyze`, {
        method: "POST",
        body: form,
      });
      assert.equal(analyzed.status, 200);
      assert.equal(analyzed.headers.get("cache-control"), "no-store");
      const analysis = await analyzed.json();
      assert.equal(analysis.report.transactions.length, 4);
      const scanned = await context.request.post(`${base}/api/analyze`, {
        headers: { Origin: new URL(base).origin },
        multipart: {
          files: {
            name: "live-synthetic-scanned.pdf",
            mimeType: "application/pdf",
            buffer: await createPdfStatement({ pages: 4, scanned: true }),
          },
        },
        timeout: 90000,
      });
      assert.equal(scanned.status(), 200);
      const scannedReport = (await scanned.json()).report;
      assert.equal(scannedReport.transactions.length, 4);
      assert.equal(scannedReport.balances.closing.amount, 11579.5);
      const chat = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: "How much did I save?",
          report: json,
          allowAiSharing: false,
        }),
      });
      assert.equal(chat.status, 200);
      assert.equal((await chat.json()).source, "local");
      results.push({
        name,
        status: "passed",
        headers,
        checks: [
          "import",
          "ledger",
          "local-coach",
          "CSV/JSON",
          "backup/restore",
          "reload",
          "responsive",
          "rendered-charts",
          "no-page-errors",
          "analyze/chat-APIs",
          "scanned-PDF-API",
        ],
      });
      await context.close();
    }
  } finally {
    await browser.close();
    await writeFile(
      `${directory}/results.json`,
      JSON.stringify(
        { url: base, verifiedAt: new Date().toISOString(), results },
        null,
        2,
      ),
    );
  }
  console.log(`Live production verification passed: ${base} (desktop/mobile)`);
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
