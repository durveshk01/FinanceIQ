import { type InsightReport, type Transaction } from "./schemas";
import { parseCsvRows, parseStructuredTable, parseGenericBankText } from "./bank-parsers";
import { buildReport } from "./finance-engine";
import { LocalFinanceDatabase } from "./local-storage";

export type ProgressCallback = (step: string, percentage: number) => void;

export class DeviceStatementProcessor {
  /**
   * Processes bank statements 100% locally on device CPU and memory.
   * Never uploads raw documents to Render or external servers.
   */
  static async processFilesLocally(
    files: File[],
    onProgress?: ProgressCallback,
  ): Promise<{ report: InsightReport; transactions: Transaction[]; isLocal: boolean }> {
    onProgress?.("Reading local files...", 10);

    let allTransactions: Transaction[] = [];
    const fileNames: string[] = [];

    for (let fIdx = 0; fIdx < files.length; fIdx++) {
      const file = files[fIdx];
      fileNames.push(file.name);
      const name = file.name.toLowerCase();

      onProgress?.(`Parsing ${file.name} locally...`, 20 + Math.round((fIdx / files.length) * 30));

      let fileTxns: Transaction[] = [];

      if (name.endsWith(".csv")) {
        const text = await file.text();
        const rows = parseCsvRows(text);
        const parsed = parseStructuredTable(rows, file.name);
        fileTxns = parsed.transactions;
      } else if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
        fileTxns = await this.parseExcelLocally(file);
      } else if (name.endsWith(".pdf")) {
        fileTxns = await this.parsePdfLocally(file);
      } else {
        // Plain text fallback
        const text = await file.text();
        const parsed = parseGenericBankText(text, file.name);
        fileTxns = parsed.transactions;
      }

      allTransactions = [...allTransactions, ...fileTxns];
    }

    if (allTransactions.length === 0) {
      throw new Error("No transactions could be extracted from the selected files. Please check that the file is an unencrypted text or spreadsheet bank statement.");
    }

    onProgress?.("Deduplicating & normalizing transactions...", 60);
    // Deduplicate across files
    const uniqueMap = new Map<string, Transaction>();
    for (const t of allTransactions) {
      const hash = `${t.date}_${t.amount}_${t.description.slice(0, 30).toLowerCase()}`;
      if (!uniqueMap.has(hash)) {
        uniqueMap.set(hash, t);
      }
    }
    const sanitizedTxns = [...uniqueMap.values()].sort((a, b) => a.date.localeCompare(b.date));

    onProgress?.("Running financial intelligence & categorization...", 75);
    const userRules = LocalFinanceDatabase.getUserRules();
    const ruleEntries = Object.entries(userRules);
    if (ruleEntries.length > 0) {
      for (const t of sanitizedTxns) {
        const desc = t.description.toLowerCase();
        for (const [pattern, cat] of ruleEntries) {
          if (desc.includes(pattern.toLowerCase())) {
            t.category = cat;
            break;
          }
        }
      }
    }
    const report = buildReport(sanitizedTxns, { fileNames });

    onProgress?.("Calculating health score & forecast on device...", 90);
    // Persist verified report locally on device
    LocalFinanceDatabase.saveActiveReport(report);

    onProgress?.("Analysis complete!", 100);

    return {
      report,
      transactions: sanitizedTxns,
      isLocal: true,
    };
  }

  private static async parseExcelLocally(file: File): Promise<Transaction[]> {
    try {
      const ExcelJS = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      const buffer = await file.arrayBuffer();
      await workbook.xlsx.load(buffer);

      const rows: string[][] = [];
      workbook.eachSheet((sheet) => {
        sheet.eachRow((row) => {
          const values = Array.isArray(row.values) ? row.values.slice(1) : [];
          rows.push(values.map((v) => String(v ?? "")));
        });
      });

      const parsed = parseStructuredTable(rows, file.name);
      return parsed.transactions;
    } catch (e) {
      console.warn("Excel parsing fallback on device:", e);
      return [];
    }
  }

  private static async parsePdfLocally(file: File): Promise<Transaction[]> {
    try {
      const buffer = await file.arrayBuffer();
      const uint8 = new Uint8Array(buffer);

      // Extract text content from raw PDF streams or text markers
      let rawText = "";
      const textDecoder = new TextDecoder("latin1");
      const fullText = textDecoder.decode(uint8);

      // Extract text within standard PDF text streams (between BT and ET operators)
      const streamRegex = /BT[\s\S]*?ET/g;
      const matches = fullText.match(streamRegex);

      if (matches && matches.length > 0) {
        for (const match of matches) {
          // Extract strings inside parentheses (Tj or TJ)
          const stringMatches = match.match(/\((?:\\\(|\\\)|[^()]*)\)/g);
          if (stringMatches) {
            const line = stringMatches
              .map((s) => s.slice(1, -1).replace(/\\([()\\])/g, "$1"))
              .join(" ");
            rawText += `${line}\n`;
          }
        }
      }

      if (rawText.trim().length > 50) {
        const parsed = parseGenericBankText(rawText, file.name);
        if (parsed.transactions.length > 0) {
          return parsed.transactions;
        }
      }

      // If text stream is sparse or scanned, use regex across full binary text
      const parsed = parseGenericBankText(fullText, file.name);
      return parsed.transactions;
    } catch (err) {
      console.warn("Local PDF extraction encountered error:", err);
      return [];
    }
  }
}
