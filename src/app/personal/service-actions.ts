"use server";

import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import Decimal from "decimal.js";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { categories, paymentMethods, personalTransactions, recurringExpenseOccurrences, recurringExpenses } from "@/lib/db/schema";
import { monthDueDate, serviceRunsInMonth } from "@/lib/service-calendar";

export type ServiceActionState = { error?: string; saved?: string; dueOn?: string };

const amountText = z.string().trim().regex(/^\d{1,12}([,.]\d{1,2})?$/).transform((value) => value.replace(",", ".")).refine((value) => new Decimal(value).isPositive());
const periodText = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const dateText = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
});

export async function saveService(_previous: ServiceActionState, formData: FormData): Promise<ServiceActionState> {
  await requireAuth();
  const parsed = z.object({
    id: z.string().uuid(), mode: z.enum(["new", "edit"]),
    editPeriod: z.union([periodText, z.literal("")]),
    name: z.string().trim().min(1).max(120), amount: amountText, dueOn: dateText,
    category: z.string().trim().max(80).transform((value) => value || "Servicios"),
    paymentMethod: z.string().trim().max(80),
    repeatMonthly: z.enum(["true", "false"]), active: z.enum(["true", "false"]),
  }).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "Revisá el nombre, el monto y la fecha de vencimiento." };
  if (!db) return { error: "No se pudo conectar para guardar el servicio." };
  const values = parsed.data;
  const period = values.dueOn.slice(0, 7);

  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`service:${values.id}`}))`);
      const [template] = await tx.select().from(recurringExpenses).where(eq(recurringExpenses.id, values.id)).limit(1);
      if (values.mode === "new" && template) return; // Retried submission with the same request id.
      if (values.mode === "edit" && (!template || !values.editPeriod)) throw new Error("missing");
      const occurrences = await tx.select().from(recurringExpenseOccurrences).where(eq(recurringExpenseOccurrences.recurringExpenseId, values.id));
      const original = occurrences.find((item) => item.period === values.editPeriod);
      const destination = occurrences.find((item) => item.period === period);
      if (original?.status === "paid" || destination?.status === "paid") throw new Error("paid");
      if (values.mode === "edit" && period !== values.editPeriod && destination?.status === "pending") throw new Error("duplicate");

      await tx.insert(categories).values({ scope: "personal", name: values.category }).onConflictDoNothing();
      const [category] = await tx.select({ id: categories.id }).from(categories).where(and(eq(categories.scope, "personal"), eq(categories.name, values.category))).limit(1);
      let paymentMethodId: string | null = null;
      if (values.paymentMethod) {
        await tx.insert(paymentMethods).values({ name: values.paymentMethod }).onConflictDoNothing();
        const [method] = await tx.select({ id: paymentMethods.id }).from(paymentMethods).where(eq(paymentMethods.name, values.paymentMethod)).limit(1);
        paymentMethodId = method.id;
      }
      const repeatMonthly = values.repeatMonthly === "true";
      const startsOn = !repeatMonthly || !template ? values.dueOn : template.startsOn && template.startsOn > values.dueOn ? values.dueOn : template.startsOn;
      const schedule = { name: values.name, amount: values.amount, dueDay: Number(values.dueOn.slice(8)), startsOn, repeatMonthly, active: values.active === "true", categoryId: category.id, paymentMethodId };
      if (template) await tx.update(recurringExpenses).set(schedule).where(eq(recurringExpenses.id, values.id));
      else await tx.insert(recurringExpenses).values({ id: values.id, ...schedule });

      // A moved monthly bill must not reappear on its old date.
      if (values.mode === "edit" && period !== values.editPeriod) {
        if (original) await tx.update(recurringExpenseOccurrences).set({ status: "skipped" }).where(eq(recurringExpenseOccurrences.id, original.id));
        else await tx.insert(recurringExpenseOccurrences).values({ recurringExpenseId: values.id, period: values.editPeriod, amount: values.amount, status: "skipped", dueOn: monthDueDate(values.editPeriod, template!.dueDay) });
      }
      if (destination) await tx.update(recurringExpenseOccurrences).set({ amount: values.amount, dueOn: values.dueOn, status: "pending" }).where(eq(recurringExpenseOccurrences.id, destination.id));
      else await tx.insert(recurringExpenseOccurrences).values({ recurringExpenseId: values.id, period, amount: values.amount, dueOn: values.dueOn, status: "pending" });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "paid") return { error: "Este vencimiento ya está pagado. Los pagos registrados conservan su importe y fecha." };
    if (error instanceof Error && error.message === "duplicate") return { error: "Ese servicio ya tiene un vencimiento en el mes elegido. Editalo desde el calendario." };
    return { error: "No se pudo guardar el servicio. Tus cambios siguen en el formulario para volver a intentar." };
  }
  revalidatePath("/personal");
  return { saved: randomUUID(), dueOn: values.dueOn };
}

export async function payService(_previous: ServiceActionState, formData: FormData): Promise<ServiceActionState> {
  await requireAuth();
  const parsed = z.object({ id: z.string().uuid(), period: periodText, amount: amountText, paidOn: dateText, paymentMethod: z.string().trim().min(1).max(80) }).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "Revisá el importe, la fecha y el medio de pago." };
  if (!db) return { error: "No se pudo conectar para registrar el pago." };
  const values = parsed.data;
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`service:${values.id}`}))`);
      const [template] = await tx.select().from(recurringExpenses).where(eq(recurringExpenses.id, values.id)).limit(1);
      if (!template || !serviceRunsInMonth(template, values.period)) throw new Error("unavailable");
      let [occurrence] = await tx.select().from(recurringExpenseOccurrences).where(and(eq(recurringExpenseOccurrences.recurringExpenseId, values.id), eq(recurringExpenseOccurrences.period, values.period))).limit(1);
      if (occurrence && occurrence.status !== "pending") throw new Error("resolved");
      if (!occurrence) [occurrence] = await tx.insert(recurringExpenseOccurrences).values({ recurringExpenseId: values.id, period: values.period, amount: template.amount, dueOn: monthDueDate(values.period, template.dueDay) }).returning();

      await tx.insert(paymentMethods).values({ name: values.paymentMethod }).onConflictDoNothing();
      const [method] = await tx.select({ id: paymentMethods.id }).from(paymentMethods).where(eq(paymentMethods.name, values.paymentMethod)).limit(1);
      const [transaction] = await tx.insert(personalTransactions).values({ type: "expense", amount: values.amount, occurredOn: values.paidOn, categoryId: template.categoryId, paymentMethodId: method.id, source: "Pago de servicio", description: template.name }).returning({ id: personalTransactions.id });
      await tx.update(recurringExpenseOccurrences).set({ status: "paid", amount: values.amount, paidOn: values.paidOn, personalTransactionId: transaction.id }).where(eq(recurringExpenseOccurrences.id, occurrence.id));
    });
  } catch (error) {
    if (error instanceof Error && error.message === "resolved") return { error: "Ese vencimiento ya se pagó o se omitió. Actualizá la agenda para ver su estado." };
    return { error: "No se pudo registrar el pago. Revisá la conexión y volvé a intentar." };
  }
  revalidatePath("/"); revalidatePath("/personal");
  return { saved: randomUUID() };
}
