import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "../database";
import {
  generateToken,
  requireAuth,
  type AuthenticatedRequest,
} from "../middleware/auth";

export const authRouter = Router();

const credentialsSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z
    .string()
    .min(8)
    .max(72)
    .refine(
      (value) => Buffer.byteLength(value, "utf8") <= 72,
      "Password must fit within 72 UTF-8 bytes",
    ),
});

authRouter.post("/register", async (req, res, next) => {
  try {
    const result = credentialsSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: "Invalid registration payload. Password must be >= 8 chars.",
      });
    }

    const { email, password } = result.data;
    if (db.findUserByEmail(email)) {
      return res
        .status(409)
        .json({ error: "An account with this email already exists." });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    // Hashing yields to the event loop; recheck before committing the account.
    if (db.findUserByEmail(email))
      return res
        .status(409)
        .json({ error: "An account with this email already exists." });
    const user = db.createUser(email, passwordHash);

    const token = generateToken({ userId: user.id, email: user.email });
    return res.status(201).json({
      message: "Account created successfully.",
      token,
      user: { id: user.id, email: user.email, createdAt: user.createdAt },
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/login", async (req, res, next) => {
  try {
    const result = credentialsSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: "Invalid login payload." });
    }

    const { email, password } = result.data;
    const user = db.findUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    const token = generateToken({ userId: user.id, email: user.email });
    return res.json({
      message: "Authentication successful.",
      token,
      user: { id: user.id, email: user.email, createdAt: user.createdAt },
    });
  } catch (error) {
    next(error);
  }
});

authRouter.get("/profile", requireAuth, (req: AuthenticatedRequest, res) => {
  const user = db.findUserById(req.userId!);
  if (!user) return res.status(404).json({ error: "User record not found." });

  return res.json({
    user: { id: user.id, email: user.email, createdAt: user.createdAt },
    devices: db.getUserDevices(user.id),
  });
});

authRouter.post("/refresh", requireAuth, (req: AuthenticatedRequest, res) => {
  const newToken = generateToken(
    { userId: req.userId!, email: req.userEmail! },
    req.sessionDeviceId,
    req.sessionId,
  );
  return res.json({ token: newToken });
});

authRouter.post("/logout", requireAuth, (req: AuthenticatedRequest, res) => {
  db.revokeSession(req.sessionId!);
  return res.json({ message: "Session revoked. You are signed out." });
});

authRouter.delete("/account", requireAuth, (req: AuthenticatedRequest, res) => {
  const deleted = db.deleteUser(req.userId!);
  if (!deleted) return res.status(404).json({ error: "User not found." });
  return res.json({
    message: "All cloud records and account data permanently erased.",
  });
});
