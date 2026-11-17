import type { CellValue } from "exceljs";
import { Unzip, UnzipInflate, zipSync } from "fflate";
import {
  chronologicalTransactions,
  parseStructuredTable,
  type ParseResult,
} from "./bank-parsers";
import { MAX_TRANSACTIONS } from "./upload-validation";

/** Bound actual decompressed bytes, not attacker-controlled ZIP size metadata.
 * Normalize the archive before ExcelJS so central-directory tricks cannot make
 * it decompress entries that the preflight did not inspect. */
export function boundedWorkbookArchive(
  bytes: Uint8Array,
): Uint8Array<ArrayBuffer> {
  if (bytes.byteLength > 10 * 1024 * 1024)
    throw new Error("The workbook exceeds the 10 MB upload limit.");
  const files: Record<string, Uint8Array> = Object.create(null);
  const names = new Set<string>();
  let total = 0;
  const unzip = new Unzip((file) => {
    if (names.has(file.name) || names.size >= 512 || file.name.length > 500)
      throw new Error(
        "The workbook has too many or duplicate archive entries.",
      );
    names.add(file.name);
    let size = 0;
    const chunks: Uint8Array[] = [];
    file.ondata = (error, data, final) => {
      if (error) throw error;
      size += data.byteLength;
      total += data.byteLength;
      if (size > 16 * 1024 * 1024 || total > 32 * 1024 * 1024)
        throw new Error("The workbook exceeds its decompressed size limit.");
      chunks.push(data);
      if (final) {
        const output = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          output.set(chunk, offset);
          offset += chunk.byteLength;
        }
        files[file.name] = output;
      }
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  for (let offset = 0; offset < bytes.length; offset += 4096)
    unzip.push(
      bytes.subarray(offset, offset + 4096),
      offset + 4096 >= bytes.length,
    );
  if (!files["xl/workbook.xml"] || Object.keys(files).length !== names.size)
    throw new Error("This is not a complete XLSX workbook.");
  return zipSync(files, { level: 0 });
}

function cellText(value: CellValue): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("result" in value) return cellText(value.result ?? null);
    if ("richText" in value)
      return value.richText.map((part) => part.text).join("");
    if ("text" in value) return value.text;
    return "";
  }
  return String(value);
}

export async function readExcelStatement(file: File): Promise<ParseResult> {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    boundedWorkbookArchive(new Uint8Array(await file.arrayBuffer())).buffer,
  );
  const results: ParseResult[] = [];
  let totalRows = 0;
  if (workbook.worksheets.length > 20)
    throw new Error("Import workbooks with at most 20 worksheets.");
  workbook.eachSheet((sheet) => {
    if (sheet.columnCount > 100)
      throw new Error("The worksheet exceeds 100 statement columns.");
    const rows: string[][] = [];
    sheet.eachRow((row) => {
      const cells: string[] = [];
      // row.values is sparse; iterating cells preserves blank debit/credit columns.
      for (
        let column = 1;
        column <= Math.max(sheet.columnCount, row.cellCount);
        column++
      )
        cells.push(cellText(row.getCell(column).value));
      rows.push(cells);
      totalRows++;
      if (totalRows > MAX_TRANSACTIONS + 25 * workbook.worksheets.length)
        throw new Error("The workbook exceeds 10,000 statement rows.");
    });
    const parsed = parseStructuredTable(rows, file.name);
    if (parsed.transactions.length) results.push(parsed);
  });
  const transactions = chronologicalTransactions(
    results.flatMap((result) => result.transactions),
  );
  if (transactions.length > MAX_TRANSACTIONS)
    throw new Error("Import at most 10,000 transactions at a time.");
  return {
    transactions,
    duplicateCount: results.reduce(
      (sum, result) => sum + result.duplicateCount,
      0,
    ),
    transferCount: transactions.filter((t) => t.type === "transfer").length,
    observedOpeningBalance: results[0]?.observedOpeningBalance,
    observedClosingBalance: results[results.length - 1]?.observedClosingBalance,
    formatDetected: "Excel Workbook",
  };
}
