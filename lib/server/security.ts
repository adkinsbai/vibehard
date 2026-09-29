import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
const scrypt = promisify(scryptCallback);
function sessionSecret() {
  const configured = process.env.SESSION_SECRET;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET must be configured in production");
  return "vibehard-development-session-secret";
}
export const AUTH_COOKIE = "vibehard_session";
export function sessionCookiePath() { return process.env.NEXT_PUBLIC_BASE_PATH || "/"; }
export interface SessionUser { id: string; email: string; name: string; role: string; }
export type SessionIdentity = SessionUser & { credential?: string };
export type SessionAccount = SessionUser & { passwordHash?: string };
function credentialTag(user: { id: string; passwordHash: string }) {
  return createHmac("sha256", sessionSecret()).update(JSON.stringify(["session-credential-v1", user.id, user.passwordHash])).digest("hex");
}
export function sessionMatchesAccount(session: SessionIdentity, user: { id: string; passwordHash: string }) {
  if (!session.credential || !/^[a-f0-9]{64}$/.test(session.credential)) return false;
  return timingSafeEqual(Buffer.from(session.credential, "hex"), Buffer.from(credentialTag(user), "hex"));
}
export async function hashPassword(password: string) { const salt = randomBytes(16).toString("hex"); const derived = (await scrypt(password, salt, 64)) as Buffer; return `scrypt:${salt}:${derived.toString("hex")}`; }
export async function verifyPassword(password: string, encoded: string) { const [algorithm, salt, digest] = encoded.split(":"); if (algorithm !== "scrypt" || !salt || !digest) return false; const expected = Buffer.from(digest, "hex"); const actual = (await scrypt(password, salt, expected.length)) as Buffer; return expected.length === actual.length && timingSafeEqual(expected, actual); }
function signature(payload: string) { return createHmac("sha256", sessionSecret()).update(payload).digest("base64url"); }
export function createSessionToken(user: SessionAccount, days = 7) {
  // Explicit allowlist: callers may pass a full database row; never serialize it.
  const { id, email, name, role } = user;
  const credential = user.passwordHash ? credentialTag({ id, passwordHash: user.passwordHash }) : undefined;
  const payload = Buffer.from(JSON.stringify({ id, email, name, role, credential, exp: Date.now() + days * 86_400_000 })).toString("base64url");
  return `${payload}.${signature(payload)}`;
}
export function readSessionToken(token?: string): SessionIdentity | null { if (!token) return null; const [payload, suppliedSignature, extra] = token.split("."); if (!payload || !suppliedSignature || extra !== undefined) return null; const expected = Buffer.from(signature(payload)); const supplied = Buffer.from(suppliedSignature); if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null; try { const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionIdentity & { exp: number }; if (!parsed.id || !parsed.email || !Number.isFinite(parsed.exp) || parsed.exp <= Date.now()) return null; return { id: parsed.id, email: parsed.email, name: parsed.name, role: parsed.role, ...(parsed.credential ? { credential: parsed.credential } : {}) }; } catch { return null; } }
export function hashRunnerSecret(secret: string) { return createHmac("sha256", sessionSecret()).update(`runner:${secret}`).digest("hex"); }
