"use server";

import { requireAuth } from "@/lib/auth";

import { and, eq, inArray, sql } from "drizzle-orm";
import Decimal from "decimal.js";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { businessCashMovements, clients, orderItems, orders, paymentMethods, payments, products } from "@/lib/db/schema";

const amountText = z.string().trim().regex(/^\d{1,12}([,.]\d{1,2})?$/).transform((value) => value.replace(",", "."));
const dateText = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
});
const noteText = z.string().trim().max(500).optional().transform((value) => value || null);
const quantityText = z.string().trim().regex(/^\d{1,9}(\.\d{1,3})?$/);

async function getPaymentMethod(name: string) {
  if (!db) throw new Error("Falta configurar Neon.");
  const clean = name.trim().slice(0, 80);
  await db.insert(paymentMethods).values({ name: clean }).onConflictDoNothing();
  const [method] = await db.select({ id: paymentMethods.id }).from(paymentMethods).where(eq(paymentMethods.name, clean)).limit(1);
  if (!method) throw new Error("No se pudo guardar el medio de pago.");
  return method.id;
}

export async function createOrder(formData: FormData) {
  await requireAuth();
  let rawItems: unknown;
  try { rawItems = JSON.parse(String(formData.get("itemsJson") ?? "")); } catch { redirect("/pedidos?error=lineas"); }
  const parsed = z.object({
    clientId: z.string().uuid(),
    createdOn: dateText,
    deliveryOn: z.union([dateText, z.literal("")]).optional().transform((value) => value || null),
    discount: amountText,
    notes: noteText,
    requestKey: z.string().uuid(),
  }).safeParse(Object.fromEntries([...formData.entries()].filter(([key]) => key !== "itemsJson")));
  const itemsParsed = z.array(z.object({ productId: z.string().uuid(), quantity: quantityText, unitPrice: amountText })).min(1).max(30).safeParse(rawItems);
  if (!db || !parsed.success || !itemsParsed.success) redirect("/pedidos?error=validacion");

  const [client] = await db.select().from(clients).where(and(eq(clients.id, parsed.data.clientId), eq(clients.active, true))).limit(1);
  if (!client) redirect("/pedidos?error=cliente");
  const productIds = [...new Set(itemsParsed.data.map((item) => item.productId))];
  const catalog = await db.select().from(products).where(inArray(products.id, productIds));
  if (catalog.length !== productIds.length || catalog.some((item) => !item.active)) redirect("/pedidos?error=producto");
  const byId = new Map(catalog.map((product) => [product.id, product]));
  const lines = itemsParsed.data.map((item) => {
    const product = byId.get(item.productId)!;
    const quantity = new Decimal(item.quantity);
    const unitPrice = new Decimal(item.unitPrice);
    if (!quantity.isPositive() || !unitPrice.isPositive()) redirect("/pedidos?error=monto");
    return { productId: product.id, productName: product.name, unit: product.unit, quantity: quantity.toFixed(3), unitPrice: unitPrice.toFixed(2), subtotal: quantity.times(unitPrice).toDecimalPlaces(2, Decimal.ROUND_HALF_UP) };
  });
  const subtotal = lines.reduce((sum, line) => sum.plus(line.subtotal), new Decimal(0)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const discount = new Decimal(parsed.data.discount);
  if (discount.isNegative() || discount.gt(subtotal)) redirect("/pedidos?error=descuento");
  const total = subtotal.minus(discount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  try {
    await db.transaction(async (tx) => {
      const [order] = await tx.insert(orders).values({
        requestKey: parsed.data.requestKey,
        clientId: client.id,
        clientName: client.name,
        createdOn: parsed.data.createdOn,
        deliveryOn: parsed.data.deliveryOn,
        subtotal: subtotal.toFixed(2),
        discount: discount.toFixed(2),
        total: total.toFixed(2),
        notes: parsed.data.notes,
        statusHistory: [{ stage: "created", at: new Date().toISOString() }],
      }).returning({ id: orders.id, orderNumber: orders.orderNumber });
      await tx.insert(orderItems).values(lines.map((line) => ({ ...line, orderId: order.id, unitPrice: line.unitPrice, subtotal: line.subtotal.toFixed(2) })));
    });
  } catch {
    redirect("/pedidos?error=guardar");
  }
  revalidatePath("/"); revalidatePath("/pedidos");
  redirect("/pedidos?creado=1");
}

export async function registerOrderPayment(formData: FormData) {
  await requireAuth();
  const parsed = z.object({
    paymentId: z.string().uuid(), orderId: z.string().uuid(), amount: amountText,
    receivedOn: dateText, paymentMethod: z.string().trim().min(1).max(80), note: noteText,
  }).safeParse(Object.fromEntries(formData.entries()));
  if (!db || !parsed.success) redirect("/pedidos?error=pago");
  const values = parsed.data;
  const paidAmount = new Decimal(values.amount);
  if (!paidAmount.isPositive()) redirect("/pedidos?error=pago");
  try {
    const paymentMethodId = await getPaymentMethod(values.paymentMethod);
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`order:${values.orderId}`}))`);
      const [order] = await tx.select({ total: orders.total, stage: orders.stage, orderNumber: orders.orderNumber }).from(orders).where(eq(orders.id, values.orderId)).limit(1);
      if (!order || order.stage === "cancelled") throw new Error("El pedido no admite cobros.");
      const existing = await tx.select({ amount: payments.amount }).from(payments).where(eq(payments.orderId, values.orderId));
      const paid = existing.reduce((sum, payment) => sum.plus(payment.amount), new Decimal(0));
      const outstanding = Decimal.max(0, new Decimal(order.total).minus(paid));
      if (paidAmount.gt(outstanding)) throw new Error("El cobro supera el saldo pendiente.");
      const cashMovementId = randomUUID();
      await tx.insert(businessCashMovements).values({
        id: cashMovementId, direction: "in", amount: paidAmount.toFixed(2), occurredOn: values.receivedOn,
        paymentMethodId, description: `Cobro de pedido PED-${String(order.orderNumber).padStart(6, "0")}`,
        source: "order_payment", sourceId: values.paymentId,
      });
      await tx.insert(payments).values({
        id: values.paymentId, orderId: values.orderId, amount: paidAmount.toFixed(2), receivedOn: values.receivedOn,
        paymentMethodId, note: values.note, cashMovementId,
      });
    });
  } catch {
    redirect("/pedidos?error=pago");
  }
  revalidatePath("/"); revalidatePath("/pedidos");
  redirect("/pedidos?pago=guardado");
}

const transitions: Record<string, string[]> = {
  created: ["sent", "cancelled"],
  sent: ["confirmed", "cancelled"],
  confirmed: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

export async function updateOrderStage(formData: FormData) {
  await requireAuth();
  const parsed = z.object({ orderId: z.string().uuid(), stage: z.enum(["sent", "confirmed", "delivered", "cancelled"]) }).safeParse(Object.fromEntries(formData.entries()));
  if (!db || !parsed.success) redirect("/pedidos?error=estado");
  try {
    await db.transaction(async (tx) => {
      const [order] = await tx.select({ stage: orders.stage, statusHistory: orders.statusHistory }).from(orders).where(eq(orders.id, parsed.data.orderId)).limit(1);
      if (!order || !transitions[order.stage].includes(parsed.data.stage)) throw new Error("Cambio de estado no permitido.");
      await tx.update(orders).set({
        stage: parsed.data.stage,
        statusHistory: [...order.statusHistory, { stage: parsed.data.stage, at: new Date().toISOString() }],
      }).where(eq(orders.id, parsed.data.orderId));
    });
  } catch {
    redirect("/pedidos?error=estado");
  }
  revalidatePath("/"); revalidatePath("/pedidos"); redirect("/pedidos?estado=actualizado");
}
