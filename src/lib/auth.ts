import "server-only";
import { scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession } from "@/lib/auth-token";

const scrypt = promisify(scryptCallback);

export async function verifyCredentials(email: string, password: string) {
  const configuredEmail = process.env.AUTH_EMAIL?.trim().toLowerCase();
  const hash = process.env.AUTH_PASSWORD_HASH;
  if (!configuredEmail || !hash) return false;
  const [version, salt, expectedHex] = hash.split(":");
  if (version !== "scrypt" || !salt || !/^[a-f0-9]{128}$/.test(expectedHex ?? "")) return false;
  const actual = await scrypt(password, salt, 64) as Buffer;
  const expected = Buffer.from(expectedHex, "hex");
  const passwordMatches = timingSafeEqual(actual, expected);
  return passwordMatches && email.trim().toLowerCase() === configuredEmail;
}

export async function requireAuth() {
  const cookie = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!verifySession(cookie)) redirect("/login");
}
