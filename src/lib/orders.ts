import { requireAuth } from "@/lib/auth";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { appSettings, businessCashMovements, categories, clients, orderItems, orders, paymentMethods, payments, products } from "@/lib/db/schema";

export async function getOrdersData() {
  await requireAuth();
  if (!db) return { configured: false as const };
  try {
    const [ordersRows, itemRows, paymentRows, productRows, clientRows, settingRows, methodRows, quickReceipts] = await Promise.all([
      db.select().from(orders).orderBy(desc(orders.createdOn), desc(orders.createdAt)),
      db.select().from(orderItems),
      db.select().from(payments),
      db.select().from(products).where(eq(products.active, true)).then((rows) => rows.filter((product) => Number(product.price) > 0)),
      db.select().from(clients).where(eq(clients.active, true)),
      db.select({ currency: appSettings.currency }).from(appSettings).limit(1),
      db.select({ name: paymentMethods.name }).from(paymentMethods).where(eq(paymentMethods.active, true)).orderBy(asc(paymentMethods.name)),
      db.select({ id: businessCashMovements.id, amount: businessCashMovements.amount, occurredOn: businessCashMovements.occurredOn, description: businessCashMovements.description, category: categories.name, paymentMethod: paymentMethods.name })
        .from(businessCashMovements)
        .leftJoin(categories, eq(businessCashMovements.categoryId, categories.id))
        .leftJoin(paymentMethods, eq(businessCashMovements.paymentMethodId, paymentMethods.id))
        .where(and(eq(businessCashMovements.source, "manual_income"), eq(categories.name, "Venta rápida")))
        .orderBy(desc(businessCashMovements.occurredOn), desc(businessCashMovements.createdAt)),
    ]);
    return { configured: true as const, orders: ordersRows, items: itemRows, payments: paymentRows, products: productRows, clients: clientRows, paymentMethods: methodRows, quickReceipts, currency: settingRows[0]?.currency ?? "ARS" };
  } catch {
    return { configured: true as const, error: true as const };
  }
}

export async function getOrderDocument(orderId: string) {
  await requireAuth();
  if (!db) return { configured: false as const };
  try {
    const [orderRows, itemRows, settingRows, clientRows] = await Promise.all([
      db.select().from(orders).where(eq(orders.id, orderId)).limit(1),
      db.select().from(orderItems).where(eq(orderItems.orderId, orderId)),
      db.select().from(appSettings).limit(1),
      db.select().from(clients),
    ]);
    const order = orderRows[0];
    if (!order) return { configured: true as const, missing: true as const };
    const client = clientRows.find((row) => row.id === order.clientId);
    return { configured: true as const, order, items: itemRows, settings: settingRows[0] ?? null, client };
  } catch {
    return { configured: true as const, error: true as const };
  }
}
