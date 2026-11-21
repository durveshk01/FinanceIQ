import assert from "node:assert/strict";
import { test } from "node:test";
import ExcelJS from "exceljs";
import {
  normalizeDateString,
  parseCsvRows,
  parseMonetaryValue,
  parseStructuredTable,
} from "./bank-parsers";
import { buildReport } from "./finance-engine";
import {
  reportToCsv,
  reportToPdf,
  reportToXlsx,
  safeCsvCell,
} from "./exporters";
import { mergeStatements } from "./statement-import";
import { pdfTextLayout } from "./pdf-parser";
import { readServerPdfStatement } from "./server-pdf-parser";
import {
  boundedWorkbookArchive,
  readExcelStatement,
} from "./spreadsheet-parser";
import { zipSync } from "fflate";
import { LocalFinanceDatabase } from "./local-storage";
import { projectGoal, runSpendingSimulation } from "./goal-planner";
import {
  cloudBackendUrl,
  CloudSessionError,
  signOutCloud,
  synchronizeCloud,
} from "./cloud-sync";
import { DEFAULT_PREFERENCES } from "./local-storage";
import { roundMoney, sumMoney } from "./money";
import { DeviceStatementProcessor } from "./device-processor";
import { readBoundedRequest } from "./api-security";
import {
  createPdfStatement,
  fixtureReport,
  statementCsv,
} from "../../tests/fixtures";

test("CSV preambles, decimal commas, quoted newlines and invalid dates preserve real rows", () => {
  const rows = parseCsvRows(
    'sep=;\nBank statement\nDate;Description;Debit;Credit;Balance\n01/04/2026;"Cafe;\nLunch";"12,50";;"987,50"\n31/02/2026;Bad date;10;;977.50',
  );
  const parsed = parseStructuredTable(rows);
  assert.equal(parsed.transactions.length, 1);
  assert.equal(parsed.transactions[0].amount, -12.5);
  assert.equal(parsed.transactions[0].runningBalance, 987.5);
  assert.equal(normalizeDateString("29/02/2025"), "");
  assert.equal(normalizeDateString("29/02/2024"), "2024-02-29");
  assert.equal(normalizeDateString("04/30/2026"), "2026-04-30");
  assert.equal(parseMonetaryValue("(₹1,23,456.78)"), -123456.78);
  assert.equal(parseMonetaryValue("EUR 1.234,56 CR"), 1234.56);
  assert.throws(
    () => parseCsvRows('Date,Description,Amount\n2026-04-01,"broken,123'),
    /unterminated/,
  );
});

test("malformed balances stay unknown and descending same-day statements reconcile", () => {
  const invalid = parseStructuredTable(
    parseCsvRows(
      "Date,Description,Amount,Balance\n2026-04-01,Coffee,-5,unreadable",
    ),
  );
  assert.equal(invalid.transactions[0].runningBalance, undefined);
  const descending = parseStructuredTable(
    parseCsvRows(
      "Date,Description,Amount,Balance\n2026-04-01,Coffee,-10,140\n2026-04-01,Salary,100,150\n2026-03-31,Groceries,-50,50",
    ),
  );
  assert.deepEqual(
    descending.transactions.map((t) => t.amount),
    [-50, 100, -10],
  );
  const sameDay = parseStructuredTable(
    parseCsvRows(
      "Date,Description,Amount,Balance\n2026-04-01,Coffee,-10,140\n2026-04-01,Salary,100,150",
    ),
  );
  assert.deepEqual(
    sameDay.transactions.map((t) => t.amount),
    [100, -10],
  );
  assert.equal(buildReport(sameDay.transactions).balances.opening.amount, 50);
  assert.equal(buildReport(sameDay.transactions).balances.closing.amount, 140);
});

test("trailing account movements update closing balances instead of reusing an earlier observation", () => {
  const parsed = parseStructuredTable(
    parseCsvRows(
      "Date,Description,Amount,Balance\n2026-04-01,Salary,100,150\n2026-04-02,Coffee,-10,",
    ),
  );
  assert.equal(parsed.observedClosingBalance, undefined);
  const report = buildReport(parsed.transactions);
  assert.equal(report.balances.closing.amount, 140);
  assert.equal(report.balances.closing.source, "calculated");
  const original = fixtureReport();
  const updated = buildReport([
    ...original.transactions,
    {
      ...original.transactions[1],
      id: "manual-later",
      date: "2026-04-05",
      amount: -25.5,
      debit: 25.5,
      credit: 0,
      runningBalance: undefined,
    },
  ]);
  assert.equal(updated.balances.closing.amount, 11554);
  assert.equal(updated.balances.calculatedClosing.amount, 11554);
  assert.ok(
    !updated.alerts.some(
      (alert) => alert.title === "Balance Reconciliation Difference",
    ),
  );
});

test("currency sums use the same cent rounding as individual amounts", () => {
  assert.equal(sumMoney([1.005, 2.005]), 3.02);
  assert.equal(sumMoney([-1.005, -2.005]), -3.02);
  assert.equal(sumMoney([1.005, -1.005]), 0);
  assert.equal(sumMoney([0.1, 0.2]), 0.3);
  assert.equal(sumMoney([1.005]), roundMoney(1.005));
});

test("workbook preflight rejects decompression bombs and excessive columns", async () => {
  const bomb = zipSync({ "xl/workbook.xml": new Uint8Array(17 * 1024 * 1024) });
  assert.throws(() => boundedWorkbookArchive(bomb), /decompressed size/);
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Statement");
  sheet.getCell(1, 101).value = "too wide";
  await assert.rejects(
    readExcelStatement(
      new File(
        [new Uint8Array((await book.xlsx.writeBuffer()) as ArrayBuffer)],
        "wide.xlsx",
      ),
    ),
    /100 statement columns/,
  );
});

test("report recomputation preserves user goals and unfunded goals remain off track", () => {
  const report = fixtureReport();
  const goal = projectGoal({
    ...report.goals[0],
    id: "custom-goal",
    title: "My education",
    targetAmount: 10000,
    currentAmount: 2000,
    monthlyContribution: 0,
    deadline: "2027-01-01",
  });
  assert.equal(goal.onTrack, false);
  assert.match(goal.projectedCompletionDate, /Not funded/);
  assert.deepEqual(
    buildReport(
      report.transactions.map((t) => ({ ...t, isExcluded: true })),
      { goals: [goal] },
    ).goals,
    [goal],
  );
});

test("API bodies enforce actual streamed size, content type, origin and private responses", async () => {
  await assert.rejects(
    readBoundedRequest(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://evil.example",
        },
        body: "{}",
      }),
      "application/json",
      100,
    ),
    /Cross-origin/,
  );
  await assert.rejects(
    readBoundedRequest(
      new Request("http://localhost/api/chat", { method: "POST", body: "{}" }),
      "application/json",
      100,
    ),
    /application\/json/,
  );
  await assert.rejects(
    readBoundedRequest(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "x".repeat(101),
      }),
      "application/json",
      100,
    ),
    /size limit/,
  );
  const { POST } = await import("../app/api/chat/route");
  const originalKey = process.env.OPENAI_API_KEY;
  const enabled = process.env.ENABLE_OPENAI;
  const originalFetch = globalThis.fetch;
  let calls = 0;
  process.env.OPENAI_API_KEY = "test-key";
  delete process.env.ENABLE_OPENAI;
  globalThis.fetch = async () => {
    calls++;
    throw new Error("Paid AI must not run");
  };
  try {
    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: "How much did I save?",
          report: fixtureReport(),
          allowAiSharing: true,
        }),
      }),
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal((await response.json()).source, "local");
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
    if (enabled === undefined) delete process.env.ENABLE_OPENAI;
    else process.env.ENABLE_OPENAI = enabled;
  }
});

test("cloud client follows pages, revokes logout and clears rejected sessions", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    },
  });
  const originalFetch = globalThis.fetch;
  const routes: string[] = [];
  const report = fixtureReport();
  try {
    const preferences = LocalFinanceDatabase.savePreferences({
      ...DEFAULT_PREFERENCES,
      localOnlyMode: false,
      cloudSyncOptIn: true,
      authToken: "test-token",
      cloudSyncUrl: "https://example.com",
    });
    globalThis.fetch = async (input) => {
      const url = String(input);
      routes.push(url);
      if (url.includes("download?"))
        return Response.json({
          records: [
            {
              entityType: "report",
              entityId: "active-report",
              version: Date.parse(report.generatedAt),
              data: report,
            },
          ],
          cursor: "2026-11-02T00:00:00.000Z",
          hasMore: false,
        });
      if (url.endsWith("download"))
        return Response.json({
          records: [],
          cursor: "2026-11-01T00:00:00.000Z",
          hasMore: true,
        });
      return Response.json({});
    };
    assert.equal(
      (await synchronizeCloud(null, preferences)).report?.transactions.length,
      4,
    );
    assert.ok(routes.some((url) => url.includes("download?since=")));
    assert.equal((await signOutCloud(preferences)).authToken, "");
    assert.ok(routes.some((url) => url.endsWith("/api/auth/logout")));
    globalThis.fetch = async () =>
      Response.json({ error: "revoked" }, { status: 401 });
    await assert.rejects(
      synchronizeCloud(null, preferences),
      CloudSessionError,
    );
    assert.equal(LocalFinanceDatabase.getPreferences().authToken, "");
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {},
    });
    assert.throws(
      () => LocalFinanceDatabase.savePreferences({ theme: "dark" }),
      /storage is unavailable/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (descriptor) Object.defineProperty(globalThis, "window", descriptor);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("overlapping statements deduplicate references without deleting repeated cash purchases", () => {
  const header = "Date,Description,Amount,Reference";
  const first = parseStructuredTable(
    parseCsvRows(
      `${header}\n2026-04-01,Coffee,-5,\n2026-04-01,Coffee,-5,\n2026-04-02,Original memo,-10,REF1`,
    ),
    "first.csv",
  );
  const second = parseStructuredTable(
    parseCsvRows(
      `${header}\n2026-04-01,Coffee,-5,\n2026-04-02,Different memo,-10,REF1\n2026-04-03,New purchase,-7,REF2`,
    ),
    "second.csv",
  );
  const merged = mergeStatements([first, second]);
  assert.equal(merged.transactions.length, 4);
  assert.equal(merged.duplicateCount, 2);
  assert.equal(
    merged.transactions.filter(
      (transaction) => transaction.description === "Coffee",
    ).length,
    2,
  );
  assert.equal(mergeStatements([]).transactions.length, 0);
});

test("overlapping same-day statements preserve bank order and boundary balances regardless of file order", () => {
  const header = "Date,Description,Amount,Balance,Reference";
  const early = {
    ...parseStructuredTable(
      parseCsvRows(
        `${header}\n2026-04-01,Salary,100,150,A\n2026-04-01,Coffee,-10,140,B`,
      ),
    ),
    observedOpeningBalance: 50,
  };
  const late = {
    ...parseStructuredTable(
      parseCsvRows(
        `${header}\n2026-04-01,Coffee,-10,140,B\n2026-04-01,Groceries,-20,120,C`,
      ),
    ),
    observedOpeningBalance: 150,
  };
  for (const results of [
    [late, early],
    [early, late],
  ]) {
    const merged = mergeStatements(results);
    assert.deepEqual(
      merged.transactions.map((transaction) => transaction.amount),
      [100, -10, -20],
    );
    assert.equal(merged.duplicateCount, 1);
    assert.equal(merged.observedOpeningBalance, 50);
    assert.equal(merged.observedClosingBalance, 120);
    const report = buildReport(merged.transactions, {
      openingBalance: merged.observedOpeningBalance,
      closingBalance: merged.observedClosingBalance,
    });
    assert.equal(report.balances.calculatedClosing.amount, 120);
    assert.ok(
      !report.alerts.some(
        (alert) => alert.title === "Balance Reconciliation Difference",
      ),
    );
  }
});

test("transfers and excluded rows affect account balances but not spending totals", () => {
  const parsed = parseStructuredTable(parseCsvRows(statementCsv));
  parsed.transactions[1].isExcluded = true;
  const report = buildReport(parsed.transactions, {
    openingBalance: parsed.observedOpeningBalance,
    closingBalance: parsed.observedClosingBalance,
  });
  assert.equal(report.totals.income, 10000);
  assert.equal(report.totals.expenses, 300);
  assert.equal(report.totals.transfers, 3000);
  assert.equal(report.balances.opening.amount, 5000);
  assert.equal(report.balances.calculatedClosing.amount, 11579.5);
  assert.equal(report.balances.closing.source, "observed");
  assert.ok(
    !report.alerts.some(
      (alert) => alert.title === "Balance Reconciliation Difference",
    ),
  );
  const missing = parseStructuredTable(
    parseCsvRows("Date,Description,Amount,Balance\n2026-04-01,Coffee,-5,N/A"),
  );
  assert.equal(missing.transactions[0].runningBalance, undefined);
});

test("PDF geometry retains empty debit and credit cells", () => {
  const item = (str: string, x: number, y: number) => ({
    str,
    width: str.length * 5,
    transform: [1, 0, 0, 1, x, y],
  });
  const layout = pdfTextLayout([
    item("Date", 30, 700),
    item("Description", 125, 700),
    item("Debit", 340, 700),
    item("Credit", 415, 700),
    item("Balance", 490, 700),
    item("2026-04-01", 30, 660),
    item("ACME Salary", 125, 660),
    item("10000.00", 415, 660),
    item("15000.00", 490, 660),
    item("2026-04-02", 30, 630),
    item("Swiggy Food", 125, 630),
    item("120.50", 340, 630),
    item("14879.50", 490, 630),
  ]);
  assert.ok(layout.rows);
  assert.deepEqual(
    parseStructuredTable(layout.rows).transactions.map(
      (transaction) => transaction.amount,
    ),
    [10000, -120.5],
  );
});

test("CSV and XLSX exports round-trip negative amounts, exclusions, references and balances", async () => {
  const report = fixtureReport();
  report.transactions[1].isExcluded = true;
  assert.equal(safeCsvCell(-120.5), '"-120.5"');
  assert.equal(safeCsvCell("  =1+1"), '"\'  =1+1"');
  const csv = parseStructuredTable(parseCsvRows(reportToCsv(report)));
  assert.deepEqual(
    csv.transactions.map((transaction) => transaction.amount),
    report.transactions.map((transaction) => transaction.amount),
  );
  assert.equal(csv.transactions[1].isExcluded, true);
  const bytes = await reportToXlsx(report);
  const parsed = await readExcelStatement(
    new File([new Uint8Array(bytes as ArrayBuffer)], "export.xlsx"),
  );
  assert.equal(parsed.transactions.length, 4);
  assert.equal(parsed.transactions[1].isExcluded, true);
  assert.equal(parsed.transactions[1].reference, "UPI001");
  assert.equal(parsed.transactions[3].type, "transfer");
});

test("Excel formulas, native dates, rich text and sparse cells remain readable", async () => {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Statement");
  sheet.addRow(["Date", "Description", "Debit", "Credit", "Balance"]);
  sheet.addRow([
    new Date("2026-04-01T00:00:00Z"),
    { richText: [{ text: "ACME " }, { text: "Salary" }] },
    null,
    { formula: "5000+5000", result: 10000 },
    15000,
  ]);
  const parsed = await readExcelStatement(
    new File(
      [new Uint8Array((await book.xlsx.writeBuffer()) as ArrayBuffer)],
      "sparse.xlsx",
    ),
  );
  assert.equal(parsed.transactions[0].amount, 10000);
  assert.equal(parsed.transactions[0].description, "ACME Salary");
});

test("text PDFs parse every page and encrypted PDFs accept the supplied password", async () => {
  const file = new File(
    [new Uint8Array(await createPdfStatement({ pages: 4 }))],
    "four-pages.pdf",
  );
  const parsed = await readServerPdfStatement(file);
  assert.deepEqual(
    parsed.transactions.map((transaction) => transaction.amount),
    [10000, -120.5, -300, -3000],
  );
  const encrypted = new File(
    [new Uint8Array(await createPdfStatement({ encrypted: true }))],
    "encrypted.pdf",
  );
  await assert.rejects(readServerPdfStatement(encrypted), /password protected/);
  assert.equal(
    (await readServerPdfStatement(encrypted, "statement-pass")).transactions
      .length,
    4,
  );
});

test("PDF opening and closing summary-only pages are retained", async () => {
  const parsed = await readServerPdfStatement(
    new File(
      [new Uint8Array(await createPdfStatement({ summaryPages: true }))],
      "summary-pages.pdf",
    ),
  );
  assert.equal(parsed.transactions.length, 4);
  assert.equal(parsed.observedOpeningBalance, 5000);
  assert.equal(parsed.observedClosingBalance, 11579.5);
});

test("multi-page PDFs do not present an earlier page balance as the final balance", async () => {
  const parsed = await readServerPdfStatement(
    new File(
      [
        new Uint8Array(
          await createPdfStatement({ pages: 4, omitLastBalance: true }),
        ),
      ],
      "partial-balances.pdf",
    ),
  );
  assert.equal(parsed.observedClosingBalance, undefined);
  const report = buildReport(parsed.transactions);
  assert.equal(report.balances.closing.amount, 11579.5);
  assert.equal(report.balances.closing.source, "calculated");
});

test("server OCR reads all scanned PDF pages using bundled English data", async () => {
  const file = new File(
    [new Uint8Array(await createPdfStatement({ pages: 4, scanned: true }))],
    "scanned-pages.pdf",
  );
  const parsed = await readServerPdfStatement(file);
  assert.deepEqual(
    parsed.transactions.map((transaction) => transaction.amount),
    [10000, -120.5, -300, -3000],
  );
  assert.ok(
    parsed.transactions.every((transaction) => transaction.confidence <= 0.7),
  );
  assert.equal(parsed.observedClosingBalance, 11579.5);
});

test("PDF exports include the entire ledger beyond 100 transactions", async () => {
  const report = fixtureReport();
  const transactions = Array.from({ length: 105 }, (_, index) => ({
    ...report.transactions[1],
    id: `ledger-${index}`,
    description: `Ledger entry ${index + 1}`,
  }));
  const output = await reportToPdf(buildReport(transactions));
  assert.equal(Buffer.from(output.subarray(0, 5)).toString(), "%PDF-");
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: output });
  try {
    assert.match((await parser.getText()).text, /Ledger entry 105/);
  } finally {
    await parser.destroy();
  }
});

test("portable backups exclude credentials, validate input and retain reports after invalid restore", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: storage },
  });
  try {
    LocalFinanceDatabase.savePreferences({
      authToken: "private-token",
      authEmail: "private@example.com",
      cloudSyncOptIn: true,
    });
    await LocalFinanceDatabase.saveActiveReport(fixtureReport());
    LocalFinanceDatabase.saveUserRule("coffee", "Food");
    const backup = await LocalFinanceDatabase.exportFullBackup();
    assert.ok(
      !backup.includes("private-token") &&
        !backup.includes("private@example.com"),
    );
    assert.equal(
      await LocalFinanceDatabase.importFullBackup('{"version":2,"report":{}}'),
      false,
    );
    assert.equal(
      (await LocalFinanceDatabase.getActiveReport())?.transactions.length,
      4,
    );
    await LocalFinanceDatabase.clearAllData();
    assert.equal(await LocalFinanceDatabase.getActiveReport(), null);
    assert.equal(LocalFinanceDatabase.getPreferences().cloudSyncOptIn, false);
    assert.equal(await LocalFinanceDatabase.importFullBackup(backup), true);
    assert.equal(
      (await LocalFinanceDatabase.getActiveReport())?.transactions.length,
      4,
    );
    assert.equal(LocalFinanceDatabase.getUserRules().coffee, "Food");
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "window", descriptor);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("legacy transaction backups and explicit empty reports restore the requested ledger", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    },
  });
  try {
    const original = fixtureReport();
    const goals = [
      { ...original.goals[0], id: "legacy-goal", title: "Legacy goal" },
    ];
    await LocalFinanceDatabase.saveActiveReport(original);
    assert.equal(
      await LocalFinanceDatabase.importFullBackup(
        JSON.stringify({
          version: 1,
          transactions: original.transactions.slice(0, 2),
          goals,
        }),
      ),
      true,
    );
    assert.equal(
      (await LocalFinanceDatabase.getActiveReport())?.transactions.length,
      2,
    );
    assert.deepEqual(
      (await LocalFinanceDatabase.getActiveReport())?.goals,
      goals,
    );
    assert.equal(
      await LocalFinanceDatabase.importFullBackup(
        JSON.stringify({
          version: 2,
          report: null,
          transactions: [],
          goals: [],
        }),
      ),
      true,
    );
    assert.equal(await LocalFinanceDatabase.getActiveReport(), null);
    assert.equal(
      await LocalFinanceDatabase.importFullBackup(
        JSON.stringify({
          version: 1,
          transactions: original.transactions,
        }),
      ),
      true,
    );
    assert.equal(
      (await LocalFinanceDatabase.getActiveReport())?.transactions.length,
      4,
    );
    assert.equal(
      await LocalFinanceDatabase.importFullBackup(
        JSON.stringify({
          version: 2,
          report: original,
          goals,
        }),
      ),
      true,
    );
    assert.deepEqual(
      (await LocalFinanceDatabase.getActiveReport())?.goals,
      goals,
    );
    await LocalFinanceDatabase.clearAllData();
    assert.equal(
      await LocalFinanceDatabase.importFullBackup(
        JSON.stringify({ version: 1, goals }),
      ),
      true,
    );
    const imported = await DeviceStatementProcessor.processFilesLocally([
      new File([statementCsv], "new-statement.csv"),
    ]);
    assert.deepEqual(imported.report.goals, goals);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "window", descriptor);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("simulator deltas change savings and public cloud URLs require HTTPS", () => {
  const scenario = runSpendingSimulation(10000, 5000, 20000, {
    incomeDelta: 2000,
    foodDelta: -500,
    unexpectedExpense: 1000,
  }).find((item) => item.scenarioName === "Custom What-If");
  assert.equal(scenario?.netSavings, 6500);
  assert.equal(cloudBackendUrl("https://example.com/"), "https://example.com");
  assert.throws(() => cloudBackendUrl("http://example.com"), /HTTPS/);
  assert.throws(
    () => cloudBackendUrl("https://user:password@example.com"),
    /HTTPS/,
  );
});

test("server-assisted analysis preserves overlapping files and never automatically shares with AI", async () => {
  const { POST } = await import("../app/api/analyze/route");
  const form = new FormData();
  form.append(
    "files",
    new File([statementCsv], "one.csv", { type: "text/csv" }),
  );
  form.append(
    "files",
    new File([statementCsv], "two.csv", { type: "text/csv" }),
  );
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  let requests = 0;
  process.env.OPENAI_API_KEY = "test-key";
  globalThis.fetch = async () => {
    requests++;
    throw new Error("Unexpected external request");
  };
  try {
    const response = await POST(
      new Request("http://localhost/api/analyze", {
        method: "POST",
        body: form,
      }),
    );
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.report.transactions.length, 4);
    assert.equal(data.report.importSummary.duplicatesRemoved, 4);
    assert.equal(data.report.balances.opening.amount, 5000);
    assert.equal(data.privacy.aiShared, false);
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  }
});
