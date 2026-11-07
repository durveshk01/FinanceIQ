import { NextResponse } from "next/server";
import { z } from "zod";

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_FILES_PER_REQUEST = 5;

const allowedExtensions = new Set(["pdf", "csv", "xlsx"]);
const allowedMimeTypes = new Set([
  "application/pdf",
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel",
  "application/octet-stream",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const rateLimitStore = new Map<string, RateLimitBucket>();

export type RateLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
};

export function rateLimit({ key, limit, windowMs }: RateLimitOptions) {
  const now = Date.now();
  const current = rateLimitStore.get(key);
  if (!current || current.resetAt <= now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  if (current.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: current.resetAt };
  }

  current.count += 1;
  return { allowed: true, remaining: limit - current.count, resetAt: current.resetAt };
}

export function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || request.headers.get("x-real-ip") || "anonymous";
}

export function getExtension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

export function validateUploadFiles(files: File[]) {
  if (files.length === 0) {
    return { ok: false as const, message: "Please upload at least one PDF, CSV, or XLSX bank statement." };
  }
  if (files.length > MAX_FILES_PER_REQUEST) {
    return { ok: false as const, message: `Upload up to ${MAX_FILES_PER_REQUEST} statements at a time.` };
  }

  for (const file of files) {
    const extension = getExtension(file.name);
    if (!allowedExtensions.has(extension)) {
      return { ok: false as const, message: `${file.name} is not supported. Upload PDF, CSV, or XLSX files only.` };
    }
    if (file.size <= 0) {
      return { ok: false as const, message: `${file.name} is empty. Please upload a valid bank statement.` };
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return { ok: false as const, message: `${file.name} is larger than 10 MB.` };
    }
    if (file.type && !allowedMimeTypes.has(file.type)) {
      return { ok: false as const, message: `${file.name} has an invalid file type.` };
    }
  }

  return { ok: true as const };
}

export function errorResponse(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ error: { message, details } }, { status });
}

export function validationErrorResponse(error: z.ZodError) {
  return errorResponse("Invalid request payload.", 400, error.issues.map((issue) => ({ path: issue.path, message: issue.message })));
}

export function logEvent(level: "info" | "warn" | "error", message: string, details?: Record<string, unknown>) {
  const payload = {
    level,
    message,
    details,
    timestamp: new Date().toISOString(),
  };
  const text = JSON.stringify(payload);
  if (level === "error") console.error(text);
  else if (level === "warn") console.warn(text);
  else console.info(text);
}

export function withTimeoutSignal(timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timeout),
  };
}
