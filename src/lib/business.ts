import { requireAuth } from "@/lib/auth";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { appSettings, businessExpenses, categories, clients, products, supplierDebts, supplierPayments, suppliers } from "@/lib/db/schema";

export async function getBusinessSetup() {
  await requireAuth();
  if (!db) return { configured: false as const };
  try {
    const [productRows, clientRows, supplierRows, expenseRows, debtRows, supplierPaymentRows, categoryRows, settingsRows] = await Promise.all([
      db.select().from(products).orderBy(asc(products.name)),
      db.select().from(clients).orderBy(asc(clients.name)),
      db.select().from(suppliers).orderBy(asc(suppliers.name)),
      db.select().from(businessExpenses).orderBy(desc(businessExpenses.occurredOn)).limit(50),
      db.select().from(supplierDebts).orderBy(desc(supplierDebts.openedOn)),
      db.select().from(supplierPayments),
      db.select().from(categories).where(eq(categories.scope, "business")).orderBy(asc(categories.name)),
      db.select({ currency: appSettings.currency }).from(appSettings).limit(1),
    ]);
    return { configured: true as const, products: productRows, clients: clientRows, suppliers: supplierRows, expenses: expenseRows, debts: debtRows, supplierPayments: supplierPaymentRows, categories: categoryRows, currency: settingsRows[0]?.currency ?? "ARS" };
  } catch {
    return { configured: true as const, error: true as const };
  }
}
