import PDFDocument from "pdfkit";
import {
  buildReport,
  parseTransactionsFromText,
} from "../src/lib/finance-engine";

export const statementRows = [
  ["2026-04-01", "ACME Salary", "", "10000.00", "15000.00", "SAL001"],
  ["2026-04-02", "Swiggy Food", "120.50", "", "14879.50", "UPI001"],
  ["2026-04-03", "Netflix Subscription", "300.00", "", "14579.50", "NET001"],
  [
    "2026-04-04",
    "Self transfer to savings",
    "3000.00",
    "",
    "11579.50",
    "TRF001",
  ],
];
export const statementCsv = [
  "Date,Description,Debit,Credit,Balance,Reference",
  ",Opening Balance,,,5000.00,",
  ...statementRows.map((row) => row.join(",")),
  ",Closing Balance,,,11579.50,",
].join("\n");

export function fixtureReport() {
  return buildReport(parseTransactionsFromText(statementCsv, "fixture.csv"), {
    openingBalance: 5000,
    closingBalance: 11579.5,
    fileNames: ["fixture.csv"],
  });
}

export async function createPdfStatement(
  options: {
    pages?: number;
    scanned?: boolean;
    encrypted?: boolean;
    summaryPages?: boolean;
    omitLastBalance?: boolean;
  } = {},
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margin: 30,
    ...(options.encrypted
      ? { userPassword: "statement-pass", ownerPassword: "fixture-owner-pass" }
      : {}),
  });
  const chunks: Buffer[] = [];
  const complete = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });
  const pageCount = options.pages ?? 1;
  if (options.summaryPages) {
    doc.fontSize(12).text("Opening Balance: 5000.00", 30, 60);
    doc.addPage();
  }
  for (let page = 0; page < pageCount; page++) {
    if (page) doc.addPage();
    const pageRows =
      pageCount === 1
        ? statementRows
        : [statementRows[page % statementRows.length]];
    const rows = pageRows.map((row) =>
      options.omitLastBalance && row === statementRows.at(-1)
        ? row.map((value, column) => (column === 4 ? "" : value))
        : row,
    );
    const headers = ["Date", "Description", "Debit", "Credit", "Balance"];
    if (options.scanned) {
      const { createCanvas } = await import("@napi-rs/canvas");
      const canvas = createCanvas(1200, 1500);
      const context = canvas.getContext("2d");
      context.fillStyle = "white";
      context.fillRect(0, 0, 1200, 1500);
      context.fillStyle = "black";
      context.font = "bold 28px Arial";
      context.fillText("Bank Statement", 40, 70);
      const x = [40, 255, 710, 845, 985];
      context.font = "bold 24px Arial";
      headers.forEach((header, index) =>
        context.fillText(header, x[index], 135),
      );
      context.font = "24px Arial";
      rows.forEach((row, rowIndex) =>
        row
          .slice(0, 5)
          .forEach((value, column) =>
            context.fillText(value, x[column], 195 + rowIndex * 60),
          ),
      );
      doc.image(canvas.toBuffer("image/png"), 30, 30, { width: 535 });
    } else {
      doc.fontSize(16).text("Bank Statement", 30, 35);
      const x = [30, 125, 340, 415, 490];
      doc.font("Helvetica-Bold").fontSize(10);
      headers.forEach((header, index) =>
        doc.text(header, x[index], 85, { lineBreak: false }),
      );
      doc.font("Helvetica");
      rows.forEach((row, rowIndex) =>
        row.slice(0, 5).forEach((value, column) => {
          if (value)
            doc.text(value, x[column], 115 + rowIndex * 35, {
              lineBreak: false,
            });
        }),
      );
    }
  }
  if (options.summaryPages) {
    doc.addPage().fontSize(12).text("Closing Balance: 11579.50", 30, 60);
  }
  doc.end();
  return complete;
}
