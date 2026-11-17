import { NextResponse } from "next/server";
import {
  errorResponse,
  getClientIp,
  PRIVATE_HEADERS,
  rateLimit,
  readBoundedRequest,
  requestErrorResponse,
  validationErrorResponse,
} from "@/lib/api-security";
import { reportToCsv, reportToPdf, reportToXlsx } from "@/lib/exporters";
import { exportRequestSchema } from "@/lib/schemas";
import { buildReport } from "@/lib/finance-engine";

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const limited = rateLimit({
    key: `export:${ip}`,
    limit: 20,
    windowMs: 60_000,
  });
  if (!limited.allowed) {
    return errorResponse(
      "Too many export requests. Please wait a minute and try again.",
      429,
    );
  }

  let payload: unknown;
  try {
    payload = await (
      await readBoundedRequest(request, "application/json", 4 * 1024 * 1024)
    ).json();
  } catch (error) {
    return requestErrorResponse(error);
  }

  const parsed = exportRequestSchema.safeParse(payload);
  if (!parsed.success) return validationErrorResponse(parsed.error);

  const { format, filters } = parsed.data;
  const report = filters
    ? buildReport(
        parsed.data.report.transactions.filter(
          (transaction) =>
            (!filters.startDate || transaction.date >= filters.startDate) &&
            (!filters.endDate || transaction.date <= filters.endDate) &&
            (!filters.category || transaction.category === filters.category),
        ),
        {
          fileNames: parsed.data.report.importSummary?.fileNames,
          goals: parsed.data.report.goals,
        },
      )
    : parsed.data.report;

  if (format === "json") {
    return new NextResponse(JSON.stringify(report, null, 2), {
      headers: {
        ...PRIVATE_HEADERS,
        "Content-Type": "application/json",
        "Content-Disposition": "attachment; filename=financeiq-report.json",
      },
    });
  }

  if (format === "pdf") {
    const buffer = await reportToPdf(report);
    return new NextResponse(
      new Blob([new Uint8Array(buffer)], { type: "application/pdf" }),
      {
        headers: {
          ...PRIVATE_HEADERS,
          "Content-Type": "application/pdf",
          "Content-Disposition": "attachment; filename=financeiq-report.pdf",
        },
      },
    );
  }

  if (format === "xlsx") {
    const buffer = await reportToXlsx(report);
    return new NextResponse(
      new Blob([new Uint8Array(buffer as ArrayBuffer)], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      {
        headers: {
          ...PRIVATE_HEADERS,
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition":
            "attachment; filename=financeiq-transactions.xlsx",
        },
      },
    );
  }

  const csv = reportToCsv(report);
  return new NextResponse(csv, {
    headers: {
      ...PRIVATE_HEADERS,
      "Content-Type": "text/csv",
      "Content-Disposition": "attachment; filename=financeiq-transactions.csv",
    },
  });
}
