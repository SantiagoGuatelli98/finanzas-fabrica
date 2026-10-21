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

import { canChangeOrderStage, deliveryAfterPayment } from "@/lib/order-workflow";

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
    saveMode: z.enum(["pending", "paid"]),
    paymentMethod: z.string().trim().max(80).optional(),
    receivedOn: z.string().optional(),
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
    if (!quantity.gt(0) || !unitPrice.gt(0)) redirect("/pedidos?error=monto");
    return { productId: product.id, productName: product.name, unit: product.unit, quantity: quantity.toFixed(3), unitPrice: unitPrice.toFixed(2), subtotal: quantity.times(unitPrice).toDecimalPlaces(2, Decimal.ROUND_HALF_UP) };
  });
  const subtotal = lines.reduce((sum, line) => sum.plus(line.subtotal), new Decimal(0)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const discount = new Decimal(parsed.data.discount);
  if (discount.isNegative() || discount.gt(subtotal)) redirect("/pedidos?error=descuento");
  const total = subtotal.minus(discount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const collectNow = parsed.data.saveMode === "paid";
  let receivedOn: string | null = null;
  if (collectNow) {
    const paidOn = dateText.safeParse(parsed.data.receivedOn);
    if (!total.gt(0) || !parsed.data.paymentMethod || !paidOn.success) redirect("/pedidos?error=pago");
    receivedOn = paidOn.data;
  }

  try {
    const paymentMethodId = collectNow ? await getPaymentMethod(parsed.data.paymentMethod!) : null;
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
        stage: collectNow ? "delivered" : "created",
        statusHistory: [{ stage: "created", at: new Date().toISOString() }, ...(collectNow ? [{ stage: "delivered", at: new Date().toISOString() }] : [])],
      }).returning({ id: orders.id, orderNumber: orders.orderNumber });
      await tx.insert(orderItems).values(lines.map((line) => ({ ...line, orderId: order.id, unitPrice: line.unitPrice, subtotal: line.subtotal.toFixed(2) })));
      if (collectNow && paymentMethodId && receivedOn) {
        const paymentId = randomUUID();
        const cashMovementId = randomUUID();
        await tx.insert(businessCashMovements).values({
          id: cashMovementId, direction: "in", amount: total.toFixed(2), occurredOn: receivedOn,
          paymentMethodId, description: `Cobro de pedido PED-${String(order.orderNumber).padStart(6, "0")}`,
          source: "order_payment", sourceId: paymentId,
        });
        await tx.insert(payments).values({
          id: paymentId, orderId: order.id, amount: total.toFixed(2), receivedOn,
          paymentMethodId, note: null, cashMovementId,
        });
      }
    });
  } catch {
    redirect("/pedidos?error=guardar");
  }
  revalidatePath("/"); revalidatePath("/pedidos");
  if (collectNow) revalidatePath("/negocio");
  redirect(collectNow ? "/pedidos?creado=cobrado" : "/pedidos?creado=1");
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
  if (!paidAmount.gt(0)) redirect("/pedidos?error=pago");
  try {
    const paymentMethodId = await getPaymentMethod(values.paymentMethod);
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`order:${values.orderId}`}))`);
      const [order] = await tx.select({ total: orders.total, stage: orders.stage, statusHistory: orders.statusHistory, orderNumber: orders.orderNumber }).from(orders).where(eq(orders.id, values.orderId)).limit(1);
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
      const delivery = deliveryAfterPayment(order, order.total, paid.plus(paidAmount), new Date().toISOString());
      if (delivery) await tx.update(orders).set(delivery).where(eq(orders.id, values.orderId));
    });
  } catch {
    redirect("/pedidos?error=pago");
  }
  revalidatePath("/"); revalidatePath("/pedidos");
  revalidatePath("/negocio");
  revalidatePath(`/pedidos/${values.orderId}/documento`);
  redirect(`/pedidos?pago=guardado#pedido-${values.orderId}`);
}

export async function registerMultipleOrderPayments(formData: FormData) {
  await requireAuth();
  let rawOrderIds: unknown;
  try { rawOrderIds = JSON.parse(String(formData.get("orderIds") ?? "")); } catch { redirect("/pedidos?error=pago-multiple"); }
  const parsed = z.object({
    orderIds: z.array(z.string().uuid()).min(1).max(100),
    receivedOn: dateText,
    paymentMethod: z.string().trim().min(1).max(80),
    note: noteText,
  }).safeParse({ ...Object.fromEntries(formData.entries()), orderIds: rawOrderIds });
  if (!db || !parsed.success) redirect("/pedidos?error=pago-multiple");
  const orderIds = [...new Set(parsed.data.orderIds)].sort();
  if (!orderIds.length) redirect("/pedidos?error=pago-multiple");
  try {
    const paymentMethodId = await getPaymentMethod(parsed.data.paymentMethod);
    await db.transaction(async (tx) => {
      for (const orderId of orderIds) await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`order:${orderId}`}))`);
      const selectedOrders = await tx.select({ id: orders.id, total: orders.total, stage: orders.stage, statusHistory: orders.statusHistory, orderNumber: orders.orderNumber })
        .from(orders).where(inArray(orders.id, orderIds));
      if (selectedOrders.length !== orderIds.length || selectedOrders.some((order) => order.stage === "cancelled")) throw new Error("Hay pedidos que no admiten cobros.");
      const existingPayments = await tx.select({ orderId: payments.orderId, amount: payments.amount }).from(payments).where(inArray(payments.orderId, orderIds));
      const paidByOrder = new Map<string, Decimal>();
      for (const payment of existingPayments) paidByOrder.set(payment.orderId, (paidByOrder.get(payment.orderId) ?? new Decimal(0)).plus(payment.amount));
      const balances = selectedOrders.map((order) => ({ order, outstanding: Decimal.max(0, new Decimal(order.total).minus(paidByOrder.get(order.id) ?? new Decimal(0))) }));
      if (balances.some(({ outstanding }) => !outstanding.gt(0))) throw new Error("Seleccioná solo pedidos con saldo pendiente.");
      for (const { order, outstanding } of balances) {
        const paymentId = randomUUID();
        const cashMovementId = randomUUID();
        const amount = outstanding.toFixed(2);
        await tx.insert(businessCashMovements).values({
          id: cashMovementId, direction: "in", amount, occurredOn: parsed.data.receivedOn,
          paymentMethodId, description: `Cobro de pedido PED-${String(order.orderNumber).padStart(6, "0")}`,
          source: "order_payment", sourceId: paymentId,
        });
        await tx.insert(payments).values({
          id: paymentId, orderId: order.id, amount, receivedOn: parsed.data.receivedOn,
          paymentMethodId, note: parsed.data.note, cashMovementId,
        });
        const delivery = deliveryAfterPayment(order, order.total, order.total, new Date().toISOString());
        if (delivery) await tx.update(orders).set(delivery).where(eq(orders.id, order.id));
      }
    });
  } catch {
    redirect("/pedidos?error=pago-multiple");
  }
  revalidatePath("/"); revalidatePath("/pedidos"); revalidatePath("/negocio");
  redirect(`/pedidos?pago=multiple&cantidad=${orderIds.length}#cuentas-por-cobrar`);
}

export async function scheduleOrderDelivery(formData: FormData) {
  await requireAuth();
  const parsed = z.object({
    orderId: z.string().uuid(),
    deliveryOn: z.union([dateText, z.literal("")]).transform((value) => value || null),
  }).safeParse(Object.fromEntries(formData.entries()));
  if (!db || !parsed.success) redirect("/pedidos?error=entrega");
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`order:${parsed.data.orderId}`}))`);
      const [order] = await tx.select({ stage: orders.stage }).from(orders).where(eq(orders.id, parsed.data.orderId)).limit(1);
      if (!order || order.stage === "cancelled" || order.stage === "delivered") throw new Error("El pedido ya está cerrado.");
      await tx.update(orders).set({ deliveryOn: parsed.data.deliveryOn }).where(eq(orders.id, parsed.data.orderId));
    });
  } catch {
    redirect("/pedidos?error=entrega");
  }
  revalidatePath("/");
  revalidatePath("/pedidos");
  revalidatePath(`/pedidos/${parsed.data.orderId}/documento`);
  redirect(`/pedidos?entrega=guardada#pedido-${parsed.data.orderId}`);
}

export async function updateOrderStage(formData: FormData) {
  await requireAuth();
  const parsed = z.object({ orderId: z.string().uuid(), stage: z.enum(["sent", "confirmed", "delivered", "cancelled"]) }).safeParse(Object.fromEntries(formData.entries()));
  if (!db || !parsed.success) redirect("/pedidos?error=estado");
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`order:${parsed.data.orderId}`}))`);
      const [order] = await tx.select({ stage: orders.stage, statusHistory: orders.statusHistory }).from(orders).where(eq(orders.id, parsed.data.orderId)).limit(1);
      if (!order || !canChangeOrderStage(order.stage, parsed.data.stage)) throw new Error("Cambio de estado no permitido.");
      await tx.update(orders).set({
        stage: parsed.data.stage,
        statusHistory: [...order.statusHistory, { stage: parsed.data.stage, at: new Date().toISOString() }],
      }).where(eq(orders.id, parsed.data.orderId));
    });
  } catch {
    redirect("/pedidos?error=estado");
  }
  revalidatePath("/"); revalidatePath("/pedidos"); redirect(`/pedidos?estado=actualizado#pedido-${parsed.data.orderId}`);
}

export async function deliverPaidOrders(formData: FormData) {
  await requireAuth();
  let rawIds: unknown;
  try { rawIds = JSON.parse(String(formData.get("orderIds") ?? "")); } catch { redirect("/pedidos?error=estado"); }
  const parsed = z.array(z.string().uuid()).min(1).max(100).safeParse(rawIds);
  if (!db || !parsed.success) redirect("/pedidos?error=estado");
  const ids = [...new Set(parsed.data)].sort();
  try {
    await db.transaction(async (tx) => {
      for (const id of ids) await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`order:${id}`}))`);
      const selected = await tx.select().from(orders).where(inArray(orders.id, ids));
      const received = await tx.select({ orderId: payments.orderId, amount: payments.amount }).from(payments).where(inArray(payments.orderId, ids));
      if (selected.length !== ids.length) throw new Error("Pedido inexistente.");
      for (const order of selected) {
        const paid = received.filter((payment) => payment.orderId === order.id).reduce((sum, payment) => sum.plus(payment.amount), new Decimal(0));
        if (order.stage === "cancelled" || !paid.gt(0) || paid.lt(order.total)) throw new Error("Hay pedidos sin cobrar.");
        const delivery = deliveryAfterPayment(order, order.total, paid, new Date().toISOString());
        if (delivery) await tx.update(orders).set(delivery).where(eq(orders.id, order.id));
      }
    });
  } catch { redirect("/pedidos?error=estado"); }
  revalidatePath("/"); revalidatePath("/pedidos");
  redirect("/pedidos?estado=actualizado#cuentas-por-cobrar");
}

export async function deleteUnpaidOrder(formData: FormData) {
  await requireAuth();
  const parsed = z.object({ orderId: z.string().uuid() }).safeParse(Object.fromEntries(formData.entries()));
  if (!db || !parsed.success) redirect("/pedidos?error=eliminar");

  let hasPayments = false;
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`order:${parsed.data.orderId}`}))`);
      const [order] = await tx.select({ id: orders.id }).from(orders).where(eq(orders.id, parsed.data.orderId)).limit(1);
      if (!order) return;
      const [payment] = await tx.select({ id: payments.id }).from(payments).where(eq(payments.orderId, order.id)).limit(1);
      if (payment) { hasPayments = true; return; }
      await tx.delete(orders).where(eq(orders.id, order.id));
    });
  } catch {
    redirect("/pedidos?error=eliminar");
  }

  if (hasPayments) redirect("/pedidos?error=con-cobros");
  revalidatePath("/");
  revalidatePath("/pedidos");
  redirect("/pedidos?borrado=1");
}
