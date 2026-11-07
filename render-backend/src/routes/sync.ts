import { Router } from "express";
import { z } from "zod";
import { db } from "../database";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";

export const syncRouter = Router();

const syncUploadSchema = z.object({
  deviceId: z.string().min(1),
  records: z.array(
    z.object({
      entityType: z.enum(["report", "transaction", "goal", "preference"]),
      entityId: z.string().min(1),
      version: z.number().int().nonnegative(),
      data: z.any(),
      isDeleted: z.boolean().default(false),
    })
  ),
});

syncRouter.post("/upload", requireAuth, (req: AuthenticatedRequest, res) => {
  const result = syncUploadSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: "Invalid sync upload payload." });

  const { deviceId, records } = result.data;
  const savedRecords = records.map((r) =>
    db.saveSyncRecord({
      userId: req.userId!,
      deviceId,
      entityType: r.entityType,
      entityId: r.entityId,
      version: r.version,
      data: r.data,
      isDeleted: r.isDeleted,
    })
  );

  return res.json({
    message: "Sync upload accepted.",
    savedCount: savedRecords.length,
    timestamp: new Date().toISOString(),
  });
});

syncRouter.get("/download", requireAuth, (req: AuthenticatedRequest, res) => {
  const since = req.query.since as string | undefined;
  const { records, cursor } = db.getChangesSince(req.userId!, since);

  return res.json({
    records,
    cursor,
    hasMore: false,
    timestamp: new Date().toISOString(),
  });
});

syncRouter.get("/metadata", requireAuth, (req: AuthenticatedRequest, res) => {
  const userRecords = db.syncRecords.filter((r) => r.userId === req.userId!);
  const reports = userRecords.filter((r) => r.entityType === "report" && !r.isDeleted);
  const lastSync = userRecords.length > 0 ? userRecords[userRecords.length - 1].updatedAt : null;

  return res.json({
    totalSyncedEntities: userRecords.length,
    activeReportsCount: reports.length,
    lastSyncTimestamp: lastSync,
  });
});
