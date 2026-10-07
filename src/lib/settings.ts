import { requireAuth } from "@/lib/auth";
import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { appSettings, categories, paymentMethods } from "@/lib/db/schema";

export async function getConfigurationData() {
  await requireAuth();
  if (!db) return { configured: false as const };
  try {
    const [settingsRows, categoryRows, methodRows] = await Promise.all([
      db.select().from(appSettings).limit(1),
      db.select().from(categories).orderBy(asc(categories.scope), asc(categories.name)),
      db.select().from(paymentMethods).orderBy(asc(paymentMethods.name)),
    ]);
    return { configured: true as const, settings: settingsRows[0] ?? null, categories: categoryRows, paymentMethods: methodRows };
  } catch { return { configured: true as const, error: true as const }; }
}
