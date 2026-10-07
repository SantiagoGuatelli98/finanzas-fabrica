"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { verifyCredentials } from "@/lib/auth";
import { createSession, SESSION_COOKIE } from "@/lib/auth-token";

function destination(raw: string | null) {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "/";
  return raw;
}

export async function login(formData: FormData) {
  const parsed = z.object({
    email: z.email().max(254),
    password: z.string().min(1).max(256),
    remember: z.string().optional(),
    next: z.string().optional(),
  }).safeParse(Object.fromEntries(formData.entries()));
  const next = destination(typeof formData.get("next") === "string" ? String(formData.get("next")) : null);
  if (!parsed.success || !(await verifyCredentials(parsed.data.email, parsed.data.password))) {
    redirect(`/login?error=credenciales&next=${encodeURIComponent(next)}`);
  }
  const remember = parsed.data.remember === "on";
  const session = createSession(remember);
  (await cookies()).set(SESSION_COOKIE, session.value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: session.maxAge,
  });
  redirect(next);
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
