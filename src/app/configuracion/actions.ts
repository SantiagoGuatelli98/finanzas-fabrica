"use server";

import { requireAuth } from "@/lib/auth";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { appSettings, categories, paymentMethods } from "@/lib/db/schema";

const optional = (limit: number) => z.string().trim().max(limit).optional().transform((value) => value || null);

export async function saveSettings(formData: FormData) {
  await requireAuth();
  const parsed = z.object({
    businessName: z.string().trim().max(160), businessPhone: optional(80), businessAddress: optional(240),
    businessLogoUrl: z.union([z.literal(""), z.string().url().max(500)]).optional().transform((value) => value || null),
    currency: z.enum(["ARS", "USD", "EUR"]), debtTargetDate: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional().transform((value) => value || null),
    emergencyFundTarget: z.string().trim().regex(/^\d{1,12}([,.]\d{1,2})?$/).transform((value) => value.replace(",", ".")),
  }).safeParse(Object.fromEntries(formData.entries()));
  if (!db || !parsed.success) redirect("/configuracion?error=datos");
  try {
    await db.insert(appSettings).values({ id: 1, ...parsed.data }).onConflictDoUpdate({ target: appSettings.id, set: { ...parsed.data, updatedAt: new Date() } });
  } catch { redirect("/configuracion?error=datos"); }
  revalidatePath("/"); revalidatePath("/pedidos"); revalidatePath("/negocio"); revalidatePath("/personal");
  redirect("/configuracion?guardado=1");
}

export async function createCategory(formData: FormData) {
  await requireAuth();
  const parsed = z.object({ scope: z.enum(["personal", "business"]), name: z.string().trim().min(1).max(80) }).safeParse(Object.fromEntries(formData.entries()));
  if (!db || !parsed.success) redirect("/configuracion?error=categoria");
  try { await db.insert(categories).values(parsed.data).onConflictDoNothing(); } catch { redirect("/configuracion?error=categoria"); }
  revalidatePath("/configuracion"); revalidatePath("/personal"); revalidatePath("/negocio"); redirect("/configuracion?categoria=guardada");
}

export async function updateCategory(formData: FormData) {
  await requireAuth();
  const parsed = z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(80), active: z.enum(["true", "false"]) }).safeParse(Object.fromEntries(formData.entries()));
  if (!db || !parsed.success) redirect("/configuracion?error=categoria");
  try { await db.update(categories).set({ name: parsed.data.name, active: parsed.data.active === "true" }).where(eq(categories.id, parsed.data.id)); } catch { redirect("/configuracion?error=categoria"); }
  revalidatePath("/configuracion"); revalidatePath("/personal"); revalidatePath("/negocio"); redirect("/configuracion?categoria=actualizada");
}

export async function createPaymentMethod(formData: FormData) {
  await requireAuth();
  const parsed = z.object({ name: z.string().trim().min(1).max(80) }).safeParse(Object.fromEntries(formData.entries()));
  if (!db || !parsed.success) redirect("/configuracion?error=medio");
  try { await db.insert(paymentMethods).values(parsed.data).onConflictDoNothing(); } catch { redirect("/configuracion?error=medio"); }
  revalidatePath("/configuracion"); revalidatePath("/personal"); revalidatePath("/pedidos"); revalidatePath("/negocio"); redirect("/configuracion?medio=guardado");
}

export async function updatePaymentMethod(formData: FormData) {
  await requireAuth();
  const parsed = z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(80), active: z.enum(["true", "false"]) }).safeParse(Object.fromEntries(formData.entries()));
  if (!db || !parsed.success) redirect("/configuracion?error=medio");
  try { await db.update(paymentMethods).set({ name: parsed.data.name, active: parsed.data.active === "true" }).where(eq(paymentMethods.id, parsed.data.id)); } catch { redirect("/configuracion?error=medio"); }
  revalidatePath("/configuracion"); revalidatePath("/personal"); revalidatePath("/pedidos"); revalidatePath("/negocio"); redirect("/configuracion?medio=actualizado");
}
