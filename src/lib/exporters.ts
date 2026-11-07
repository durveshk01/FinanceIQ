import type { InsightReport } from "@/lib/finance-engine";

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function safeCsvCell(value: string | number) {
  const text = String(value);
  const formulaSafe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${formulaSafe.replace(/"/g, '""')}"`;
}

export function reportToCsv(report: InsightReport) {
  const rows = [
    ["Date", "Merchant", "Description", "Category", "Amount", "Type"],
    ...report.transactions.map((txn) => [txn.date, txn.merchant, txn.description, txn.category, String(txn.amount), txn.type]),
  ];
  return rows.map((row) => row.map((cell) => safeCsvCell(cell)).join(",")).join("\n");
}

export function reportToPdfHtml(report: InsightReport) {
  const categories = report.categories
    .map((category) => `<tr><td>${escapeXml(category.name)}</td><td>${category.amount}</td><td>${category.percent}%</td></tr>`)
    .join("");
  const transactions = report.transactions
    .slice(0, 100)
    .map((txn) => `<tr><td>${escapeXml(txn.date)}</td><td>${escapeXml(txn.merchant)}</td><td>${escapeXml(txn.category)}</td><td>${txn.amount}</td></tr>`)
    .join("");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>FinanceIQ Report</title>
<style>
  body { font-family: Arial, sans-serif; color: #111827; padding: 32px; }
  h1 { color: #0f766e; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0 28px; }
  th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; font-size: 12px; }
  th { background: #f3f4f6; }
  .metric { display: inline-block; margin-right: 24px; }
  .muted { color: #6b7280; }
</style>
</head>
<body>
  <h1>FinanceIQ Financial Health Report</h1>
  <p class="muted">Generated ${escapeXml(report.generatedAt)}</p>
  <p class="metric"><strong>Income:</strong> ${report.totals.income}</p>
  <p class="metric"><strong>Expenses:</strong> ${report.totals.expenses}</p>
  <p class="metric"><strong>Net Savings:</strong> ${report.totals.netSavings}</p>
  <p class="metric"><strong>Health Score:</strong> ${report.health.score}/100 (${escapeXml(report.health.label)})</p>
  <h2>Categories</h2>
  <table><thead><tr><th>Category</th><th>Amount</th><th>Percent</th></tr></thead><tbody>${categories}</tbody></table>
  <h2>Alerts</h2>
  <ul>${report.alerts.map((alert) => `<li><strong>${escapeXml(alert.title)}:</strong> ${escapeXml(alert.detail)}</li>`).join("")}</ul>
  <h2>Transactions</h2>
  <table><thead><tr><th>Date</th><th>Merchant</th><th>Category</th><th>Amount</th></tr></thead><tbody>${transactions}</tbody></table>
</body>
</html>`;
}

export async function reportToXlsx(report: InsightReport) {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "FinanceIQ";
  workbook.created = new Date();

  const summary = workbook.addWorksheet("Summary");
  summary.columns = [
    { header: "Metric", key: "metric", width: 28 },
    { header: "Value", key: "value", width: 24 },
  ];
  summary.addRows([
    { metric: "Income", value: report.totals.income },
    { metric: "Expenses", value: report.totals.expenses },
    { metric: "Net Savings", value: report.totals.netSavings },
    { metric: "Savings Rate", value: `${report.totals.savingsRate}%` },
    { metric: "Health Score", value: report.health.score },
    { metric: "Health Label", value: report.health.label },
  ]);

  const transactions = workbook.addWorksheet("Transactions");
  transactions.columns = [
    { header: "Date", key: "date", width: 16 },
    { header: "Merchant", key: "merchant", width: 28 },
    { header: "Description", key: "description", width: 42 },
    { header: "Category", key: "category", width: 20 },
    { header: "Amount", key: "amount", width: 16 },
    { header: "Type", key: "type", width: 12 },
  ];
  transactions.addRows(report.transactions.map((txn) => ({
    date: txn.date,
    merchant: txn.merchant,
    description: txn.description,
    category: txn.category,
    amount: txn.amount,
    type: txn.type,
  })));

  for (const worksheet of [summary, transactions]) {
    worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    worksheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
    worksheet.views = [{ state: "frozen", ySplit: 1 }];
  }

  return workbook.xlsx.writeBuffer();
}

export async function reportToPdf(report: InsightReport) {
  const PDFDocument = (await import("pdfkit")).default;
  const doc = new PDFDocument({ margin: 48, size: "A4" });
  const chunks: Buffer[] = [];

  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  doc.fontSize(22).fillColor("#0f766e").text("FinanceIQ Financial Health Report");
  doc.moveDown(0.5).fontSize(9).fillColor("#6b7280").text(`Generated ${report.generatedAt}`);
  doc.moveDown();

  doc.fontSize(13).fillColor("#111827").text(`Health Score: ${report.health.score}/100 (${report.health.label})`);
  doc.text(`Income: ${report.totals.income}`);
  doc.text(`Expenses: ${report.totals.expenses}`);
  doc.text(`Net Savings: ${report.totals.netSavings}`);
  doc.text(`Savings Rate: ${report.totals.savingsRate}%`);
  doc.moveDown();

  doc.fontSize(15).fillColor("#0f766e").text("Top Categories");
  doc.moveDown(0.4).fontSize(10).fillColor("#111827");
  for (const category of report.categories.slice(0, 8)) {
    doc.text(`${category.name}: ${category.amount} (${category.percent}%)`);
  }
  doc.moveDown();

  doc.fontSize(15).fillColor("#0f766e").text("Alerts");
  doc.moveDown(0.4).fontSize(10).fillColor("#111827");
  for (const alert of report.alerts) {
    doc.text(`${alert.severity.toUpperCase()} - ${alert.title}: ${alert.detail}`);
  }
  doc.moveDown();

  doc.fontSize(15).fillColor("#0f766e").text("Recent Transactions");
  doc.moveDown(0.4).fontSize(8).fillColor("#111827");
  for (const txn of report.transactions.slice(0, 60)) {
    doc.text(`${txn.date} | ${txn.merchant} | ${txn.category} | ${txn.amount}`);
  }

  doc.end();
  return done;
}
