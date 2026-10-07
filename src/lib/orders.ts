import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { appSettings, clients, orderItems, orders, payments, products } from "@/lib/db/schema";

export async function getOrdersData() {
  if (!db) return { configured: false as const };
  try {
    const [ordersRows, itemRows, paymentRows, productRows, clientRows, settingRows] = await Promise.all([
      db.select().from(orders).orderBy(desc(orders.createdOn), desc(orders.createdAt)).limit(100),
      db.select().from(orderItems),
      db.select().from(payments),
      db.select().from(products).where(eq(products.active, true)).then((rows) => rows.filter((product) => Number(product.price) > 0)),
      db.select().from(clients).where(eq(clients.active, true)),
      db.select({ currency: appSettings.currency }).from(appSettings).limit(1),
    ]);
    return { configured: true as const, orders: ordersRows, items: itemRows, payments: paymentRows, products: productRows, clients: clientRows, currency: settingRows[0]?.currency ?? "ARS" };
  } catch {
    return { configured: true as const, error: true as const };
  }
}

export async function getOrderDocument(orderId: string) {
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
