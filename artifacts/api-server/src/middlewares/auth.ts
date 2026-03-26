import { Request, Response, NextFunction } from "express";
import { verifyToken, COOKIE_NAME } from "../lib/jwt";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  // Accept cookie (normal browser) or Authorization: Bearer <token> header
  // (iframe contexts where third-party cookies are blocked, e.g. Discord).
  const authHeader = req.headers["authorization"];
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const token = bearerToken ?? req.cookies?.[COOKIE_NAME];

  if (!token) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  try {
    const payload = verifyToken(token);
    const userId: string = payload.userId;

    if (typeof payload.tokenVersion === "number") {
      const [user] = await db
        .select({ tokenVersion: usersTable.tokenVersion })
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);

      if (!user || user.tokenVersion !== payload.tokenVersion) {
        res.status(401).json({ error: "Session has been revoked. Please log in again." });
        return;
      }
    }

    req.userId = userId;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
