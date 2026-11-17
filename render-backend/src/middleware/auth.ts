import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import "dotenv/config";
import { db } from "../database";

if (
  process.env.NODE_ENV === "production" &&
  (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)
) {
  throw new Error(
    "Set JWT_SECRET to a private random value of at least 32 characters before starting the production backend.",
  );
}
const JWT_SECRET =
  process.env.JWT_SECRET || crypto.randomBytes(32).toString("hex");

export interface AuthenticatedRequest extends Request {
  userId?: string;
  userEmail?: string;
  sessionId?: string;
  sessionDeviceId?: string;
}

export function generateToken(
  payload: { userId: string; email: string },
  deviceId?: string,
  replacedSessionId?: string,
): string {
  const id = crypto.randomBytes(24).toString("hex");
  const token = jwt.sign(payload, JWT_SECRET, {
    expiresIn: "7d",
    jwtid: id,
    issuer: "financeiq-api",
    audience: "financeiq-client",
  });
  if (db.findUserById(payload.userId))
    db.createSession(
      payload.userId,
      id,
      new Date(Date.now() + 7 * 86400000).toISOString(),
      deviceId,
      replacedSessionId,
    );
  return token;
}

export function verifyToken(
  token: string,
): { userId: string; email: string; sessionId: string } | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET, {
      algorithms: ["HS256"],
      issuer: "financeiq-api",
      audience: "financeiq-client",
    });
    return typeof payload === "object" &&
      typeof payload.userId === "string" &&
      typeof payload.email === "string" &&
      typeof payload.jti === "string"
      ? { userId: payload.userId, email: payload.email, sessionId: payload.jti }
      : null;
  } catch {
    return null;
  }
}

export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  const authHeader = req.headers.authorization;
  if (
    !authHeader ||
    !/^Bearer [^\s]+$/.test(authHeader) ||
    authHeader.length > 8000
  ) {
    return res.status(401).json({ error: "Authentication token required." });
  }

  const token = authHeader.split(" ")[1];
  const verified = verifyToken(token);
  const session = verified ? db.getSession(verified.sessionId) : undefined;
  const device = session?.deviceId
    ? db
        .getUserDevices(session.userId)
        .find((candidate) => candidate.id === session.deviceId)
    : undefined;
  if (
    !verified ||
    !db.findUserById(verified.userId) ||
    !session ||
    session.userId !== verified.userId ||
    (session.deviceId && (!device || device.isRevoked))
  ) {
    return res
      .status(401)
      .json({ error: "Invalid or expired authorization token." });
  }

  req.userId = verified.userId;
  req.userEmail = verified.email;
  req.sessionId = verified.sessionId;
  req.sessionDeviceId = session.deviceId;
  next();
}
