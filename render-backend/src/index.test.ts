import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { db } from "./database";
import { generateToken, verifyToken } from "./middleware/auth";

async function runBackendTests() {
  console.log("Running Render Backend unit tests...");

  // 1. Auth token generation & verification
  const token = generateToken({ userId: "usr_123", email: "test@financeiq.com" });
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
  const device = db.registerDevice(user.id, "dev_pixel_9", "Google Pixel 9 Pro", "android");
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
  assert.equal(changes.records[0].data.savingsRate, 32);

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
