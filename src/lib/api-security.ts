import { NextResponse } from "next/server";
import { z } from "zod";

export {
  MAX_FILE_SIZE_BYTES,
  MAX_FILES_PER_REQUEST,
  getExtension,
  validateUploadFiles,
} from "./upload-validation";

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const rateLimitStore = new Map<string, RateLimitBucket>();
export const PRIVATE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

export class RequestError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

/** Check the declared size AND streamed bytes, including chunked requests. */
export async function readBoundedRequest(
  request: Request,
  contentType: string,
  maxBytes: number,
): Promise<Request> {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    throw new RequestError("Cross-origin requests are not allowed.", 403);
  if (request.headers.get("sec-fetch-site") === "cross-site")
    throw new RequestError("Cross-site requests are not allowed.", 403);
  if (
    !request.headers.get("content-type")?.toLowerCase().startsWith(contentType)
  )
    throw new RequestError(`Use ${contentType} for this endpoint.`, 415);
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > maxBytes))
    throw new RequestError("Request exceeds the endpoint size limit.", 413);
  if (!request.body) throw new RequestError("A request body is required.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new RequestError("Request exceeds the endpoint size limit.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: bytes,
  });
}

export function requestErrorResponse(error: unknown) {
  return errorResponse(
    error instanceof RequestError ? error.message : "Invalid request body.",
    error instanceof RequestError ? error.status : 400,
  );
}

export type RateLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
};

export function rateLimit({ key, limit, windowMs }: RateLimitOptions) {
  const now = Date.now();
  for (const [bucketKey, bucket] of rateLimitStore)
    if (bucket.resetAt <= now) rateLimitStore.delete(bucketKey);
  const current = rateLimitStore.get(key);
  if (!current || current.resetAt <= now) {
    if (rateLimitStore.size >= 10000)
      return { allowed: false, remaining: 0, resetAt: now + windowMs };
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  if (current.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: current.resetAt };
  }

  current.count += 1;
  return {
    allowed: true,
    remaining: limit - current.count,
    resetAt: current.resetAt,
  };
}

export function getClientIp(request: Request) {
  if (process.env.VERCEL !== "1" && process.env.TRUST_PROXY_HEADERS !== "true")
    return "anonymous";
  const forwardedFor = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  return (
    forwardedFor ||
    request.headers.get("x-real-ip") ||
    "anonymous"
  ).slice(0, 100);
}

export function errorResponse(
  message: string,
  status = 400,
  details?: unknown,
) {
  return NextResponse.json(
    { error: { message, details } },
    { status, headers: PRIVATE_HEADERS },
  );
}

export function validationErrorResponse(error: z.ZodError) {
  return errorResponse(
    "Invalid request payload.",
    400,
    error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
  );
}

export function logEvent(
  level: "info" | "warn" | "error",
  message: string,
  details?: Record<string, unknown>,
) {
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
