import { and, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { appSettings, categories, emergencyFundEntries, paymentMethods, personalDebtPayments, personalDebts, personalTransactions, recurringExpenseOccurrences, recurringExpenses } from "@/lib/db/schema";

export async function getPersonalData() {
  if (!db) return { configured: false as const };
  try {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const start = `${today.slice(0, 7)}-01`;
    const [year, month] = today.slice(0, 7).split("-").map(Number);
    const next = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
    const [transactions, debts, debtPayments, categoryRows, paymentMethodRows, monthlyIncome, monthlyExpenses, settingsRows, fundRows, recurringRows, occurrenceRows] = await Promise.all([
      db.select().from(personalTransactions).orderBy(desc(personalTransactions.occurredOn), desc(personalTransactions.createdAt)).limit(30),
      db.select().from(personalDebts).where(isNull(personalDebts.archivedAt)).orderBy(desc(personalDebts.openedOn)),
      db.select().from(personalDebtPayments),
      db.select({ id: categories.id, name: categories.name }).from(categories).where(and(eq(categories.scope, "personal"), eq(categories.active, true))).orderBy(categories.name),
      db.select({ id: paymentMethods.id, name: paymentMethods.name }).from(paymentMethods).where(eq(paymentMethods.active, true)).orderBy(paymentMethods.name),
      db.select({ amount: sql<string>`coalesce(sum(${personalTransactions.amount}), 0)` }).from(personalTransactions)
        .where(and(eq(personalTransactions.type, "income"), gte(personalTransactions.occurredOn, start), lt(personalTransactions.occurredOn, next))),
      db.select({ amount: sql<string>`coalesce(sum(${personalTransactions.amount}), 0)` }).from(personalTransactions)
        .where(and(eq(personalTransactions.type, "expense"), gte(personalTransactions.occurredOn, start), lt(personalTransactions.occurredOn, next))),
      db.select({ currency: appSettings.currency, emergencyFundTarget: appSettings.emergencyFundTarget, debtTargetDate: appSettings.debtTargetDate }).from(appSettings).limit(1),
      db.select().from(emergencyFundEntries),
      db.select().from(recurringExpenses).orderBy(desc(recurringExpenses.active), recurringExpenses.name),
      db.select().from(recurringExpenseOccurrences).orderBy(desc(recurringExpenseOccurrences.period)).limit(100),
    ]);
    return { configured: true as const, transactions, debts, debtPayments, categories: categoryRows, paymentMethods: paymentMethodRows, monthlyIncome: monthlyIncome[0]?.amount ?? "0", monthlyExpenses: monthlyExpenses[0]?.amount ?? "0", currency: settingsRows[0]?.currency ?? "ARS", emergencyFundTarget: settingsRows[0]?.emergencyFundTarget ?? "0", debtTargetDate: settingsRows[0]?.debtTargetDate ?? null, emergencyFundEntries: fundRows, recurringExpenses: recurringRows, recurringOccurrences: occurrenceRows };
  } catch {
    return { configured: true as const, error: true as const };
  }
}
