import jwt, { SignOptions } from "jsonwebtoken";

const raw = process.env.JWT_SECRET;
if (!raw) {
  throw new Error("JWT_SECRET environment variable is required");
}
const JWT_SECRET: string = raw;
export const COOKIE_NAME = "token";

export function signToken(
  userId: string,
  extraClaims: Record<string, unknown> = {},
  expiresIn: string | number = "7d"
): string {
  const options: SignOptions = { expiresIn: expiresIn as jwt.SignOptions["expiresIn"] };
  return jwt.sign({ sub: userId, userId, ...extraClaims }, JWT_SECRET, options);
}

export function verifyToken(token: string): Record<string, any> {
  return jwt.verify(token, JWT_SECRET) as Record<string, any>;
}

export function signTokenWithVersion(
  userId: string,
  tokenVersion: number,
  extraClaims: Record<string, unknown> = {},
  expiresIn: string | number = "7d"
): string {
  const options: SignOptions = { expiresIn: expiresIn as jwt.SignOptions["expiresIn"] };
  return jwt.sign({ sub: userId, userId, tokenVersion, ...extraClaims }, JWT_SECRET, options);
}
