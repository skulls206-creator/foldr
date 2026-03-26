import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET!;
export const COOKIE_NAME = "token";

export function signToken(
  userId: string,
  extraClaims: Record<string, unknown> = {},
  expiresIn: string | number = "7d"
): string {
  return jwt.sign({ sub: userId, userId, ...extraClaims }, JWT_SECRET, { expiresIn } as jwt.SignOptions);
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
  return jwt.sign({ sub: userId, userId, tokenVersion, ...extraClaims }, JWT_SECRET, { expiresIn } as jwt.SignOptions);
}
