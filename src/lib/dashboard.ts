import { requireAuth } from "@/lib/auth";
import { and, eq, gte, lt, ne, notInArray, sql } from "drizzle-orm";
import Decimal from "decimal.js";
import { db, databaseReady } from "@/lib/db";
import {
  businessCashMovements,
  businessExpenses,
  appSettings,
  emergencyFundEntries,
  orders,
  payments,
  personalDebtPayments,
  personalDebts,
  personalTransactions,
  supplierDebts,
  supplierPayments,
} from "@/lib/db/schema";

function buenosAiresToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function monthBounds() {
  const today = buenosAiresToday();
  const start = `${today.slice(0, 7)}-01`;
  const [year, month] = today.slice(0, 7).split("-").map(Number);
  const next = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
  return { start, next };
}

function total(values: (string | null)[]) {
  return values.reduce((sum, value) => sum.plus(value ?? "0"), new Decimal(0)).toFixed(2);
}

export async function getDashboardData() {
  await requireAuth();
  if (!databaseReady || !db) return { configured: false as const };
  const { start, next } = monthBounds();

  try {
    const [personalIncome, personalExpenses, cashIn, cashInMonth, cashOut, businessExpenseMonth, debtRows, debtPaymentRows, orderRows, monthlyOrders, paymentRows, pendingOrders, settingsRows, fundRows, supplierDebtRows, supplierPaymentRows] = await Promise.all([
      db.select({ amount: sql<string>`coalesce(sum(${personalTransactions.amount}), 0)` }).from(personalTransactions)
        .where(and(eq(personalTransactions.type, "income"), gte(personalTransactions.occurredOn, start), lt(personalTransactions.occurredOn, next))),
      db.select({ amount: sql<string>`coalesce(sum(${personalTransactions.amount}), 0)` }).from(personalTransactions)
        .where(and(eq(personalTransactions.type, "expense"), gte(personalTransactions.occurredOn, start), lt(personalTransactions.occurredOn, next))),
      db.select({ amount: sql<string>`coalesce(sum(${businessCashMovements.amount}), 0)` }).from(businessCashMovements)
        .where(eq(businessCashMovements.direction, "in")),
      db.select({ amount: sql<string>`coalesce(sum(${businessCashMovements.amount}), 0)` }).from(businessCashMovements)
        .where(and(eq(businessCashMovements.direction, "in"), gte(businessCashMovements.occurredOn, start), lt(businessCashMovements.occurredOn, next))),
      db.select({ amount: sql<string>`coalesce(sum(${businessCashMovements.amount}), 0)` }).from(businessCashMovements)
        .where(eq(businessCashMovements.direction, "out")),
      db.select({ amount: sql<string>`coalesce(sum(${businessExpenses.amount}), 0)` }).from(businessExpenses)
        .where(and(gte(businessExpenses.occurredOn, start), lt(businessExpenses.occurredOn, next))),
      db.select({ id: personalDebts.id, amount: personalDebts.originalAmount }).from(personalDebts).where(sql`${personalDebts.archivedAt} is null`),
      db.select({ id: personalDebtPayments.id, debtId: personalDebtPayments.debtId, amount: personalDebtPayments.amount, paidOn: personalDebtPayments.paidOn }).from(personalDebtPayments),
      db.select({ id: orders.id, total: orders.total, stage: orders.stage }).from(orders).where(ne(orders.stage, "cancelled")),
      db.select({ total: sql<string>`coalesce(sum(${orders.total}), 0)` }).from(orders)
        .where(and(ne(orders.stage, "cancelled"), gte(orders.createdOn, start), lt(orders.createdOn, next))),
      db.select({ orderId: payments.orderId, amount: payments.amount }).from(payments),
      db.select({ id: orders.id }).from(orders).where(notInArray(orders.stage, ["delivered", "cancelled"])),
      db.select({ currency: appSettings.currency, emergencyFundTarget: appSettings.emergencyFundTarget }).from(appSettings).limit(1),
      db.select({ amount: emergencyFundEntries.amount, direction: emergencyFundEntries.direction }).from(emergencyFundEntries),
      db.select({ id: supplierDebts.id, amount: supplierDebts.originalAmount }).from(supplierDebts).where(sql`${supplierDebts.archivedAt} is null`),
      db.select({ debtId: supplierPayments.debtId, amount: supplierPayments.amount }).from(supplierPayments),
    ]);

    const activeDebtIds = new Set(debtRows.map((row) => row.id));
    const activePayments = debtPaymentRows.filter((row) => activeDebtIds.has(row.debtId));
    const originalDebt = total(debtRows.map((row) => row.amount));
    const paidDebt = total(activePayments.map((row) => row.amount));
    const debtPaidMonth = total(activePayments.filter((row) => row.paidOn >= start && row.paidOn < next).map((row) => row.amount));
    const debtCancellationPercent = new Decimal(originalDebt).isZero() ? "0" : Decimal.min(100, new Decimal(paidDebt).div(originalDebt).times(100)).toDecimalPlaces(0).toFixed();
    const outstandingDebt = Decimal.max(0, new Decimal(originalDebt).minus(paidDebt)).toFixed(2);
    const emergencyFund = fundRows.reduce((sum, entry) => sum.plus(entry.direction === "add" ? entry.amount : new Decimal(entry.amount).negated()), new Decimal(0)).toFixed(2);
    const cashBalance = new Decimal(cashIn[0]?.amount ?? "0").minus(cashOut[0]?.amount ?? "0").toFixed(2);
    const paidByOrder = new Map<string, Decimal>();
    for (const payment of paymentRows) {
      paidByOrder.set(payment.orderId, (paidByOrder.get(payment.orderId) ?? new Decimal(0)).plus(payment.amount));
    }
    const receivable = orderRows.reduce((sum, order) => {
      return sum.plus(Decimal.max(0, new Decimal(order.total).minus(paidByOrder.get(order.id) ?? 0)));
    }, new Decimal(0)).toFixed(2);
    const deliveredReceivable = orderRows.filter((order) => order.stage === "delivered").reduce((sum, order) => {
      return sum.plus(Decimal.max(0, new Decimal(order.total).minus(paidByOrder.get(order.id) ?? 0)));
    }, new Decimal(0)).toFixed(2);
    const activeSupplierDebtIds = new Set(supplierDebtRows.map((row) => row.id));
    const supplierDebtPaid = total(supplierPaymentRows.filter((row) => activeSupplierDebtIds.has(row.debtId)).map((row) => row.amount));
    const supplierDebtTotal = Decimal.max(0, new Decimal(total(supplierDebtRows.map((row) => row.amount))).minus(supplierDebtPaid)).toFixed(2);

    return {
      configured: true as const,
      currency: settingsRows[0]?.currency ?? "ARS",
      personalIncome: personalIncome[0]?.amount ?? "0.00",
      personalExpenses: personalExpenses[0]?.amount ?? "0.00",
      personalBalance: new Decimal(personalIncome[0]?.amount ?? "0").minus(personalExpenses[0]?.amount ?? "0").toFixed(2),
      outstandingDebt,
      debtPaidMonth,
      debtCancellationPercent,
      emergencyFund,
      emergencyFundTarget: settingsRows[0]?.emergencyFundTarget ?? "0",
      businessCollected: cashInMonth[0]?.amount ?? "0.00",
      businessExpenses: businessExpenseMonth[0]?.amount ?? "0.00",
      businessSold: monthlyOrders[0]?.total ?? "0.00",
      businessCash: cashBalance,
      receivable,
      deliveredReceivable,
      supplierDebtTotal,
      pendingOrders: pendingOrders.length,
      orderCount: orderRows.length,
      monthLabel: new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date()),
    };
  } catch {
    return { configured: true as const, error: true as const };
  }
}
