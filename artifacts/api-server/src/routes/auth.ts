import { Router, type IRouter, Request } from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import { randomBytes, createHmac } from "node:crypto";
import { db } from "@workspace/db";
import { usersTable, userSessionsTable } from "@workspace/db";
import { eq, sql, desc } from "drizzle-orm";
import { signToken, signTokenWithVersion, verifyToken, COOKIE_NAME } from "../lib/jwt";
import { requireAuth } from "../middlewares/auth";
import { logActivity } from "../lib/activity";

function getClientIp(req: Request): string {
  return (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
    ?? req.socket.remoteAddress
    ?? "unknown";
}

async function recordSession(userId: string, req: Request) {
  await db.insert(userSessionsTable).values({
    userId,
    ipAddress: getClientIp(req),
    userAgent: req.headers["user-agent"]?.slice(0, 500) ?? null,
  });
}

// ── Pure Node.js TOTP helpers (RFC 6238) ───────────────────────────────────

const BASE32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(input: string): Buffer {
  const s = input.toUpperCase().replace(/=+$/, "");
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const c of s) {
    const idx = BASE32_CHARS.indexOf(c);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}

function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { out += BASE32_CHARS[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += BASE32_CHARS[(value << (5 - bits)) & 31];
  return out;
}

function totpGenerate(secret: string, counter?: number): string {
  const key = base32Decode(secret);
  const c = counter ?? Math.floor(Date.now() / 30000);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(c / 0x100000000), 0);
  buf.writeUInt32BE(c >>> 0, 4);
  const hmac = createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3];
  return String(code % 1_000_000).padStart(6, "0");
}

function totpVerify(token: string, secret: string): boolean {
  const c = Math.floor(Date.now() / 30000);
  for (let i = -1; i <= 1; i++) {
    if (totpGenerate(secret, c + i) === String(token).trim()) return true;
  }
  return false;
}

function totpGenerateSecret(): string {
  return base32Encode(randomBytes(20));
}

function totpKeyUri(email: string, issuer: string, secret: string): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

// ───────────────────────────────────────────────────────────────────────────

const router: IRouter = Router();

const isProd = process.env.NODE_ENV === "production";

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProd,
  // SameSite=None is required for the cookie to be sent inside cross-site
  // iframes (e.g. when embedded in KHURK OS). Must pair with Secure=true,
  // which is already the case in production. In dev we fall back to "lax"
  // because localhost isn't HTTPS and "none" would be rejected by the browser.
  sameSite: (isProd ? "none" : "lax") as "none" | "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

// Rate limiter: 5 attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many login attempts. Please try again in 15 minutes.",
    retryAfter: 15,
  },
});

// More lenient for register (10 per hour per IP)
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many registration attempts. Try again later." },
});

function toUserResponse(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName ?? null,
    walletAddress: user.walletAddress ?? null,
    timezone: user.timezone ?? null,
    totpEnabled: user.totpEnabled,
    createdAt: user.createdAt.toISOString(),
  };
}

router.post("/register", registerLimiter, async (req, res) => {
  const { email: rawEmail, password } = req.body ?? {};
  if (!rawEmail || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }
  if (typeof password !== "string" || password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }

  const email = String(rawEmail).trim().toLowerCase();

  const existing = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: "Email already in use" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const [user] = await db
    .insert(usersTable)
    .values({ email, passwordHash })
    .returning();

  logActivity({ userId: user.id, action: "register", resourceType: "system" });

  const token = signTokenWithVersion(user.id, user.tokenVersion);
  res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);
  res.status(201).json({ user: toUserResponse(user), token, message: "Account created successfully" });
});

router.post("/login", loginLimiter, async (req, res) => {
  const { email: rawEmail, password } = req.body ?? {};
  if (!rawEmail || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }

  const email = String(rawEmail).trim().toLowerCase();

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  // If TOTP is enabled, return a pending token instead of full auth
  if (user.totpEnabled && user.totpSecret) {
    const pendingToken = signToken(user.id, { totpPending: true }, "5m");
    res.status(200).json({ requiresTOTP: true, pendingToken });
    return;
  }

  logActivity({ userId: user.id, action: "login", resourceType: "system" });
  recordSession(user.id, req).catch(() => {});

  const token = signTokenWithVersion(user.id, user.tokenVersion);
  res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);
  res.json({ user: toUserResponse(user), token, message: "Logged in successfully" });
});

router.post("/logout", (_req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ message: "Logged out successfully" });
});

router.get("/me", requireAuth, async (req, res) => {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.userId!))
    .limit(1);

  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }
  res.json(toUserResponse(user));
});

// ── TOTP endpoints ─────────────────────────────────────────────────────────

// POST /auth/totp/setup — generate a TOTP secret for the logged-in user
router.post("/totp/setup", requireAuth, async (req, res) => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
  if (!user) { res.status(401).json({ error: "User not found" }); return; }
  if (user.totpEnabled) {
    res.status(409).json({ error: "2FA is already enabled. Disable it first." });
    return;
  }

  const secret = totpGenerateSecret();
  const otpauthUri = totpKeyUri(user.email, "foldr.storage", secret);

  // Store the secret (not yet enabled)
  await db.update(usersTable)
    .set({ totpSecret: secret, updatedAt: new Date() })
    .where(eq(usersTable.id, user.id));

  res.json({ secret, otpauthUri });
});

// POST /auth/totp/confirm — verify initial setup and enable TOTP
router.post("/totp/confirm", requireAuth, async (req, res) => {
  const { code } = req.body ?? {};
  if (!code) { res.status(400).json({ error: "Verification code required" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
  if (!user?.totpSecret) { res.status(400).json({ error: "TOTP setup not started. Call /auth/totp/setup first." }); return; }
  if (user.totpEnabled) { res.status(409).json({ error: "2FA already enabled" }); return; }

  const isValid = totpVerify(String(code), user.totpSecret);
  if (!isValid) { res.status(400).json({ error: "Invalid verification code" }); return; }

  await db.update(usersTable)
    .set({ totpEnabled: true, updatedAt: new Date() })
    .where(eq(usersTable.id, user.id));

  logActivity({ userId: user.id, action: "totp_enabled", resourceType: "system" });
  res.json({ message: "Two-factor authentication enabled successfully" });
});

// POST /auth/totp/challenge — complete login when TOTP is required
router.post("/totp/challenge", async (req, res) => {
  const { pendingToken, code } = req.body ?? {};
  if (!pendingToken || !code) {
    res.status(400).json({ error: "pendingToken and code are required" });
    return;
  }

  let payload: any;
  try {
    payload = verifyToken(pendingToken);
  } catch {
    res.status(401).json({ error: "Invalid or expired session. Please log in again." });
    return;
  }

  if (!payload.totpPending) {
    res.status(400).json({ error: "Invalid challenge token" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, payload.sub)).limit(1);
  if (!user?.totpSecret || !user.totpEnabled) {
    res.status(400).json({ error: "TOTP not configured" });
    return;
  }

  const isValid = totpVerify(String(code), user.totpSecret);
  if (!isValid) {
    res.status(401).json({ error: "Invalid authentication code" });
    return;
  }

  logActivity({ userId: user.id, action: "login", resourceType: "system" });
  recordSession(user.id, req).catch(() => {});

  const token = signTokenWithVersion(user.id, user.tokenVersion);
  res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);
  res.json({ user: toUserResponse(user), token, message: "Logged in successfully" });
});

// DELETE /auth/totp — disable TOTP
router.delete("/totp", requireAuth, async (req, res) => {
  const { code } = req.body ?? {};
  if (!code) { res.status(400).json({ error: "Current TOTP code required to disable 2FA" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
  if (!user?.totpEnabled || !user.totpSecret) {
    res.status(400).json({ error: "2FA is not enabled" });
    return;
  }

  const isValid = totpVerify(String(code), user.totpSecret);
  if (!isValid) { res.status(401).json({ error: "Invalid code" }); return; }

  await db.update(usersTable)
    .set({ totpEnabled: false, totpSecret: null, updatedAt: new Date() })
    .where(eq(usersTable.id, user.id));

  logActivity({ userId: user.id, action: "totp_disabled", resourceType: "system" });
  res.json({ message: "Two-factor authentication disabled" });
});

// PUT /auth/profile — update display name and timezone
router.put("/profile", requireAuth, async (req, res) => {
  const { displayName, timezone } = req.body ?? {};

  const updates: Record<string, any> = { updatedAt: new Date() };
  if (displayName !== undefined) updates.displayName = displayName?.trim() || null;
  if (timezone !== undefined) updates.timezone = timezone || null;

  const [user] = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, req.userId!))
    .returning();

  if (!user) { res.status(401).json({ error: "User not found" }); return; }

  logActivity({ userId: user.id, action: "profile_updated", resourceType: "system" });
  res.json(toUserResponse(user));
});

// DELETE /auth/account — permanently delete the account
router.delete("/account", requireAuth, async (req, res) => {
  const { password } = req.body ?? {};
  if (!password) {
    res.status(400).json({ error: "Password is required to delete your account" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.userId!))
    .limit(1);

  if (!user) { res.status(401).json({ error: "User not found" }); return; }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Incorrect password" });
    return;
  }

  await db.delete(usersTable).where(eq(usersTable.id, user.id));

  res.clearCookie(COOKIE_NAME);
  res.json({ message: "Your account has been permanently deleted." });
});

// POST /auth/revoke-sessions — increment tokenVersion to invalidate all JWTs
router.post("/revoke-sessions", requireAuth, async (req, res) => {
  const [user] = await db
    .update(usersTable)
    .set({ tokenVersion: sql`${usersTable.tokenVersion} + 1`, updatedAt: new Date() })
    .where(eq(usersTable.id, req.userId!))
    .returning();

  if (!user) { res.status(401).json({ error: "User not found" }); return; }

  logActivity({ userId: user.id, action: "sessions_revoked", resourceType: "system" });

  res.clearCookie(COOKIE_NAME);
  res.json({ message: "All sessions have been signed out." });
});

// GET /auth/sessions — list recent login sessions
router.get("/sessions", requireAuth, async (req, res) => {
  const sessions = await db
    .select()
    .from(userSessionsTable)
    .where(eq(userSessionsTable.userId, req.userId!))
    .orderBy(desc(userSessionsTable.createdAt))
    .limit(50);

  res.json({
    sessions: sessions.map(s => ({
      id: s.id,
      ipAddress: s.ipAddress ?? null,
      userAgent: s.userAgent ?? null,
      createdAt: s.createdAt.toISOString(),
    })),
  });
});

export default router;
