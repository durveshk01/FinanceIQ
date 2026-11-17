import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.NODE_ENV = "test";
process.env.ALLOW_CORS_ORIGIN = "http://localhost";

async function runBackendTests() {
  const { db, FinanceStore } = await import("./database");
  const { generateToken, verifyToken } = await import("./middleware/auth");
  console.log("Running Render Backend unit tests...");

  // 1. Auth token generation & verification
  const token = generateToken({
    userId: "usr_123",
    email: "test@financeiq.com",
  });
  assert.ok(typeof token === "string" && token.length > 20);
  const payload = verifyToken(token);
  assert.equal(payload?.userId, "usr_123");
  assert.equal(payload?.email, "test@financeiq.com");

  // 2. User creation & lookup
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash("SecurePass@123", salt);
  const user = db.createUser("sarah@example.com", hash);
  assert.ok(user.id.startsWith("usr_"));
  assert.equal(user.email, "sarah@example.com");

  const found = db.findUserByEmail("sarah@example.com");
  assert.equal(found?.id, user.id);

  // 3. Device Registration
  const device = db.registerDevice(
    user.id,
    "dev_pixel_9",
    "Google Pixel 9 Pro",
    "android",
  );
  assert.equal(device.id, "dev_pixel_9");
  assert.equal(device.platform, "android");

  const userDevices = db.getUserDevices(user.id);
  assert.equal(userDevices.length, 1);
  assert.equal(userDevices[0].deviceName, "Google Pixel 9 Pro");

  // 4. Incremental Sync
  const syncItem = db.saveSyncRecord({
    userId: user.id,
    deviceId: device.id,
    entityType: "report",
    entityId: "rep_2026_q1",
    version: 1,
    data: { netSavings: 45000, savingsRate: 32 },
    isDeleted: false,
  });
  assert.ok(syncItem.id.startsWith("sync_"));

  const changes = db.getChangesSince(user.id);
  assert.equal(changes.records.length, 1);
  assert.equal(changes.records[0].entityId, "rep_2026_q1");
  assert.equal(
    (changes.records[0].data as { savingsRate: number }).savingsRate,
    32,
  );

  const stale = db.saveSyncRecord({
    userId: user.id,
    deviceId: device.id,
    entityType: "report",
    entityId: "rep_2026_q1",
    version: 0,
    data: { netSavings: 0 },
    isDeleted: false,
  });
  assert.equal(stale.version, 1);
  assert.equal((stale.data as { savingsRate: number }).savingsRate, 32);

  const other = db.createUser("other@example.com", hash);
  db.registerDevice(other.id, device.id, "Other device", "web");
  assert.equal(db.getUserDevices(user.id)[0].userId, user.id);
  assert.equal(db.getUserDevices(other.id)[0].userId, other.id);
  assert.equal(db.revokeDevice(other.id, device.id), true);
  assert.equal(db.getUserDevices(user.id)[0].isRevoked, false);

  const directory = mkdtempSync(path.join(tmpdir(), "financeiq-store-test-"));
  try {
    const first = new FinanceStore(directory);
    const storedUser = first.createUser("persist@example.com", hash);
    first.registerDevice(
      storedUser.id,
      "persistent-device",
      "Android",
      "android",
    );
    const record = first.saveSyncRecord({
      userId: storedUser.id,
      deviceId: "persistent-device",
      entityType: "report",
      entityId: "active-report",
      version: 1,
      data: { savings: 123.45 },
      isDeleted: false,
    });
    first.saveSyncRecord({
      userId: storedUser.id,
      deviceId: "persistent-device",
      entityType: "goal",
      entityId: "goal-1",
      version: 1,
      data: { target: 1000 },
      isDeleted: false,
    });
    first.createSession(
      storedUser.id,
      "persist-session",
      new Date(Date.now() + 60000).toISOString(),
      "persistent-device",
    );
    const restarted = new FinanceStore(directory);
    assert.equal(
      restarted.findUserByEmail("persist@example.com")?.id,
      storedUser.id,
    );
    assert.equal(restarted.getUserDevices(storedUser.id).length, 1);
    assert.equal(
      restarted.getChangesSince(storedUser.id, record.updatedAt).records.length,
      1,
    );
    assert.equal(restarted.getChangesSince("another-user").records.length, 0);
    assert.equal(
      restarted.getSession("persist-session")?.deviceId,
      "persistent-device",
    );
    const page = restarted.getChangesSince(storedUser.id, undefined, 1);
    assert.equal(page.records.length, 1);
    assert.equal(page.hasMore, true);
    assert.equal(
      restarted.getChangesSince(storedUser.id, page.cursor, 1).hasMore,
      false,
    );
    assert.throws(
      () =>
        restarted.saveSyncRecords([
          {
            userId: storedUser.id,
            deviceId: "persistent-device",
            entityType: "goal",
            entityId: "must-not-save",
            version: 1,
            data: {},
            isDeleted: false,
          },
          {
            userId: storedUser.id,
            deviceId: "persistent-device",
            entityType: "goal",
            entityId: "oversized",
            version: 1,
            data: "x".repeat(4 * 1024 * 1024),
            isDeleted: false,
          },
        ]),
      /4 MB/,
    );
    assert.equal(
      restarted.syncRecords.length,
      2,
      "Failed batches must not partially publish data",
    );
    restarted.revokeDevice(storedUser.id, "persistent-device");
    assert.equal(
      new FinanceStore(directory).getSession("persist-session"),
      undefined,
    );
    const blockedPath = path.join(directory, "not-a-directory");
    writeFileSync(blockedPath, "blocked");
    const failing = new FinanceStore(blockedPath);
    assert.throws(
      () => failing.createUser("unsaved@example.com", hash),
      /could not be saved/,
    );
    assert.equal(
      failing.findUserByEmail("unsaved@example.com"),
      undefined,
      "Failed persistence must not publish an account",
    );
    restarted.deleteUser(storedUser.id);
    assert.equal(
      new FinanceStore(directory).findUserById(storedUser.id),
      undefined,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }

  const bounded = new FinanceStore();
  for (let index = 0; index < 21; index++)
    bounded.createSession(
      "quota-user",
      `session-${index}`,
      new Date(Date.now() + 60000).toISOString(),
    );
  assert.equal(bounded.sessions.size, 20);
  assert.equal(bounded.getSession("session-0"), undefined);
  for (let index = 0; index < 20; index++)
    bounded.registerDevice("quota-user", `device-${index}`, "Test", "web");
  assert.throws(
    () => bounded.registerDevice("quota-user", "device-21", "Test", "web"),
    /20 registered devices/,
  );
  assert.throws(
    () =>
      bounded.saveSyncRecords(
        Array.from({ length: 1001 }, (_, index) => ({
          userId: "quota-user",
          deviceId: "device-0",
          entityType: "goal" as const,
          entityId: `goal-${index}`,
          version: 1,
          data: {},
          isDeleted: false,
        })),
      ),
    /1,000 entity/,
  );
  assert.equal(bounded.syncRecords.length, 0);

  // Exercise the HTTP middleware, not just token helper functions.
  const { default: app } = await import("./index");
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
  const api = (
    route: string,
    auth?: string,
    body?: unknown,
    method = body === undefined ? "GET" : "POST",
  ) =>
    fetch(`${base}${route}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  try {
    assert.equal((await api("/health")).status, 200);
    assert.equal(
      (await api("/health")).headers.get("cache-control"),
      "no-store",
    );
    assert.equal(
      (
        await fetch(`${base}/health`, {
          headers: { Origin: "https://untrusted.example" },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(`${base}/health`, {
          headers: { Origin: "http://localhost" },
        })
      ).headers.get("access-control-allow-origin"),
      "http://localhost",
    );
    assert.equal(
      (
        await fetch(`${base}/api/auth/login`, {
          method: "POST",
          body: "plain text",
        })
      ).status,
      415,
    );
    assert.equal(
      (
        await fetch(`${base}/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{",
        })
      ).status,
      400,
    );
    assert.equal(
      (await api("/api/auth/login", undefined, { padding: "x".repeat(17000) }))
        .status,
      413,
    );
    assert.equal((await api("/api/sync/download", token)).status, 401);
    const registered = await api("/api/auth/register", undefined, {
      email: "http@example.com",
      password: "SecurePass@123",
    });
    assert.equal(registered.status, 201);
    const { token: httpToken } = (await registered.json()) as { token: string };
    assert.equal(
      (
        await api("/api/auth/login", undefined, {
          email: "http@example.com",
          password: "wrong-password",
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await api("/api/devices/register", httpToken, {
          deviceId: "http-device",
          deviceName: "Test Android",
          platform: "android",
        })
      ).status,
      200,
    );
    const upload = {
      deviceId: "http-device",
      records: [
        {
          entityType: "report",
          entityId: "active-report",
          version: 1,
          data: { savings: 100 },
          isDeleted: false,
        },
      ],
    };
    assert.equal(
      (await api("/api/sync/upload", httpToken, upload)).status,
      200,
    );
    assert.equal(
      (await api("/api/sync/download?since=invalid", httpToken)).status,
      400,
    );
    assert.equal(
      (await api("/api/sync/download?limit=501", httpToken)).status,
      400,
    );
    assert.equal(
      (
        await api("/api/devices/register", httpToken, {
          deviceId: "different-device",
          deviceName: "Other",
          platform: "web",
        })
      ).status,
      403,
    );
    const refreshed = await api("/api/auth/refresh", httpToken, {});
    assert.equal(refreshed.status, 200);
    const { token: rotatedToken } = (await refreshed.json()) as {
      token: string;
    };
    assert.equal((await api("/api/auth/profile", httpToken)).status, 401);
    assert.equal(
      (await api("/api/sync/upload", rotatedToken, upload)).status,
      200,
    );
    assert.equal(
      (
        await api("/api/devices/revoke", rotatedToken, {
          deviceId: "http-device",
        })
      ).status,
      200,
    );
    assert.equal(
      (await api("/api/sync/upload", rotatedToken, upload)).status,
      401,
    );
    const login = () =>
      api("/api/auth/login", undefined, {
        email: "http@example.com",
        password: "SecurePass@123",
      });
    const { token: logoutToken } = (await (await login()).json()) as {
      token: string;
    };
    assert.equal((await api("/api/auth/logout", logoutToken, {})).status, 200);
    assert.equal((await api("/api/auth/profile", logoutToken)).status, 401);
    const { token: deletionToken } = (await (await login()).json()) as {
      token: string;
    };
    assert.equal(
      (
        await api("/api/devices/register", deletionToken, {
          deviceId: "http-device",
          deviceName: "Test",
          platform: "web",
        })
      ).status,
      200,
    );
    assert.equal(
      (await api("/api/auth/account", deletionToken, undefined, "DELETE"))
        .status,
      200,
    );
    assert.equal((await api("/api/auth/profile", httpToken)).status, 401);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }

  // 5. Account Deletion
  const deleted = db.deleteUser(user.id);
  assert.equal(deleted, true);
  assert.equal(db.findUserById(user.id), undefined);
  assert.equal(db.getUserDevices(user.id).length, 0);

  console.log("Render Backend unit tests PASSED!");
}

runBackendTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
