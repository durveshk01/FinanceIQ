import { z } from "zod";
import { buildReport } from "./finance-engine";
import {
  financialGoalSchema,
  insightReportSchema,
  transactionSchema,
  type FinancialGoal,
  type InsightReport,
  type Transaction,
} from "./schemas";

export type UserPreferences = {
  localOnlyMode: boolean;
  cloudSyncOptIn: boolean;
  allowAiSharing: boolean;
  currency: string;
  theme: "dark" | "light" | "system";
  cloudSyncUrl?: string;
  authToken?: string;
  authEmail?: string;
  deviceId?: string;
  lastSyncTimestamp?: string;
};

export const DEFAULT_PREFERENCES: UserPreferences = {
  localOnlyMode: true,
  cloudSyncOptIn: false,
  allowAiSharing: false,
  currency: "INR",
  theme: "dark",
};

const preferencesSchema = z.object({
  localOnlyMode: z.boolean().optional(),
  cloudSyncOptIn: z.boolean().optional(),
  allowAiSharing: z.boolean().optional(),
  currency: z.string().min(1).max(10).optional(),
  theme: z.enum(["dark", "light", "system"]).optional(),
  cloudSyncUrl: z.string().max(2000).optional(),
  authToken: z.string().max(8000).optional(),
  authEmail: z.string().max(254).optional(),
  deviceId: z.string().min(1).max(200).optional(),
  lastSyncTimestamp: z.string().optional(),
});
const rulesSchema = z.record(
  z.string().min(1).max(200),
  z.string().min(1).max(100),
);
const STORAGE_KEYS = {
  PREFERENCES: "financeiq_preferences",
  ACTIVE_REPORT: "financeiq_active_report",
  SAVED_TRANSACTIONS: "financeiq_transactions",
  GOALS: "financeiq_goals",
  USER_CATEGORIZATION_RULES: "financeiq_user_rules",
  SYNC_QUEUE: "financeiq_sync_queue",
};

export class LocalFinanceDatabase {
  private static database: Promise<IDBDatabase | null> | undefined;

  private static storage(): Storage | null {
    try {
      return typeof window === "undefined" ? null : window.localStorage;
    } catch {
      return null;
    }
  }

  private static writableStorage(): Storage {
    const storage = this.storage();
    if (!storage)
      throw new Error(
        "Device settings storage is unavailable. Enable storage access and retry.",
      );
    return storage;
  }

  private static openDatabase(): Promise<IDBDatabase | null> {
    if (typeof indexedDB === "undefined") return Promise.resolve(null);
    if (!this.database) {
      this.database = new Promise((resolve) => {
        const request = indexedDB.open("financeiq", 1);
        request.onupgradeneeded = () =>
          request.result.createObjectStore("records");
        request.onsuccess = () => {
          const database = request.result;
          database.onversionchange = () => {
            database.close();
            this.database = undefined;
          };
          resolve(database);
        };
        request.onerror = () => {
          this.database = undefined;
          resolve(null);
        };
        request.onblocked = () => {
          this.database = undefined;
          resolve(null);
        };
      });
    }
    return this.database;
  }

  private static async readReport(): Promise<unknown> {
    const database = await this.openDatabase();
    if (!database) return undefined;
    return new Promise((resolve, reject) => {
      const request = database
        .transaction("records", "readonly")
        .objectStore("records")
        .get(STORAGE_KEYS.ACTIVE_REPORT);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  static getPreferences(): UserPreferences {
    const storage = this.storage();
    if (!storage) return { ...DEFAULT_PREFERENCES };
    try {
      const raw = storage.getItem(STORAGE_KEYS.PREFERENCES);
      const parsed = preferencesSchema.safeParse(raw ? JSON.parse(raw) : {});
      const preferences = {
        ...DEFAULT_PREFERENCES,
        ...(parsed.success ? parsed.data : {}),
      };
      if (!preferences.deviceId) {
        preferences.deviceId = crypto.randomUUID();
        storage.setItem(STORAGE_KEYS.PREFERENCES, JSON.stringify(preferences));
      }
      return preferences;
    } catch {
      return { ...DEFAULT_PREFERENCES };
    }
  }

  static savePreferences(
    preferences: Partial<UserPreferences>,
  ): UserPreferences {
    const updated = {
      ...this.getPreferences(),
      ...preferencesSchema.parse(preferences),
    };
    this.writableStorage().setItem(
      STORAGE_KEYS.PREFERENCES,
      JSON.stringify(updated),
    );
    return updated;
  }

  static async getActiveReport(): Promise<InsightReport | null> {
    try {
      const saved = await this.readReport();
      if (saved) {
        const parsed = insightReportSchema.safeParse(saved);
        if (!parsed.success)
          throw new Error(
            "The saved report is invalid. Restore a verified backup.",
          );
        return parsed.data;
      }
      // Migrate older installations only after the new IndexedDB write succeeds.
      const legacy = this.storage()?.getItem(STORAGE_KEYS.ACTIVE_REPORT);
      if (!legacy) return null;
      const parsed = insightReportSchema.safeParse(JSON.parse(legacy));
      if (!parsed.success)
        throw new Error(
          "The saved report is invalid. Restore a verified backup.",
        );
      await this.saveActiveReport(parsed.data);
      return parsed.data;
    } catch (error) {
      throw new Error(
        error instanceof Error
          ? error.message
          : "Could not read device storage. Restore a verified backup.",
      );
    }
  }

  static async saveActiveReport(report: InsightReport): Promise<void> {
    const verified = insightReportSchema.parse(report);
    const database = await this.openDatabase();
    if (database) {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction("records", "readwrite");
        transaction
          .objectStore("records")
          .put(verified, STORAGE_KEYS.ACTIVE_REPORT);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () =>
          reject(
            transaction.error ?? new Error("Device storage write failed."),
          );
        transaction.onabort = () =>
          reject(
            transaction.error ??
              new Error("Device storage write was interrupted."),
          );
      });
      // A successful durable IndexedDB write should not be reported as failed
      // merely because cleanup of legacy localStorage is blocked.
      try {
        this.storage()?.removeItem(STORAGE_KEYS.ACTIVE_REPORT);
        this.storage()?.removeItem(STORAGE_KEYS.SAVED_TRANSACTIONS);
      } catch {
        /* Legacy data remains available until the next successful cleanup. */
      }
      return;
    }
    const storage = this.storage();
    if (!storage)
      throw new Error(
        "Device storage is unavailable. Enable storage access and retry.",
      );
    storage.setItem(STORAGE_KEYS.ACTIVE_REPORT, JSON.stringify(verified));
    storage.removeItem(STORAGE_KEYS.SAVED_TRANSACTIONS);
  }

  static async getSavedTransactions(): Promise<Transaction[]> {
    return (await this.getActiveReport())?.transactions ?? [];
  }

  private static async deleteActiveReport(): Promise<void> {
    const database = await this.openDatabase();
    if (database) {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction("records", "readwrite");
        transaction.objectStore("records").delete(STORAGE_KEYS.ACTIVE_REPORT);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    }
    const storage = this.writableStorage();
    storage.removeItem(STORAGE_KEYS.ACTIVE_REPORT);
    storage.removeItem(STORAGE_KEYS.SAVED_TRANSACTIONS);
  }

  static getGoals(): FinancialGoal[] {
    try {
      const raw = this.storage()?.getItem(STORAGE_KEYS.GOALS);
      return raw ? z.array(financialGoalSchema).parse(JSON.parse(raw)) : [];
    } catch {
      return [];
    }
  }

  static saveGoals(goals: FinancialGoal[]): void {
    this.writableStorage().setItem(
      STORAGE_KEYS.GOALS,
      JSON.stringify(z.array(financialGoalSchema).parse(goals)),
    );
  }

  static getUserRules(): Record<string, string> {
    try {
      const raw = this.storage()?.getItem(
        STORAGE_KEYS.USER_CATEGORIZATION_RULES,
      );
      return raw ? rulesSchema.parse(JSON.parse(raw)) : {};
    } catch {
      return {};
    }
  }

  static saveUserRule(pattern: string, category: string): void {
    const rules = {
      ...this.getUserRules(),
      [pattern.toLowerCase().trim()]: category,
    };
    this.writableStorage().setItem(
      STORAGE_KEYS.USER_CATEGORIZATION_RULES,
      JSON.stringify(rulesSchema.parse(rules)),
    );
  }

  static async clearAllData(): Promise<void> {
    const database = await this.openDatabase();
    if (database) {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction("records", "readwrite");
        transaction.objectStore("records").clear();
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    }
    const preferences = this.getPreferences();
    const storage = this.writableStorage();
    for (const key of Object.values(STORAGE_KEYS)) storage?.removeItem(key);
    this.savePreferences({
      ...DEFAULT_PREFERENCES,
      theme: preferences.theme,
      currency: preferences.currency,
      deviceId: preferences.deviceId,
    });
  }

  static async exportFullBackup(
    reportOverride?: InsightReport,
  ): Promise<string> {
    // Authentication and device identity do not belong in a portable backup.
    const { currency, theme } = this.getPreferences();
    const report = reportOverride ?? (await this.getActiveReport());
    return JSON.stringify(
      {
        version: 2,
        exportedAt: new Date().toISOString(),
        preferences: { currency, theme },
        report,
        transactions: report?.transactions ?? [],
        goals: report?.goals ?? this.getGoals(),
        userRules: this.getUserRules(),
      },
      null,
      2,
    );
  }

  static async importFullBackup(jsonText: string): Promise<boolean> {
    try {
      const input: unknown = JSON.parse(jsonText);
      const reportArchive = insightReportSchema.safeParse(input);
      if (reportArchive.success) {
        await this.saveActiveReport(reportArchive.data);
        this.saveGoals(reportArchive.data.goals);
        return true;
      }
      const schema = z
        .object({
          version: z.number().int().min(1).max(2).default(1),
          preferences: preferencesSchema
            .pick({ currency: true, theme: true })
            .optional(),
          report: insightReportSchema.nullable().optional(),
          transactions: z.array(transactionSchema).max(10000).optional(),
          goals: z.array(financialGoalSchema).max(50).optional(),
          userRules: rulesSchema.optional(),
        })
        .refine(
          (backup) =>
            backup.report !== undefined ||
            backup.transactions !== undefined ||
            backup.goals !== undefined ||
            backup.userRules !== undefined,
          "Not a FinanceIQ backup",
        );
      const backup = schema.parse(input);
      let report = backup.report;
      if (report === undefined && backup.transactions !== undefined)
        report = buildReport(backup.transactions, { goals: backup.goals });
      if (report === undefined && backup.goals !== undefined)
        report = await this.getActiveReport();
      if (report) {
        const restored = backup.goals
          ? { ...report, goals: backup.goals }
          : report;
        await this.saveActiveReport(restored);
      } else if (backup.report === null || backup.transactions !== undefined) {
        await this.deleteActiveReport();
      }
      if (backup.goals) this.saveGoals(backup.goals);
      if (backup.userRules)
        this.writableStorage().setItem(
          STORAGE_KEYS.USER_CATEGORIZATION_RULES,
          JSON.stringify(backup.userRules),
        );
      if (backup.preferences) this.savePreferences(backup.preferences);
      return true;
    } catch {
      return false;
    }
  }
}
