"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import Decimal from "decimal.js";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { categories, emergencyFundEntries, paymentMethods, personalDebtPayments, personalDebts, personalTransactions, recurringExpenseOccurrences, recurringExpenses } from "@/lib/db/schema";

const amountText = z.string().trim().regex(/^\d{1,12}([,.]\d{1,2})?$/, "Ingresá un monto válido con hasta dos decimales.").transform((value) => value.replace(",", "."));
const dateText = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Seleccioná una fecha válida.").refine((value) => {
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}, "Seleccioná una fecha válida.");
const optionalText = z.string().trim().max(500).optional().transform((value) => value || null);
function currentPeriod() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit" }).format(new Date());
}

async function findOrCreateCategory(name: string) {
  if (!db) throw new Error("Falta configurar DATABASE_URL.");
  const cleanName = name.trim().slice(0, 80);
  await db.insert(categories).values({ scope: "personal", name: cleanName }).onConflictDoNothing();
  const [category] = await db.select({ id: categories.id }).from(categories)
    .where(and(eq(categories.scope, "personal"), eq(categories.name, cleanName))).limit(1);
  if (!category) throw new Error("No se pudo guardar la categoría.");
  return category.id;
}

async function findOrCreatePaymentMethod(name: string) {
  if (!db) throw new Error("Falta configurar DATABASE_URL.");
  const cleanName = name.trim().slice(0, 80);
  await db.insert(paymentMethods).values({ name: cleanName }).onConflictDoNothing();
  const [method] = await db.select({ id: paymentMethods.id }).from(paymentMethods)
    .where(eq(paymentMethods.name, cleanName)).limit(1);
  if (!method) throw new Error("No se pudo guardar el medio de pago.");
  return method.id;
}

export async function createPersonalTransaction(formData: FormData) {
  const parsed = z.object({
    type: z.enum(["income", "expense"]),
    amount: amountText,
    occurredOn: dateText,
    category: z.string().trim().min(1).max(80),
    paymentMethod: z.string().trim().max(80).optional().transform((value) => value || ""),
    source: z.string().trim().max(120).optional().transform((value) => value || null),
    description: optionalText,
    notes: optionalText,
  }).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success || !db) redirect("/personal?error=validacion");

  const values = parsed.data;
  if (new Decimal(values.amount).lte(0)) redirect("/personal?error=monto");
  try {
    const categoryId = await findOrCreateCategory(values.category);
    const paymentMethodId = values.paymentMethod ? await findOrCreatePaymentMethod(values.paymentMethod) : null;
    await db.insert(personalTransactions).values({
      type: values.type,
      amount: values.amount,
      occurredOn: values.occurredOn,
      categoryId,
      paymentMethodId,
      source: values.source,
      description: values.description,
      notes: values.notes,
    });
  } catch {
    redirect("/personal?error=guardar");
  }
  revalidatePath("/");
  revalidatePath("/personal");
  redirect("/personal?guardado=1");
}

export async function createPersonalDebt(formData: FormData) {
  const parsed = z.object({
    name: z.string().trim().min(1).max(120),
    creditor: z.string().trim().max(120).optional().transform((value) => value || null),
    originalAmount: amountText,
    openedOn: dateText,
    notes: optionalText,
  }).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success || !db) redirect("/personal?error=validacion");
  if (new Decimal(parsed.data.originalAmount).lte(0)) redirect("/personal?error=monto");
  try {
    await db.insert(personalDebts).values(parsed.data);
  } catch {
    redirect("/personal?error=guardar");
  }
  revalidatePath("/");
  revalidatePath("/personal");
  redirect("/personal?deuda=guardada");
}

export async function registerDebtPayment(formData: FormData) {
  const parsed = z.object({
    debtId: z.string().uuid(),
    amount: amountText,
    paidOn: dateText,
    category: z.string().trim().min(1).max(80),
    note: optionalText,
  }).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success || !db) redirect("/personal?error=validacion");
  const values = parsed.data;
  const paymentAmount = new Decimal(values.amount);
  if (!paymentAmount.isPositive()) redirect("/personal?error=monto");
  try {
    const expenseCategoryId = await findOrCreateCategory(values.category);
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`personal-debt:${values.debtId}`}))`);
      const [debt] = await tx.select({ originalAmount: personalDebts.originalAmount }).from(personalDebts)
        .where(and(eq(personalDebts.id, values.debtId), isNull(personalDebts.archivedAt))).limit(1);
      if (!debt) throw new Error("Deuda inexistente.");
      const paid = await tx.select({ amount: personalDebtPayments.amount }).from(personalDebtPayments)
        .where(eq(personalDebtPayments.debtId, values.debtId));
      const balance = Decimal.max(0, new Decimal(debt.originalAmount).minus(paid.reduce((sum, row) => sum.plus(row.amount), new Decimal(0))));
      if (paymentAmount.gt(balance)) throw new Error("El pago supera el saldo actual.");
      const [transaction] = await tx.insert(personalTransactions).values({
        type: "expense",
        amount: values.amount,
        occurredOn: values.paidOn,
        categoryId: expenseCategoryId,
        source: "Pago de deuda",
        description: values.note,
      }).returning({ id: personalTransactions.id });
      await tx.insert(personalDebtPayments).values({
        debtId: values.debtId,
        amount: values.amount,
        paidOn: values.paidOn,
        note: values.note,
        personalTransactionId: transaction.id,
      });
    });
  } catch {
    redirect("/personal?error=pago");
  }
  revalidatePath("/");
  revalidatePath("/personal");
  redirect("/personal?pago=guardado");
}

export async function adjustEmergencyFund(formData: FormData) {
  const parsed = z.object({ direction: z.enum(["add", "remove"]), amount: amountText, occurredOn: dateText, note: optionalText }).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success || !db) redirect("/personal?error=fondo");
  const values = parsed.data;
  const value = new Decimal(values.amount);
  if (!value.isPositive()) redirect("/personal?error=fondo");
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('emergency-fund'))`);
      const entries = await tx.select({ amount: emergencyFundEntries.amount, direction: emergencyFundEntries.direction }).from(emergencyFundEntries);
      const balance = entries.reduce((sum, entry) => sum.plus(entry.direction === "add" ? entry.amount : new Decimal(entry.amount).negated()), new Decimal(0));
      if (values.direction === "remove" && value.gt(balance)) throw new Error("El retiro supera el saldo del fondo.");
      await tx.insert(emergencyFundEntries).values(values);
    });
  } catch { redirect("/personal?error=fondo"); }
  revalidatePath("/"); revalidatePath("/personal"); redirect("/personal?fondo=actualizado");
}

export async function createRecurringExpense(formData: FormData) {
  const parsed = z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(120), amount: amountText, category: z.string().trim().min(1).max(80), paymentMethod: z.string().trim().max(80).optional().transform((value) => value || ""), dueDay: z.coerce.number().int().min(1).max(31) }).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success || !db || !new Decimal(parsed.data.amount).isPositive()) redirect("/personal?error=recurrente");
  const values = parsed.data;
  try {
    const categoryId = await findOrCreateCategory(values.category);
    const paymentMethodId = values.paymentMethod ? await findOrCreatePaymentMethod(values.paymentMethod) : null;
    await db.transaction(async (tx) => {
      await tx.insert(recurringExpenses).values({ id: values.id, name: values.name, amount: values.amount, categoryId, paymentMethodId, dueDay: values.dueDay });
      await tx.insert(recurringExpenseOccurrences).values({ recurringExpenseId: values.id, period: currentPeriod(), amount: values.amount, status: "pending" }).onConflictDoNothing();
    });
  } catch { redirect("/personal?error=recurrente"); }
  revalidatePath("/personal"); redirect("/personal?recurrente=guardado");
}

export async function updateRecurringExpense(formData: FormData) {
  const parsed = z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(120), amount: amountText, category: z.string().trim().min(1).max(80), paymentMethod: z.string().trim().max(80).optional().transform((value) => value || ""), dueDay: z.coerce.number().int().min(1).max(31), active: z.enum(["true", "false"]) }).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success || !db || !new Decimal(parsed.data.amount).isPositive()) redirect("/personal?error=recurrente");
  const values = parsed.data;
  try {
    const categoryId = await findOrCreateCategory(values.category);
    const paymentMethodId = values.paymentMethod ? await findOrCreatePaymentMethod(values.paymentMethod) : null;
    await db.update(recurringExpenses).set({ name: values.name, amount: values.amount, categoryId, paymentMethodId, dueDay: values.dueDay, active: values.active === "true" }).where(eq(recurringExpenses.id, values.id));
  } catch { redirect("/personal?error=recurrente"); }
  revalidatePath("/personal"); redirect("/personal?recurrente=actualizado");
}

export async function addRecurringOccurrence(formData: FormData) {
  const parsed = z.object({ recurringExpenseId: z.string().uuid() }).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success || !db) redirect("/personal?error=recurrente");
  try {
    const [template] = await db.select().from(recurringExpenses).where(and(eq(recurringExpenses.id, parsed.data.recurringExpenseId), eq(recurringExpenses.active, true))).limit(1);
    if (!template) redirect("/personal?error=recurrente");
    await db.insert(recurringExpenseOccurrences).values({ recurringExpenseId: template.id, period: currentPeriod(), amount: template.amount, status: "pending" }).onConflictDoNothing();
  } catch { redirect("/personal?error=recurrente"); }
  revalidatePath("/personal"); redirect("/personal?pendiente=creado");
}

export async function markRecurringExpensePaid(formData: FormData) {
  const parsed = z.object({ occurrenceId: z.string().uuid(), amount: amountText, paidOn: dateText, note: optionalText }).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success || !db || !new Decimal(parsed.data.amount).isPositive()) redirect("/personal?error=recurrente");
  const values = parsed.data;
  try {
    await db.transaction(async (tx) => {
      const [occurrence] = await tx.select().from(recurringExpenseOccurrences).where(eq(recurringExpenseOccurrences.id, values.occurrenceId)).limit(1);
      if (!occurrence || occurrence.status !== "pending") throw new Error("Este período ya está resuelto.");
      const [template] = await tx.select().from(recurringExpenses).where(eq(recurringExpenses.id, occurrence.recurringExpenseId)).limit(1);
      if (!template) throw new Error("No se encontró el gasto recurrente.");
      const personalTransactionId = randomUUID();
      const [updated] = await tx.update(recurringExpenseOccurrences).set({ status: "paid", amount: values.amount, paidOn: values.paidOn, personalTransactionId })
        .where(and(eq(recurringExpenseOccurrences.id, values.occurrenceId), eq(recurringExpenseOccurrences.status, "pending"))).returning({ id: recurringExpenseOccurrences.id });
      if (!updated) throw new Error("Este período ya se pagó.");
      await tx.insert(personalTransactions).values({
        id: personalTransactionId, type: "expense", amount: values.amount, occurredOn: values.paidOn,
        categoryId: template.categoryId, paymentMethodId: template.paymentMethodId,
        source: "Gasto recurrente", description: template.name, notes: values.note,
      });
    });
  } catch { redirect("/personal?error=recurrente"); }
  revalidatePath("/"); revalidatePath("/personal"); redirect("/personal?recurrente=pagado");
}
