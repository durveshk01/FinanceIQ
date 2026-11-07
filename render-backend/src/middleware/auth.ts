import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "financeiq-cloud-secure-jwt-secret-key-2026";

export interface AuthenticatedRequest extends Request {
  userId?: string;
  userEmail?: string;
}

export function generateToken(payload: { userId: string; email: string }): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });
}

export function verifyToken(token: string): { userId: string; email: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: string; email: string };
  } catch {
    return null;
  }
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication token required." });
  }

  const token = authHeader.split(" ")[1];
  const verified = verifyToken(token);
  if (!verified) {
    return res.status(401).json({ error: "Invalid or expired authorization token." });
  }

  req.userId = verified.userId;
  req.userEmail = verified.email;
  next();
}
