import { requireAuth } from "@/lib/auth";
import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { appSettings, businessCashMovements, businessExpenses, categories, clients, paymentMethods, products, supplierDebts, supplierPayments, suppliers } from "@/lib/db/schema";

export async function getBusinessSetup() {
  await requireAuth();
  if (!db) return { configured: false as const };
  try {
    const [productRows, clientRows, supplierRows, expenseRows, supplierBillRows, debtRows, supplierPaymentRows, categoryRows, settingsRows] = await Promise.all([
      db.select().from(products).orderBy(asc(products.name)),
      db.select().from(clients).orderBy(asc(clients.name)),
      db.select().from(suppliers).orderBy(asc(suppliers.name)),
      db.select().from(businessExpenses).orderBy(desc(businessExpenses.occurredOn)).limit(50),
      db.select({ id: businessExpenses.id, supplierId: businessExpenses.supplierId, supplierName: suppliers.name, amount: businessExpenses.amount, occurredOn: businessExpenses.occurredOn, description: businessExpenses.description, notes: businessExpenses.notes, paymentMethod: paymentMethods.name })
        .from(businessExpenses)
        .innerJoin(suppliers, eq(businessExpenses.supplierId, suppliers.id))
        .innerJoin(businessCashMovements, eq(businessExpenses.cashMovementId, businessCashMovements.id))
        .leftJoin(paymentMethods, eq(businessCashMovements.paymentMethodId, paymentMethods.id))
        .where(and(isNotNull(businessExpenses.supplierId), isNotNull(businessExpenses.cashMovementId)))
        .orderBy(desc(businessExpenses.occurredOn), desc(businessExpenses.createdAt)),
      db.select().from(supplierDebts).orderBy(desc(supplierDebts.openedOn)),
      db.select({ id: supplierPayments.id, debtId: supplierPayments.debtId, amount: supplierPayments.amount, paidOn: supplierPayments.paidOn, note: supplierPayments.note, paymentMethod: paymentMethods.name })
        .from(supplierPayments)
        .leftJoin(businessCashMovements, eq(supplierPayments.cashMovementId, businessCashMovements.id))
        .leftJoin(paymentMethods, eq(businessCashMovements.paymentMethodId, paymentMethods.id))
        .orderBy(desc(supplierPayments.paidOn), desc(supplierPayments.createdAt)),
      db.select().from(categories).where(eq(categories.scope, "business")).orderBy(asc(categories.name)),
      db.select({ currency: appSettings.currency }).from(appSettings).limit(1),
    ]);
    return { configured: true as const, products: productRows, clients: clientRows, suppliers: supplierRows, expenses: expenseRows, supplierBills: supplierBillRows, debts: debtRows, supplierPayments: supplierPaymentRows, categories: categoryRows, currency: settingsRows[0]?.currency ?? "ARS" };
  } catch {
    return { configured: true as const, error: true as const };
  }
}
