"use server";

import { requireAuth } from "@/lib/auth";

import { and, eq, sql } from "drizzle-orm";
import Decimal from "decimal.js";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { businessCashMovements, businessExpenses, businessWithdrawals, categories, clients, paymentMethods, personalTransactions, products, supplierDebts, supplierPayments, suppliers } from "@/lib/db/schema";

const text = (max: number) => z.string().trim().max(max).optional().transform((value) => value || null);
const amountText = z.string().trim().regex(/^\d{1,12}([,.]\d{1,2})?$/).transform((value) => value.replace(",", "."));
const dateText = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => { const date = new Date(`${value}T00:00:00Z`); return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value; });

async function getCategory(name: string) {
  if (!db) throw new Error("Falta configurar Neon.");
  const clean = name.trim().slice(0, 80);
  await db.insert(categories).values({ scope: "business", name: clean }).onConflictDoNothing();
  const [row] = await db.select({ id: categories.id }).from(categories).where(and(eq(categories.scope, "business"), eq(categories.name, clean))).limit(1);
  if (!row) throw new Error("Categoría no disponible.");
  return row.id;
}

async function getPersonalCategory(name: string) {
  if (!db) throw new Error("Falta configurar Neon.");
  const clean = name.trim().slice(0, 80);
  await db.insert(categories).values({ scope: "personal", name: clean }).onConflictDoNothing();
  const [row] = await db.select({ id: categories.id }).from(categories).where(and(eq(categories.scope, "personal"), eq(categories.name, clean))).limit(1);
  if (!row) throw new Error("Categoría personal no disponible.");
  return row.id;
}

async function getPaymentMethod(name: string) {
  if (!db) throw new Error("Falta configurar Neon.");
  const clean = name.trim().slice(0, 80);
  await db.insert(paymentMethods).values({ name: clean }).onConflictDoNothing();
  const [row] = await db.select({ id: paymentMethods.id }).from(paymentMethods).where(eq(paymentMethods.name, clean)).limit(1);
  if (!row) throw new Error("Medio de pago no disponible.");
  return row.id;
}

export async function createProduct(formData: FormData) {
  await requireAuth();
  const parsed = z.object({ name: z.string().trim().min(1).max(120), unit: z.string().trim().min(1).max(40), price: amountText, description: text(500) }).safeParse(Object.fromEntries(formData.entries()));
  if (!db || !parsed.success || new Decimal(parsed.data.price).isNegative()) redirect("/negocio?error=producto");
  try { await db.insert(products).values(parsed.data); } catch { redirect("/negocio?error=producto"); }
  revalidatePath("/negocio"); revalidatePath("/pedidos"); redirect("/negocio?producto=guardado");
}

export async function updateProduct(formData: FormData) {
  await requireAuth();
  const parsed = z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(120), unit: z.string().trim().min(1).max(40), price: amountText, description: text(500), active: z.enum(["true", "false"]) }).safeParse(Object.fromEntries(formData.entries()));
  if (!db || !parsed.success || new Decimal(parsed.data.price).isNegative()) redirect("/negocio?error=producto");
  const { id, active, ...values } = parsed.data;
  try { await db.update(products).set({ ...values, active: active === "true" }).where(eq(products.id, id)); } catch { redirect("/negocio?error=producto"); }
  revalidatePath("/negocio"); revalidatePath("/pedidos"); redirect("/negocio?producto=actualizado");
}

export async function createClient(formData: FormData) {
  await requireAuth();
  const parsed = z.object({ name: z.string().trim().min(1).max(120), phone: text(80), address: text(240), notes: text(500) }).safeParse(Object.fromEntries(formData.entries()));
  if (!db || !parsed.success) redirect("/negocio?error=cliente");
  try { await db.insert(clients).values(parsed.data); } catch { redirect("/negocio?error=cliente"); }
  revalidatePath("/negocio"); revalidatePath("/pedidos"); redirect("/negocio?cliente=guardado");
}

export async function updateClient(formData: FormData) {
  await requireAuth();
  const parsed = z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(120), phone: text(80), address: text(240), notes: text(500), active: z.enum(["true", "false"]) }).safeParse(Object.fromEntries(formData.entries()));
  if (!db || !parsed.success) redirect("/negocio?error=cliente");
  const { id, active, ...values } = parsed.data;
  try { await db.update(clients).set({ ...values, active: active === "true" }).where(eq(clients.id, id)); } catch { redirect("/negocio?error=cliente"); }
  revalidatePath("/negocio"); revalidatePath("/pedidos"); redirect("/negocio?cliente=actualizado");
}

export async function createSupplier(formData: FormData) {
  await requireAuth();
  const parsed = z.object({ name: z.string().trim().min(1).max(120), phone: text(80), description: text(240), notes: text(500) }).safeParse(Object.fromEntries(formData.entries()));
  if (!db || !parsed.success) redirect("/negocio?error=proveedor");
  try { await db.insert(suppliers).values(parsed.data); } catch { redirect("/negocio?error=proveedor"); }
  revalidatePath("/negocio"); redirect("/negocio?proveedor=guardado");
}

export async function createBusinessExpense(formData: FormData) {
  await requireAuth();
  const parsed = z.object({ id: z.string().uuid(), amount: amountText, occurredOn: dateText, category: z.string().trim().min(1).max(80), supplierId: z.union([z.string().uuid(), z.literal("")]).optional().transform((value) => value || null), paymentMethod: z.string().trim().min(1).max(80), description: z.string().trim().min(1).max(240), notes: text(500) }).safeParse(Object.fromEntries(formData.entries()));
  if (!db || !parsed.success || !new Decimal(parsed.data.amount).isPositive()) redirect("/negocio?error=gasto");
  const values = parsed.data;
  try {
    const categoryId = await getCategory(values.category);
    const paymentMethodId = await getPaymentMethod(values.paymentMethod);
    await db.transaction(async (tx) => {
      const cashMovementId = randomUUID();
      await tx.insert(businessCashMovements).values({ id: cashMovementId, direction: "out", amount: values.amount, occurredOn: values.occurredOn, categoryId, paymentMethodId, description: values.description, source: "business_expense", sourceId: values.id });
      await tx.insert(businessExpenses).values({ id: values.id, amount: values.amount, occurredOn: values.occurredOn, categoryId, supplierId: values.supplierId, paymentMethodId, description: values.description, notes: values.notes, cashMovementId });
    });
  } catch { redirect("/negocio?error=gasto"); }
  revalidatePath("/"); revalidatePath("/negocio"); redirect("/negocio?gasto=guardado");
}

export async function createManualBusinessIncome(formData: FormData) {
  await requireAuth();
  const parsed = z.object({ id: z.string().uuid(), amount: amountText, occurredOn: dateText, category: z.string().trim().min(1).max(80), paymentMethod: text(80), description: z.string().trim().min(1).max(240), note: text(500), returnTo: z.enum(["/", "/negocio"]).default("/negocio") }).safeParse(Object.fromEntries(formData.entries()));
  if (!db || !parsed.success || !new Decimal(parsed.data.amount).isPositive()) redirect("/negocio?error=ingreso");
  const values = parsed.data;
  try {
    const categoryId = await getCategory(values.category);
    const paymentMethodId = values.paymentMethod ? await getPaymentMethod(values.paymentMethod) : null;
    await db.insert(businessCashMovements).values({ direction: "in", amount: values.amount, occurredOn: values.occurredOn, categoryId, paymentMethodId, description: values.description, source: "manual_income", sourceId: values.id });
  } catch { redirect("/negocio?error=ingreso"); }
  revalidatePath("/"); revalidatePath("/negocio"); redirect(`${values.returnTo}?ingreso=guardado`);
}

export async function createSupplierDebt(formData: FormData) {
  await requireAuth();
  const parsed = z.object({ id: z.string().uuid(), supplierId: z.string().uuid(), concept: z.string().trim().min(1).max(240), amount: amountText, openedOn: dateText, category: z.string().trim().min(1).max(80), notes: text(500) }).safeParse(Object.fromEntries(formData.entries()));
  if (!db || !parsed.success || !new Decimal(parsed.data.amount).isPositive()) redirect("/negocio?error=deuda-proveedor");
  const values = parsed.data;
  try {
    const [supplier] = await db.select({ id: suppliers.id }).from(suppliers).where(and(eq(suppliers.id, values.supplierId), eq(suppliers.active, true))).limit(1);
    if (!supplier) redirect("/negocio?error=deuda-proveedor");
    const categoryId = await getCategory(values.category);
    await db.transaction(async (tx) => {
      await tx.insert(supplierDebts).values({ id: values.id, supplierId: values.supplierId, concept: values.concept, originalAmount: values.amount, openedOn: values.openedOn, notes: values.notes });
      await tx.insert(businessExpenses).values({ amount: values.amount, occurredOn: values.openedOn, categoryId, supplierId: values.supplierId, description: values.concept, notes: values.notes, cashMovementId: null });
    });
  } catch { redirect("/negocio?error=deuda-proveedor"); }
  revalidatePath("/"); revalidatePath("/negocio"); redirect("/negocio?deuda=proveedor");
}

export async function registerSupplierPayment(formData: FormData) {
  await requireAuth();
  const parsed = z.object({ id: z.string().uuid(), debtId: z.string().uuid(), amount: amountText, paidOn: dateText, paymentMethod: z.string().trim().min(1).max(80), note: text(500) }).safeParse(Object.fromEntries(formData.entries()));
  if (!db || !parsed.success || !new Decimal(parsed.data.amount).isPositive()) redirect("/negocio?error=pago-proveedor");
  const values = parsed.data;
  try {
    const paymentMethodId = await getPaymentMethod(values.paymentMethod);
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`supplier-debt:${values.debtId}`}))`);
      const [debt] = await tx.select({ originalAmount: supplierDebts.originalAmount }).from(supplierDebts).where(eq(supplierDebts.id, values.debtId)).limit(1);
      if (!debt) throw new Error("Deuda no encontrada.");
      const existing = await tx.select({ amount: supplierPayments.amount }).from(supplierPayments).where(eq(supplierPayments.debtId, values.debtId));
      const paid = existing.reduce((sum, row) => sum.plus(row.amount), new Decimal(0));
      if (new Decimal(values.amount).gt(Decimal.max(0, new Decimal(debt.originalAmount).minus(paid)))) throw new Error("El pago supera el saldo pendiente.");
      const cashMovementId = randomUUID();
      await tx.insert(businessCashMovements).values({ id: cashMovementId, direction: "out", amount: values.amount, occurredOn: values.paidOn, paymentMethodId, description: values.note || "Pago a proveedor", source: "supplier_payment", sourceId: values.id });
      await tx.insert(supplierPayments).values({ id: values.id, debtId: values.debtId, amount: values.amount, paidOn: values.paidOn, note: values.note, cashMovementId });
    });
  } catch { redirect("/negocio?error=pago-proveedor"); }
  revalidatePath("/"); revalidatePath("/negocio"); redirect("/negocio?pago-proveedor=guardado");
}

export async function withdrawBusinessFunds(formData: FormData) {
  await requireAuth();
  const parsed = z.object({ id: z.string().uuid(), amount: amountText, occurredOn: dateText, personalCategory: z.string().trim().min(1).max(80), paymentMethod: text(80), note: text(500) }).safeParse(Object.fromEntries(formData.entries()));
  if (!db || !parsed.success || !new Decimal(parsed.data.amount).isPositive()) redirect("/negocio?error=retiro");
  const values = parsed.data;
  try {
    const personalCategoryId = await getPersonalCategory(values.personalCategory);
    const paymentMethodId = values.paymentMethod ? await getPaymentMethod(values.paymentMethod) : null;
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('business-cash'))`);
      const movements = await tx.select({ amount: businessCashMovements.amount, direction: businessCashMovements.direction }).from(businessCashMovements);
      const cash = movements.reduce((sum, movement) => sum.plus(movement.direction === "in" ? movement.amount : new Decimal(movement.amount).negated()), new Decimal(0));
      if (new Decimal(values.amount).gt(Decimal.max(0, cash))) throw new Error("El retiro supera la caja disponible.");
      const movementId = randomUUID();
      const [personalEntry] = await tx.insert(personalTransactions).values({
        type: "income", amount: values.amount, occurredOn: values.occurredOn,
        categoryId: personalCategoryId, paymentMethodId, source: "Retiro del negocio",
        description: values.note || "Retiro del negocio", notes: values.note,
      }).returning({ id: personalTransactions.id });
      await tx.insert(businessCashMovements).values({
        id: movementId, direction: "out", amount: values.amount, occurredOn: values.occurredOn,
        paymentMethodId, description: "Retiro para uso personal", source: "business_withdrawal", sourceId: values.id,
      });
      await tx.insert(businessWithdrawals).values({
        id: values.id, amount: values.amount, occurredOn: values.occurredOn, note: values.note,
        cashMovementId: movementId, personalTransactionId: personalEntry.id,
      });
    });
  } catch { redirect("/negocio?error=retiro"); }
  revalidatePath("/"); revalidatePath("/negocio"); revalidatePath("/personal"); redirect("/negocio?retiro=guardado");
}
