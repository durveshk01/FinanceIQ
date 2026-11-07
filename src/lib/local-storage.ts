import { type FinancialGoal, type InsightReport, type Transaction } from "./schemas";

export type UserPreferences = {
  localOnlyMode: boolean;
  cloudSyncOptIn: boolean;
  allowAiSharing: boolean;
  currency: string;
  theme: "dark" | "light" | "system";
  cloudSyncUrl?: string;
  authToken?: string;
  deviceId?: string;
  lastSyncTimestamp?: string;
};

const DEFAULT_PREFERENCES: UserPreferences = {
  localOnlyMode: true,
  cloudSyncOptIn: false,
  allowAiSharing: false,
  currency: "INR",
  theme: "dark",
  deviceId: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `device_${Date.now()}`,
};

const STORAGE_KEYS = {
  PREFERENCES: "financeiq_preferences",
  ACTIVE_REPORT: "financeiq_active_report",
  SAVED_TRANSACTIONS: "financeiq_transactions",
  GOALS: "financeiq_goals",
  USER_CATEGORIZATION_RULES: "financeiq_user_rules",
  SYNC_QUEUE: "financeiq_sync_queue",
};

export class LocalFinanceDatabase {
  private static isBrowser(): boolean {
    return typeof window !== "undefined" && typeof localStorage !== "undefined";
  }

  static getPreferences(): UserPreferences {
    if (!this.isBrowser()) return DEFAULT_PREFERENCES;
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PREFERENCES);
      if (!data) return DEFAULT_PREFERENCES;
      return { ...DEFAULT_PREFERENCES, ...JSON.parse(data) };
    } catch {
      return DEFAULT_PREFERENCES;
    }
  }

  static savePreferences(prefs: Partial<UserPreferences>): UserPreferences {
    if (!this.isBrowser()) return DEFAULT_PREFERENCES;
    try {
      const current = this.getPreferences();
      const updated = { ...current, ...prefs };
      localStorage.setItem(STORAGE_KEYS.PREFERENCES, JSON.stringify(updated));
      return updated;
    } catch {
      return DEFAULT_PREFERENCES;
    }
  }

  static getActiveReport(): InsightReport | null {
    if (!this.isBrowser()) return null;
    try {
      const data = localStorage.getItem(STORAGE_KEYS.ACTIVE_REPORT);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  static saveActiveReport(report: InsightReport): void {
    if (!this.isBrowser()) return;
    try {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_REPORT, JSON.stringify(report));
      // Also store transactions separately for querying
      if (report.transactions && report.transactions.length > 0) {
        localStorage.setItem(STORAGE_KEYS.SAVED_TRANSACTIONS, JSON.stringify(report.transactions));
      }
    } catch (e) {
      console.warn("Could not save report to local storage:", e);
    }
  }

  static getSavedTransactions(): Transaction[] {
    if (!this.isBrowser()) return [];
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SAVED_TRANSACTIONS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  static getGoals(): FinancialGoal[] {
    if (!this.isBrowser()) return [];
    try {
      const data = localStorage.getItem(STORAGE_KEYS.GOALS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  static saveGoals(goals: FinancialGoal[]): void {
    if (!this.isBrowser()) return;
    try {
      localStorage.setItem(STORAGE_KEYS.GOALS, JSON.stringify(goals));
    } catch (e) {
      console.warn("Could not save goals to local storage:", e);
    }
  }

  static getUserRules(): Record<string, string> {
    if (!this.isBrowser()) return {};
    try {
      const data = localStorage.getItem(STORAGE_KEYS.USER_CATEGORIZATION_RULES);
      return data ? JSON.parse(data) : {};
    } catch {
      return {};
    }
  }

  static saveUserRule(pattern: string, category: string): void {
    if (!this.isBrowser()) return;
    try {
      const rules = this.getUserRules();
      rules[pattern.toLowerCase()] = category;
      localStorage.setItem(STORAGE_KEYS.USER_CATEGORIZATION_RULES, JSON.stringify(rules));
    } catch (e) {
      console.warn("Could not save user rule:", e);
    }
  }

  static clearAllData(): void {
    if (!this.isBrowser()) return;
    try {
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_REPORT);
      localStorage.removeItem(STORAGE_KEYS.SAVED_TRANSACTIONS);
      localStorage.removeItem(STORAGE_KEYS.GOALS);
      localStorage.removeItem(STORAGE_KEYS.SYNC_QUEUE);
      // Keep preferences intact unless explicitly reset
    } catch (e) {
      console.warn("Could not clear local data:", e);
    }
  }

  static exportFullBackup(): string {
    const backup = {
      version: 1,
      exportedAt: new Date().toISOString(),
      preferences: this.getPreferences(),
      report: this.getActiveReport(),
      transactions: this.getSavedTransactions(),
      goals: this.getGoals(),
      userRules: this.getUserRules(),
    };
    return JSON.stringify(backup, null, 2);
  }

  static importFullBackup(jsonText: string): boolean {
    try {
      const backup = JSON.parse(jsonText);
      if (!backup || typeof backup !== "object") return false;
      if (backup.preferences) this.savePreferences(backup.preferences);
      if (backup.report) this.saveActiveReport(backup.report);
      if (backup.goals) this.saveGoals(backup.goals);
      if (backup.userRules && this.isBrowser()) {
        localStorage.setItem(STORAGE_KEYS.USER_CATEGORIZATION_RULES, JSON.stringify(backup.userRules));
      }
      return true;
    } catch {
      return false;
    }
  }
}
