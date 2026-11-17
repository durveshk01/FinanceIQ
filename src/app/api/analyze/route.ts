import { NextResponse } from "next/server";
import { buildReport } from "@/lib/finance-engine";
import {
  parseCsvRows,
  parseGenericBankText,
  parseStructuredTable,
  type ParseResult,
} from "@/lib/bank-parsers";
import { readExcelStatement } from "@/lib/spreadsheet-parser";
import { mergeStatements } from "@/lib/statement-import";
import {
  errorResponse,
  getClientIp,
  logEvent,
  PRIVATE_HEADERS,
  rateLimit,
  readBoundedRequest,
  requestErrorResponse,
  validateUploadFiles,
} from "@/lib/api-security";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const limited = rateLimit({
    key: `analyze:${getClientIp(request)}`,
    limit: 8,
    windowMs: 60_000,
  });
  if (!limited.allowed)
    return errorResponse(
      "Too many analysis requests. Please wait a minute and try again.",
      429,
    );

  let form: FormData;
  try {
    form = await (
      await readBoundedRequest(request, "multipart/form-data", 51 * 1024 * 1024)
    ).formData();
  } catch (error) {
    return requestErrorResponse(error);
  }
  const files = form
    .getAll("files")
    .filter((file): file is File => file instanceof File);
  const validation = validateUploadFiles(files);
  if (!validation.ok) return errorResponse(validation.message, 400);
  const password = form.get("pdfPassword");
  if (
    password !== null &&
    (typeof password !== "string" || password.length > 256)
  )
    return errorResponse("Invalid PDF password.", 400);

  try {
    const results: ParseResult[] = [];
    for (const file of files) {
      const name = file.name.toLowerCase();
      let parsed: ParseResult;
      if (name.endsWith(".csv"))
        parsed = parseStructuredTable(
          parseCsvRows(await file.text()),
          file.name,
        );
      else if (name.endsWith(".xlsx")) parsed = await readExcelStatement(file);
      else if (name.endsWith(".pdf"))
        parsed = await (
          await import("@/lib/server-pdf-parser")
        ).readServerPdfStatement(file, password || undefined);
      else parsed = parseGenericBankText(await file.text(), file.name);
      if (!parsed.transactions.length)
        return errorResponse(
          `No transactions were found in ${file.name}. Check its dates and amount columns or try the bank's CSV/XLSX export.`,
          422,
        );
      results.push(parsed);
    }
    const merged = mergeStatements(results);
    // Server-assisted parsing does not imply permission to share data with AI.
    return NextResponse.json(
      {
        report: buildReport(merged.transactions, {
          fileNames: files.map((file) => file.name),
          duplicatesRemoved: merged.duplicateCount,
          openingBalance: merged.observedOpeningBalance,
          closingBalance: merged.observedClosingBalance,
        }),
        privacy: {
          retained: false,
          aiShared: false,
          message:
            "Files are processed for this request only and are not stored or sent to an AI provider.",
        },
      },
      { headers: PRIVATE_HEADERS },
    );
  } catch (error) {
    logEvent("warn", "Statement parser failed", {
      reason: error instanceof Error ? error.name : "unknown",
    });
    return errorResponse(
      error instanceof Error
        ? error.message
        : "Could not read this statement. Try the bank's CSV/XLSX export.",
      422,
    );
  }
}
