import { Capacitor } from "@capacitor/core";
import { insightReportSchema, type InsightReport } from "./schemas";
import { LocalFinanceDatabase, type UserPreferences } from "./local-storage";

export class CloudSessionError extends Error {}

export function cloudBackendUrl(value: string | undefined): string {
  if (!value?.trim())
    throw new Error("Enter the URL of your deployed FinanceIQ backend.");
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Enter a valid HTTPS backend URL.");
  }
  const localDevelopment =
    !Capacitor.isNativePlatform() &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" &&
      !(localDevelopment && url.protocol === "http:")) ||
    url.username ||
    url.password
  ) {
    throw new Error(
      "Use an HTTPS backend URL (HTTP is only supported for local web development).",
    );
  }
  if (url.search || url.hash)
    throw new Error("The backend URL must not include a query or fragment.");
  return url.href.replace(/\/+$/, "");
}

async function requestJson(
  base: string,
  path: string,
  token?: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
    });
    if (response.status === 401 && token) {
      LocalFinanceDatabase.savePreferences({
        authToken: "",
        authEmail: "",
        cloudSyncOptIn: false,
        lastSyncTimestamp: "",
      });
      throw new CloudSessionError(
        "Your cloud session expired or was revoked. Sign in again.",
      );
    }
    const data = (await response.json()) as Record<string, unknown>;
    if (!response.ok)
      throw new Error(
        typeof data.error === "string"
          ? data.error
          : `The backend returned HTTP ${response.status}.`,
      );
    return data;
  } catch (error) {
    if (controller.signal.aborted)
      throw new Error(
        "The backend did not respond within 60 seconds. Try again once it is running.",
      );
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function authenticateCloud(
  preferences: UserPreferences,
  email: string,
  password: string,
  mode: "login" | "register",
): Promise<UserPreferences> {
  const base = cloudBackendUrl(preferences.cloudSyncUrl);
  const data = await requestJson(base, `/api/auth/${mode}`, undefined, {
    email: email.trim(),
    password,
  });
  if (typeof data.token !== "string")
    throw new Error("The backend did not return an authentication token.");
  const user = data.user as { email?: string } | undefined;
  return LocalFinanceDatabase.savePreferences({
    cloudSyncUrl: base,
    authToken: data.token,
    authEmail: user?.email ?? email.trim(),
  });
}

export async function synchronizeCloud(
  report: InsightReport | null,
  preferences: UserPreferences,
): Promise<{
  report: InsightReport | null;
  preferences: UserPreferences;
  message: string;
}> {
  if (preferences.localOnlyMode)
    throw new Error(
      "Disable local-only mode before connecting to cloud synchronization.",
    );
  if (!preferences.cloudSyncOptIn)
    throw new Error(
      "Enable cloud synchronization before uploading financial data.",
    );
  if (!preferences.authToken)
    throw new Error("Sign in to your cloud account first.");
  const base = cloudBackendUrl(preferences.cloudSyncUrl);
  const deviceId =
    preferences.deviceId ?? LocalFinanceDatabase.getPreferences().deviceId;
  if (!deviceId) throw new Error("Private device storage is unavailable.");
  await requestJson(base, "/api/devices/register", preferences.authToken, {
    deviceId,
    deviceName: Capacitor.isNativePlatform()
      ? "FinanceIQ Android"
      : "FinanceIQ Web",
    platform: Capacitor.isNativePlatform() ? "android" : "web",
  });
  if (report) {
    const version = Date.parse(report.generatedAt);
    if (!Number.isSafeInteger(version) || version < 0)
      throw new Error(
        "The report has an invalid generation timestamp. Import the statement again.",
      );
    await requestJson(base, "/api/sync/upload", preferences.authToken, {
      deviceId,
      records: [
        {
          entityType: "report",
          entityId: "active-report",
          version,
          data: insightReportSchema.parse(report),
          isDeleted: false,
        },
      ],
    });
  }
  const records: {
    entityType?: string;
    entityId?: string;
    isDeleted?: boolean;
    data?: unknown;
    version?: number;
  }[] = [];
  let cursor = "";
  for (let page = 0; page < 1001; page++) {
    const downloaded = await requestJson(
      base,
      `/api/sync/download${cursor ? `?since=${encodeURIComponent(cursor)}` : ""}`,
      preferences.authToken,
    );
    if (
      !Array.isArray(downloaded.records) ||
      typeof downloaded.cursor !== "string" ||
      typeof downloaded.hasMore !== "boolean"
    )
      throw new Error("The backend returned an invalid synchronization page.");
    records.push(...downloaded.records);
    if (downloaded.hasMore && downloaded.cursor <= cursor)
      throw new Error(
        "The backend returned a non-advancing synchronization cursor.",
      );
    cursor = downloaded.cursor;
    if (!downloaded.hasMore) break;
    if (page === 1000)
      throw new Error(
        "The cloud account exceeds the supported synchronization size.",
      );
  }
  const latest = records
    .filter(
      (record) =>
        record.entityType === "report" &&
        record.entityId === "active-report" &&
        !record.isDeleted,
    )
    .sort((a, b) => (b.version ?? 0) - (a.version ?? 0))[0];
  let nextReport = report;
  if (
    latest &&
    (!report || (latest.version ?? 0) > Date.parse(report.generatedAt))
  ) {
    const parsed = insightReportSchema.safeParse(latest.data);
    if (!parsed.success)
      throw new Error("The cloud report is not a valid FinanceIQ backup.");
    nextReport = parsed.data;
    await LocalFinanceDatabase.saveActiveReport(nextReport);
  }
  const updated = LocalFinanceDatabase.savePreferences({
    lastSyncTimestamp: cursor,
  });
  return {
    report: nextReport,
    preferences: updated,
    message: nextReport
      ? "Cloud sync complete. The latest verified report is available on this device."
      : "Cloud account connected. Import a statement to sync your first report.",
  };
}

export async function signOutCloud(
  preferences: UserPreferences,
): Promise<UserPreferences> {
  if (preferences.authToken) {
    try {
      await requestJson(
        cloudBackendUrl(preferences.cloudSyncUrl),
        "/api/auth/logout",
        preferences.authToken,
        {},
      );
    } catch (error) {
      if (!(error instanceof CloudSessionError)) throw error;
    }
  }
  return LocalFinanceDatabase.savePreferences({
    authToken: "",
    authEmail: "",
    cloudSyncOptIn: false,
    lastSyncTimestamp: "",
  });
}

export async function listCloudDevices(
  preferences: UserPreferences,
): Promise<{ id: string; deviceName: string; isRevoked: boolean }[]> {
  if (!preferences.authToken) throw new Error("Sign in first.");
  const data = await requestJson(
    cloudBackendUrl(preferences.cloudSyncUrl),
    "/api/auth/profile",
    preferences.authToken,
  );
  return Array.isArray(data.devices) ? data.devices : [];
}

export async function revokeCloudDevice(
  preferences: UserPreferences,
  deviceId: string,
): Promise<void> {
  if (!preferences.authToken) throw new Error("Sign in first.");
  await requestJson(
    cloudBackendUrl(preferences.cloudSyncUrl),
    "/api/devices/revoke",
    preferences.authToken,
    { deviceId },
  );
  if (deviceId === preferences.deviceId)
    LocalFinanceDatabase.savePreferences({
      authToken: "",
      authEmail: "",
      cloudSyncOptIn: false,
      lastSyncTimestamp: "",
    });
}

export async function deleteCloudAccount(
  preferences: UserPreferences,
): Promise<void> {
  if (!preferences.authToken) throw new Error("Sign in first.");
  await requestJson(
    cloudBackendUrl(preferences.cloudSyncUrl),
    "/api/auth/account",
    preferences.authToken,
    undefined,
    "DELETE",
  );
}
