import {
  insightReportSchema,
  type InsightReport,
  type Transaction,
} from "./schemas";
import {
  parseCsvRows,
  parseStructuredTable,
  parseGenericBankText,
  type ParseResult,
} from "./bank-parsers";
import { buildReport } from "./finance-engine";
import { LocalFinanceDatabase } from "./local-storage";
import { categorizeTransaction } from "./categorizer";
import { validateUploadFiles } from "./upload-validation";
import { mergeStatements } from "./statement-import";

export type ProgressCallback = (step: string, percentage: number) => void;

export class DeviceStatementProcessor {
  static async processFilesLocally(
    files: File[],
    onProgress?: ProgressCallback,
    options: { pdfPassword?: string } = {},
  ): Promise<{
    report: InsightReport;
    transactions: Transaction[];
    isLocal: boolean;
  }> {
    const validation = validateUploadFiles(files);
    if (!validation.ok) throw new Error(validation.message);
    const results: ParseResult[] = [];
    onProgress?.("Reading local files...", 10);
    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      onProgress?.(
        `Parsing ${file.name} locally...`,
        15 + Math.round((index / files.length) * 40),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
      let parsed: ParseResult;
      const name = file.name.toLowerCase();
      try {
        if (name.endsWith(".csv"))
          parsed = parseStructuredTable(
            parseCsvRows(await file.text()),
            file.name,
          );
        else if (name.endsWith(".xlsx"))
          parsed = await (
            await import("./spreadsheet-parser")
          ).readExcelStatement(file);
        else if (name.endsWith(".pdf"))
          parsed = await (
            await import("./pdf-parser")
          ).readPdfStatement(file, options.pdfPassword, (step) =>
            onProgress?.(step, 20 + Math.round((index / files.length) * 40)),
          );
        else parsed = parseGenericBankText(await file.text(), file.name);
      } catch (error) {
        throw new Error(
          `${file.name}: ${error instanceof Error ? error.message : "Could not read this statement."}`,
        );
      }
      if (!parsed.transactions.length)
        throw new Error(
          `No transactions were found in ${file.name}. Check its dates and amount columns or try the bank's CSV/XLSX export.`,
        );
      results.push(parsed);
    }
    const merged = mergeStatements(results);
    const transactions = merged.transactions;
    onProgress?.(
      "Applying your category rules and calculating financial metrics...",
      70,
    );
    const rules = LocalFinanceDatabase.getUserRules();
    for (const transaction of transactions) {
      const matched = Object.keys(rules).some((pattern) =>
        transaction.description.toLowerCase().includes(pattern),
      );
      if (matched) {
        const category = categorizeTransaction(
          transaction.description,
          transaction.amount,
          rules,
        );
        transaction.category = category.category;
        transaction.subcategory = category.subcategory;
        transaction.type = category.isTransfer
          ? "transfer"
          : transaction.amount > 0
            ? "income"
            : "expense";
        transaction.confidence = category.confidence;
        transaction.isReviewed = true;
      }
    }
    const report = insightReportSchema.parse(
      buildReport(transactions, {
        fileNames: files.map((file) => file.name),
        duplicatesRemoved: merged.duplicateCount,
        openingBalance: merged.observedOpeningBalance,
        closingBalance: merged.observedClosingBalance,
        goals: (await LocalFinanceDatabase.getActiveReport())?.goals,
      }),
    );
    onProgress?.(
      "Saving your verified report in private device storage...",
      90,
    );
    await LocalFinanceDatabase.saveActiveReport(report);
    onProgress?.("Analysis complete!", 100);
    return { report, transactions, isLocal: true };
  }
}
