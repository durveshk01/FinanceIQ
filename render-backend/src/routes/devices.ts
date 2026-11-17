import { Router } from "express";
import { z } from "zod";
import { db } from "../database";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";

export const devicesRouter = Router();

const deviceRegSchema = z.object({
  deviceId: z.string().min(1).max(200),
  deviceName: z.string().min(1).max(200),
  platform: z.enum(["android", "ios", "web"]),
});

devicesRouter.post(
  "/register",
  requireAuth,
  (req: AuthenticatedRequest, res) => {
    const result = deviceRegSchema.safeParse(req.body);
    if (!result.success)
      return res
        .status(400)
        .json({ error: "Invalid device registration payload." });

    const { deviceId, deviceName, platform } = result.data;
    const device = db.registerDevice(
      req.userId!,
      deviceId,
      deviceName,
      platform,
      req.sessionId,
    );

    return res.json({ message: "Device registered.", device });
  },
);

devicesRouter.get("/", requireAuth, (req: AuthenticatedRequest, res) => {
  const devices = db.getUserDevices(req.userId!);
  return res.json({ devices });
});

devicesRouter.post("/revoke", requireAuth, (req: AuthenticatedRequest, res) => {
  const result = z
    .object({ deviceId: z.string().min(1).max(200) })
    .safeParse(req.body);
  if (!result.success)
    return res.status(400).json({ error: "A valid deviceId is required." });
  const { deviceId } = result.data;

  const revoked = db.revokeDevice(req.userId!, deviceId);
  if (!revoked) return res.status(404).json({ error: "Device not found." });

  return res.json({ message: "Device revoked successfully." });
});
