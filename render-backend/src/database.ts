import crypto from "crypto";

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeviceRecord {
  id: string;
  userId: string;
  deviceName: string;
  platform: "android" | "ios" | "web";
  lastActive: string;
  isRevoked: boolean;
}

export interface SyncRecord {
  id: string;
  userId: string;
  deviceId: string;
  entityType: "report" | "transaction" | "goal" | "preference";
  entityId: string;
  version: number;
  data: any;
  updatedAt: string;
  isDeleted: boolean;
}

export interface UserPreferencesRecord {
  userId: string;
  theme: string;
  currency: string;
  localOnlyMode: boolean;
  cloudSyncOptIn: boolean;
  allowAiSharing: boolean;
  updatedAt: string;
}

class InMemorySyncStore {
  public users = new Map<string, UserRecord>();
  public devices = new Map<string, DeviceRecord>();
  public syncRecords: SyncRecord[] = [];
  public preferences = new Map<string, UserPreferencesRecord>();

  constructor() {
    // Demo seed account for instant testing
    const demoId = "demo_user_1";
    this.users.set("demo@financeiq.internal", {
      id: demoId,
      email: "demo@financeiq.internal",
      // Bcrypt hash for "FinanceIQ@2026"
      passwordHash: "$2a$10$wT0vRz2aG/aC1q0oFv3Mne0mQ8.Fv.XU5QcEwA1kE6bC5bC0lV1v.",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  findUserByEmail(email: string): UserRecord | undefined {
    return this.users.get(email.toLowerCase().trim());
  }

  findUserById(id: string): UserRecord | undefined {
    for (const u of this.users.values()) {
      if (u.id === id) return u;
    }
    return undefined;
  }

  createUser(email: string, passwordHash: string): UserRecord {
    const user: UserRecord = {
      id: `usr_${crypto.randomBytes(8).toString("hex")}`,
      email: email.toLowerCase().trim(),
      passwordHash,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.users.set(user.email, user);
    return user;
  }

  deleteUser(userId: string): boolean {
    const user = this.findUserById(userId);
    if (!user) return false;
    this.users.delete(user.email);
    // Cleanup devices and sync records
    for (const [dId, dev] of this.devices.entries()) {
      if (dev.userId === userId) this.devices.delete(dId);
    }
    this.syncRecords = this.syncRecords.filter(r => r.userId !== userId);
    this.preferences.delete(userId);
    return true;
  }

  registerDevice(userId: string, deviceId: string, deviceName: string, platform: "android" | "ios" | "web"): DeviceRecord {
    const existing = this.devices.get(deviceId);
    if (existing) {
      existing.lastActive = new Date().toISOString();
      existing.isRevoked = false;
      return existing;
    }
    const dev: DeviceRecord = {
      id: deviceId,
      userId,
      deviceName,
      platform,
      lastActive: new Date().toISOString(),
      isRevoked: false,
    };
    this.devices.set(deviceId, dev);
    return dev;
  }

  getUserDevices(userId: string): DeviceRecord[] {
    return [...this.devices.values()].filter(d => d.userId === userId);
  }

  revokeDevice(userId: string, deviceId: string): boolean {
    const dev = this.devices.get(deviceId);
    if (dev && dev.userId === userId) {
      dev.isRevoked = true;
      return true;
    }
    return false;
  }

  saveSyncRecord(record: Omit<SyncRecord, "id" | "updatedAt">): SyncRecord {
    const existingIndex = this.syncRecords.findIndex(
      r => r.userId === record.userId && r.entityType === record.entityType && r.entityId === record.entityId
    );

    const now = new Date().toISOString();
    const newRecord: SyncRecord = {
      ...record,
      id: `sync_${crypto.randomBytes(8).toString("hex")}`,
      updatedAt: now,
    };

    if (existingIndex >= 0) {
      // Overwrite with higher version
      if (record.version >= this.syncRecords[existingIndex].version) {
        this.syncRecords[existingIndex] = newRecord;
      }
    } else {
      this.syncRecords.push(newRecord);
    }

    return newRecord;
  }

  getChangesSince(userId: string, sinceIso?: string): { records: SyncRecord[]; cursor: string } {
    const sinceDate = sinceIso ? new Date(sinceIso).getTime() : 0;
    const records = this.syncRecords.filter(r => r.userId === userId && new Date(r.updatedAt).getTime() > sinceDate);
    const latestIso = records.length > 0 ? records[records.length - 1].updatedAt : new Date().toISOString();
    return { records, cursor: latestIso };
  }
}

export const db = new InMemorySyncStore();
