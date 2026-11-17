import crypto from "crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import "dotenv/config";

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
  data: unknown;
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

export interface SessionRecord {
  id: string;
  userId: string;
  expiresAt: string;
  deviceId?: string;
}

export class StoreError extends Error {
  constructor(
    message: string,
    public readonly status = 503,
  ) {
    super(message);
    this.name = "StoreError";
  }
}

const persistedStateSchema = z.object({
  version: z.union([z.literal(1), z.literal(2)]),
  users: z.array(
    z.object({
      id: z.string(),
      email: z.string().email(),
      passwordHash: z.string(),
      createdAt: z.string(),
      updatedAt: z.string(),
    }),
  ),
  devices: z.array(
    z.object({
      id: z.string(),
      userId: z.string(),
      deviceName: z.string(),
      platform: z.enum(["android", "ios", "web"]),
      lastActive: z.string(),
      isRevoked: z.boolean(),
    }),
  ),
  syncRecords: z.array(
    z.object({
      id: z.string(),
      userId: z.string(),
      deviceId: z.string(),
      entityType: z.enum(["report", "transaction", "goal", "preference"]),
      entityId: z.string(),
      version: z.number().int().nonnegative(),
      data: z.unknown(),
      updatedAt: z.string().datetime(),
      isDeleted: z.boolean(),
    }),
  ),
  sessions: z
    .array(
      z.object({
        id: z.string(),
        userId: z.string(),
        expiresAt: z.string().datetime(),
        deviceId: z.string().optional(),
      }),
    )
    .default([]),
  preferences: z
    .array(
      z.object({
        userId: z.string(),
        theme: z.string(),
        currency: z.string(),
        localOnlyMode: z.boolean(),
        cloudSyncOptIn: z.boolean(),
        allowAiSharing: z.boolean(),
        updatedAt: z.string(),
      }),
    )
    .default([]),
});

const MAX_STORE_BYTES = 100 * 1024 * 1024;
const MAX_USER_BYTES = 20 * 1024 * 1024;
const MAX_RECORD_BYTES = 4 * 1024 * 1024;
const MAX_USER_RECORDS = 1000;
const MAX_USER_DEVICES = 20;

/** Single-instance store; put DATA_DIRECTORY on a persistent disk in production. */
export class FinanceStore {
  public users = new Map<string, UserRecord>();
  public devices = new Map<string, DeviceRecord>();
  public syncRecords: SyncRecord[] = [];
  public preferences = new Map<string, UserPreferencesRecord>();
  public sessions = new Map<string, SessionRecord>();
  private readonly stateFile?: string;
  private lastTimestamp = 0;

  constructor(directory?: string) {
    if (!directory) return;
    this.stateFile = path.join(directory, "financeiq.json");
    if (!fs.existsSync(this.stateFile)) return;
    if (fs.statSync(this.stateFile).size > MAX_STORE_BYTES)
      throw new StoreError(
        "The configured store exceeds the supported 100 MB single-instance limit.",
      );
    const state = persistedStateSchema.parse(
      JSON.parse(fs.readFileSync(this.stateFile, "utf8")),
    );
    for (const user of state.users) this.users.set(user.email, user);
    for (const device of state.devices)
      this.devices.set(`${device.userId}:${device.id}`, device);
    this.syncRecords = state.syncRecords;
    for (const session of state.sessions)
      if (Date.parse(session.expiresAt) > Date.now())
        this.sessions.set(session.id, session);
    for (const preference of state.preferences)
      this.preferences.set(preference.userId, preference);
    this.lastTimestamp = this.syncRecords.reduce(
      (latest, record) => Math.max(latest, Date.parse(record.updatedAt)),
      0,
    );
  }

  /** Persist the proposed state before publishing it in memory. Failed writes
   * never leave an acknowledged but unsaved account or partially applied batch. */
  private commit(
    updates: Partial<
      Pick<
        FinanceStore,
        "users" | "devices" | "syncRecords" | "preferences" | "sessions"
      >
    >,
  ): void {
    const next = {
      users: this.users,
      devices: this.devices,
      syncRecords: this.syncRecords,
      preferences: this.preferences,
      sessions: this.sessions,
      ...updates,
    };
    if (this.stateFile) {
      const snapshot = JSON.stringify({
        version: 2,
        users: [...next.users.values()],
        devices: [...next.devices.values()],
        syncRecords: next.syncRecords,
        preferences: [...next.preferences.values()],
        sessions: [...next.sessions.values()],
      });
      if (Buffer.byteLength(snapshot) > MAX_STORE_BYTES)
        throw new StoreError(
          "Cloud storage capacity reached. Contact the backend operator.",
        );
      try {
        fs.mkdirSync(path.dirname(this.stateFile), {
          recursive: true,
          mode: 0o700,
        });
        const temporary = `${this.stateFile}.tmp`;
        const descriptor = fs.openSync(temporary, "w", 0o600);
        try {
          fs.writeFileSync(descriptor, snapshot);
          fs.fsyncSync(descriptor);
        } finally {
          fs.closeSync(descriptor);
        }
        fs.renameSync(temporary, this.stateFile);
      } catch {
        throw new StoreError(
          "Cloud storage could not be saved. Retry or contact the backend operator.",
        );
      }
    }
    Object.assign(this, next);
  }

  verifyStorage(): void {
    if (!this.stateFile) return;
    fs.mkdirSync(path.dirname(this.stateFile), {
      recursive: true,
      mode: 0o700,
    });
    fs.accessSync(
      path.dirname(this.stateFile),
      fs.constants.R_OK | fs.constants.W_OK,
    );
  }

  get storageMode(): "memory" | "persistent-file" {
    return this.stateFile ? "persistent-file" : "memory";
  }

  private timestamp(): string {
    this.lastTimestamp = Math.max(Date.now(), this.lastTimestamp + 1);
    return new Date(this.lastTimestamp).toISOString();
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
    if (this.findUserByEmail(email))
      throw new StoreError("An account with this email already exists.", 409);
    if (this.users.size >= 10000)
      throw new StoreError(
        "Account capacity reached. Contact the backend operator.",
      );
    const user: UserRecord = {
      id: `usr_${crypto.randomBytes(8).toString("hex")}`,
      email: email.toLowerCase().trim(),
      passwordHash,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.commit({ users: new Map(this.users).set(user.email, user) });
    return user;
  }

  deleteUser(userId: string): boolean {
    const user = this.findUserById(userId);
    if (!user) return false;
    const users = new Map(this.users);
    users.delete(user.email);
    const preferences = new Map(this.preferences);
    preferences.delete(userId);
    this.commit({
      users,
      preferences,
      devices: new Map(
        [...this.devices].filter(([, device]) => device.userId !== userId),
      ),
      syncRecords: this.syncRecords.filter((r) => r.userId !== userId),
      sessions: new Map(
        [...this.sessions].filter(([, session]) => session.userId !== userId),
      ),
    });
    return true;
  }

  registerDevice(
    userId: string,
    deviceId: string,
    deviceName: string,
    platform: "android" | "ios" | "web",
    sessionId?: string,
  ): DeviceRecord {
    const key = `${userId}:${deviceId}`;
    const existing = this.devices.get(key);
    if (!existing && this.getUserDevices(userId).length >= MAX_USER_DEVICES)
      throw new StoreError(
        "This account supports at most 20 registered devices.",
        409,
      );
    const sessions = new Map(this.sessions);
    if (sessionId) {
      const session = this.getSession(sessionId);
      if (!session || session.userId !== userId)
        throw new StoreError(
          "Sign in again before registering this device.",
          401,
        );
      if (session.deviceId && session.deviceId !== deviceId)
        throw new StoreError(
          "This session is already bound to a different device.",
          403,
        );
      if (existing?.isRevoked && session.deviceId)
        throw new StoreError(
          "This device was revoked. Sign in again to register it.",
          403,
        );
      sessions.set(sessionId, { ...session, deviceId });
    }
    const dev: DeviceRecord = {
      id: deviceId,
      userId,
      deviceName,
      platform,
      lastActive: new Date().toISOString(),
      isRevoked: false,
    };
    this.commit({ devices: new Map(this.devices).set(key, dev), sessions });
    return dev;
  }

  getUserDevices(userId: string): DeviceRecord[] {
    return [...this.devices.values()].filter((d) => d.userId === userId);
  }

  revokeDevice(userId: string, deviceId: string): boolean {
    const dev = this.devices.get(`${userId}:${deviceId}`);
    if (dev && dev.userId === userId) {
      this.commit({
        devices: new Map(this.devices).set(`${userId}:${deviceId}`, {
          ...dev,
          isRevoked: true,
        }),
        sessions: new Map(
          [...this.sessions].filter(
            ([, session]) =>
              session.userId !== userId || session.deviceId !== deviceId,
          ),
        ),
      });
      return true;
    }
    return false;
  }

  saveSyncRecord(record: Omit<SyncRecord, "id" | "updatedAt">): SyncRecord {
    return this.saveSyncRecords([record]).records[0];
  }

  saveSyncRecords(records: Omit<SyncRecord, "id" | "updatedAt">[]): {
    records: SyncRecord[];
    savedCount: number;
    conflictCount: number;
    ignoredCount: number;
  } {
    const next = [...this.syncRecords];
    const key = (
      record: Pick<SyncRecord, "userId" | "entityType" | "entityId">,
    ) => JSON.stringify([record.userId, record.entityType, record.entityId]);
    const positions = new Map(
      next.map((record, index) => [key(record), index]),
    );
    const result = {
      records: [] as SyncRecord[],
      savedCount: 0,
      conflictCount: 0,
      ignoredCount: 0,
    };
    for (const record of records) {
      if (Buffer.byteLength(JSON.stringify(record)) > MAX_RECORD_BYTES)
        throw new StoreError(
          "A synchronized entity exceeds the 4 MB limit.",
          413,
        );
      const index = positions.get(key(record));
      const existing = index === undefined ? undefined : next[index];
      if (existing && record.version <= existing.version) {
        const identical =
          record.version === existing.version &&
          record.isDeleted === existing.isDeleted &&
          JSON.stringify(record.data) === JSON.stringify(existing.data);
        if (identical) result.ignoredCount++;
        else result.conflictCount++;
        result.records.push(existing);
        continue;
      }
      const saved = {
        ...record,
        id: existing?.id ?? `sync_${crypto.randomBytes(8).toString("hex")}`,
        updatedAt: this.timestamp(),
      };
      if (index === undefined) {
        positions.set(key(record), next.length);
        next.push(saved);
      } else next[index] = saved;
      result.records.push(saved);
      result.savedCount++;
    }
    for (const userId of new Set(records.map((record) => record.userId))) {
      const owned = next.filter((record) => record.userId === userId);
      if (
        owned.length > MAX_USER_RECORDS ||
        Buffer.byteLength(JSON.stringify(owned)) > MAX_USER_BYTES
      )
        throw new StoreError(
          "The account exceeds its 1,000 entity or 20 MB synchronization limit.",
          413,
        );
    }
    if (result.savedCount) this.commit({ syncRecords: next });
    return result;
  }

  createSession(
    userId: string,
    id: string,
    expiresAt: string,
    deviceId?: string,
    replacedSessionId?: string,
  ): void {
    const sessions = new Map(
      [...this.sessions].filter(
        ([, session]) => Date.parse(session.expiresAt) > Date.now(),
      ),
    );
    if (replacedSessionId) sessions.delete(replacedSessionId);
    const owned = [...sessions.values()].filter(
      (session) => session.userId === userId,
    );
    for (const session of owned.slice(0, Math.max(0, owned.length - 19)))
      sessions.delete(session.id);
    sessions.set(id, { id, userId, expiresAt, deviceId });
    this.commit({ sessions });
  }

  getSession(id: string): SessionRecord | undefined {
    const session = this.sessions.get(id);
    return session && Date.parse(session.expiresAt) > Date.now()
      ? session
      : undefined;
  }

  revokeSession(id: string): void {
    const sessions = new Map(this.sessions);
    sessions.delete(id);
    this.commit({ sessions });
  }

  getChangesSince(
    userId: string,
    sinceIso?: string,
    limit = 100,
  ): { records: SyncRecord[]; cursor: string; hasMore: boolean } {
    const sinceDate = sinceIso ? new Date(sinceIso).getTime() : 0;
    const available = this.syncRecords
      .filter(
        (r) =>
          r.userId === userId && new Date(r.updatedAt).getTime() > sinceDate,
      )
      .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
    const records: SyncRecord[] = [];
    let bytes = 0;
    for (const record of available) {
      const size = Buffer.byteLength(JSON.stringify(record));
      if (
        records.length >= Math.max(1, Math.min(500, limit)) ||
        (records.length && bytes + size > MAX_RECORD_BYTES)
      )
        break;
      records.push(record);
      bytes += size;
    }
    const latestIso =
      records.length > 0
        ? records[records.length - 1].updatedAt
        : (sinceIso ?? "1970-01-01T00:00:00.000Z");
    return {
      records,
      cursor: latestIso,
      hasMore: records.length < available.length,
    };
  }
}

if (
  process.env.NODE_ENV === "production" &&
  !process.env.DATA_DIRECTORY?.trim()
)
  throw new Error(
    "Set DATA_DIRECTORY to a persistent volume before starting the production backend.",
  );
export const db = new FinanceStore(
  process.env.NODE_ENV === "test"
    ? undefined
    : process.env.DATA_DIRECTORY || path.resolve(process.cwd(), "data"),
);
