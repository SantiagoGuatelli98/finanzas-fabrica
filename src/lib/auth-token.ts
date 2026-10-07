import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "mi_caja_session";
const SESSION_HOURS = 12;
const REMEMBER_DAYS = 30;

function signingKey() {
  const secret = process.env.AUTH_SESSION_SECRET;
  const passwordHash = process.env.AUTH_PASSWORD_HASH;
  if (!secret || secret.length < 32 || !passwordHash) return null;
  return `${secret}:${passwordHash}`;
}

export function authConfigured() {
  return Boolean(process.env.AUTH_EMAIL && process.env.AUTH_PASSWORD_HASH && signingKey());
}

export function createSession(remember: boolean) {
  const key = signingKey();
  if (!key) throw new Error("Falta configurar el acceso.");
  const lifetime = remember ? REMEMBER_DAYS * 86400 : SESSION_HOURS * 3600;
  const expires = Math.floor(Date.now() / 1000) + lifetime;
  const payload = `v1.${expires}`;
  const signature = createHmac("sha256", key).update(payload).digest("base64url");
  return { value: `${payload}.${signature}`, maxAge: remember ? lifetime : undefined };
}

export function verifySession(value: string | undefined) {
  const key = signingKey();
  if (!key || !value) return false;
  const parts = value.split(".");
  if (parts.length !== 3 || parts[0] !== "v1" || !/^\d{10,11}$/.test(parts[1])) return false;
  const expires = Number(parts[1]);
  if (expires <= Math.floor(Date.now() / 1000) || expires > Math.floor(Date.now() / 1000) + REMEMBER_DAYS * 86400) return false;
  const expected = createHmac("sha256", key).update(`${parts[0]}.${parts[1]}`).digest();
  let actual: Buffer;
  try { actual = Buffer.from(parts[2], "base64url"); } catch { return false; }
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
