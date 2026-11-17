import { Router } from "express";
import { z } from "zod";
import { db } from "../database";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";

export const syncRouter = Router();

const syncUploadSchema = z.object({
  deviceId: z.string().min(1).max(200),
  records: z
    .array(
      z.object({
        entityType: z.enum(["report", "transaction", "goal", "preference"]),
        entityId: z.string().min(1).max(200),
        version: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
        data: z.json(),
        isDeleted: z.boolean().default(false),
      }),
    )
    .max(500),
});

syncRouter.post("/upload", requireAuth, (req: AuthenticatedRequest, res) => {
  const result = syncUploadSchema.safeParse(req.body);
  if (!result.success)
    return res.status(400).json({ error: "Invalid sync upload payload." });

  const { deviceId, records } = result.data;
  if (req.sessionDeviceId !== deviceId)
    return res.status(403).json({
      error:
        "Register this device with the current session before synchronizing.",
    });
  const device = db
    .getUserDevices(req.userId!)
    .find((candidate) => candidate.id === deviceId);
  if (!device || device.isRevoked)
    return res
      .status(403)
      .json({ error: "Register an active device before synchronizing." });
  const saved = db.saveSyncRecords(
    records.map((r) => ({
      userId: req.userId!,
      deviceId,
      entityType: r.entityType,
      entityId: r.entityId,
      version: r.version,
      data: r.data,
      isDeleted: r.isDeleted,
    })),
  );

  return res.json({
    message: "Sync upload accepted.",
    savedCount: saved.savedCount,
    conflictCount: saved.conflictCount,
    ignoredCount: saved.ignoredCount,
    timestamp: new Date().toISOString(),
  });
});

syncRouter.get("/download", requireAuth, (req: AuthenticatedRequest, res) => {
  const query = z
    .object({
      since: z.string().datetime().optional(),
      limit: z.coerce.number().int().min(1).max(500).default(100),
    })
    .safeParse(req.query);
  if (!query.success)
    return res
      .status(400)
      .json({ error: "Invalid synchronization cursor or page limit." });
  const { records, cursor, hasMore } = db.getChangesSince(
    req.userId!,
    query.data.since,
    query.data.limit,
  );

  return res.json({
    records,
    cursor,
    hasMore,
    timestamp: new Date().toISOString(),
  });
});

syncRouter.get("/metadata", requireAuth, (req: AuthenticatedRequest, res) => {
  const userRecords = db.syncRecords.filter((r) => r.userId === req.userId!);
  const reports = userRecords.filter(
    (r) => r.entityType === "report" && !r.isDeleted,
  );
  const lastSync =
    userRecords.length > 0
      ? [...userRecords].sort((a, b) =>
          b.updatedAt.localeCompare(a.updatedAt),
        )[0].updatedAt
      : null;

  return res.json({
    totalSyncedEntities: userRecords.length,
    activeReportsCount: reports.length,
    lastSyncTimestamp: lastSync,
  });
});
