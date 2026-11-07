import { NextResponse } from "next/server";
import { errorResponse, getClientIp, rateLimit, validationErrorResponse } from "@/lib/api-security";
import { reportToCsv, reportToPdf, reportToXlsx } from "@/lib/exporters";
import { exportRequestSchema } from "@/lib/schemas";

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const limited = rateLimit({ key: `export:${ip}`, limit: 20, windowMs: 60_000 });
  if (!limited.allowed) {
    return errorResponse("Too many export requests. Please wait a minute and try again.", 429);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return errorResponse("Invalid export request.", 400);
  }

  const parsed = exportRequestSchema.safeParse(payload);
  if (!parsed.success) return validationErrorResponse(parsed.error);

  const { report, format } = parsed.data;

  if (format === "json") {
    return new NextResponse(JSON.stringify(report, null, 2), {
      headers: { "Content-Type": "application/json", "Content-Disposition": "attachment; filename=financeiq-report.json" },
    });
  }

  if (format === "pdf") {
    const buffer = await reportToPdf(report);
    return new NextResponse(new Blob([new Uint8Array(buffer)], { type: "application/pdf" }), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": "attachment; filename=financeiq-report.pdf" },
    });
  }

  if (format === "xlsx") {
    const buffer = await reportToXlsx(report);
    return new NextResponse(new Blob([new Uint8Array(buffer as ArrayBuffer)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": "attachment; filename=financeiq-transactions.xlsx",
      },
    });
  }

  const csv = reportToCsv(report);
  return new NextResponse(csv, {
    headers: { "Content-Type": "text/csv", "Content-Disposition": "attachment; filename=financeiq-transactions.csv" },
  });
}
