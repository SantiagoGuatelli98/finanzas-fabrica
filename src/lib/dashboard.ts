import { requireAuth } from "@/lib/auth";
import { and, asc, eq, gte, lt, ne, notInArray, sql } from "drizzle-orm";
import Decimal from "decimal.js";
import { db, databaseReady } from "@/lib/db";
import {
  businessCashMovements,
  businessExpenses,
  categories,
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

function shiftMonth(period: string, offset: number) {
  const [year, month] = period.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 7);
}

function normalizeMonth(period: string | undefined, current: string) {
  if (!period || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return current;
  return period > current ? current : period;
}

function monthBounds(period: string) {
  return { start: `${period}-01`, next: `${shiftMonth(period, 1)}-01` };
}

function monthLabel(period: string, options: Intl.DateTimeFormatOptions = { month: "long", year: "numeric" }) {
  return new Intl.DateTimeFormat("es-AR", { ...options, timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(`${period}-01T12:00:00-03:00`));
}

function total(values: (string | null)[]) {
  return values.reduce((sum, value) => sum.plus(value ?? "0"), new Decimal(0)).toFixed(2);
}

export async function getDashboardData(requestedMonth?: string) {
  await requireAuth();
  const currentMonth = buenosAiresToday().slice(0, 7);
  const selectedMonth = normalizeMonth(requestedMonth, currentMonth);
  const { start, next } = monthBounds(selectedMonth);
  const seriesStart = monthBounds(shiftMonth(selectedMonth, -5)).start;
  if (!databaseReady || !db) return { configured: false as const, selectedMonth, monthLabel: monthLabel(selectedMonth) };

  try {
    const personalMonthKey = sql<string>`to_char(${personalTransactions.occurredOn}, 'YYYY-MM')`;
    const cashMonthKey = sql<string>`to_char(${businessCashMovements.occurredOn}, 'YYYY-MM')`;
    const expenseMonthKey = sql<string>`to_char(${businessExpenses.occurredOn}, 'YYYY-MM')`;
    const orderMonthKey = sql<string>`to_char(${orders.createdOn}, 'YYYY-MM')`;
    const [personalMonthlyRows, cashMonthlyRows, businessExpenseRows, monthlyOrderRows, cashIn, cashOut, debtRows, debtPaymentRows, orderRows, paymentRows, pendingOrders, settingsRows, fundRows, supplierDebtRows, supplierPaymentRows, personalCategories] = await Promise.all([
      db.select({ month: personalMonthKey, type: personalTransactions.type, amount: sql<string>`coalesce(sum(${personalTransactions.amount}), 0)` }).from(personalTransactions)
        .where(and(gte(personalTransactions.occurredOn, seriesStart), lt(personalTransactions.occurredOn, next))).groupBy(personalMonthKey, personalTransactions.type),
      db.select({ month: cashMonthKey, direction: businessCashMovements.direction, amount: sql<string>`coalesce(sum(${businessCashMovements.amount}), 0)` }).from(businessCashMovements)
        .where(and(gte(businessCashMovements.occurredOn, seriesStart), lt(businessCashMovements.occurredOn, next))).groupBy(cashMonthKey, businessCashMovements.direction),
      db.select({ month: expenseMonthKey, amount: sql<string>`coalesce(sum(${businessExpenses.amount}), 0)` }).from(businessExpenses)
        .where(and(gte(businessExpenses.occurredOn, seriesStart), lt(businessExpenses.occurredOn, next))).groupBy(expenseMonthKey),
      db.select({ month: orderMonthKey, amount: sql<string>`coalesce(sum(${orders.total}), 0)` }).from(orders)
        .where(and(ne(orders.stage, "cancelled"), gte(orders.createdOn, seriesStart), lt(orders.createdOn, next))).groupBy(orderMonthKey),
      db.select({ amount: sql<string>`coalesce(sum(${businessCashMovements.amount}), 0)` }).from(businessCashMovements)
        .where(eq(businessCashMovements.direction, "in")),
      db.select({ amount: sql<string>`coalesce(sum(${businessCashMovements.amount}), 0)` }).from(businessCashMovements)
        .where(eq(businessCashMovements.direction, "out")),
      db.select({ id: personalDebts.id, amount: personalDebts.originalAmount }).from(personalDebts).where(sql`${personalDebts.archivedAt} is null`),
      db.select({ id: personalDebtPayments.id, debtId: personalDebtPayments.debtId, amount: personalDebtPayments.amount, paidOn: personalDebtPayments.paidOn }).from(personalDebtPayments),
      db.select({ id: orders.id, total: orders.total, stage: orders.stage, orderNumber: orders.orderNumber, clientName: orders.clientName, deliveryOn: orders.deliveryOn }).from(orders).where(ne(orders.stage, "cancelled")),
      db.select({ orderId: payments.orderId, amount: payments.amount }).from(payments),
      db.select({ id: orders.id }).from(orders).where(notInArray(orders.stage, ["delivered", "cancelled"])),
      db.select({ currency: appSettings.currency, emergencyFundTarget: appSettings.emergencyFundTarget }).from(appSettings).limit(1),
      db.select({ amount: emergencyFundEntries.amount, direction: emergencyFundEntries.direction }).from(emergencyFundEntries),
      db.select({ id: supplierDebts.id, amount: supplierDebts.originalAmount }).from(supplierDebts).where(sql`${supplierDebts.archivedAt} is null`),
      db.select({ debtId: supplierPayments.debtId, amount: supplierPayments.amount }).from(supplierPayments),
      db.select({ id: categories.id, name: categories.name }).from(categories)
        .where(and(eq(categories.scope, "personal"), eq(categories.active, true))).orderBy(asc(categories.name)),
    ]);

    const monthValues = new Map<string, { personalIncome: string; personalExpenses: string; businessCollected: string; businessExpenses: string; businessSold: string }>();
    for (let offset = -5; offset <= 0; offset++) monthValues.set(shiftMonth(selectedMonth, offset), { personalIncome: "0.00", personalExpenses: "0.00", businessCollected: "0.00", businessExpenses: "0.00", businessSold: "0.00" });
    for (const row of personalMonthlyRows) {
      const month = monthValues.get(row.month);
      if (month) month[row.type === "income" ? "personalIncome" : "personalExpenses"] = row.amount;
    }
    for (const row of cashMonthlyRows) {
      const month = monthValues.get(row.month);
      if (month && row.direction === "in") month.businessCollected = row.amount;
    }
    for (const row of businessExpenseRows) { const month = monthValues.get(row.month); if (month) month.businessExpenses = row.amount; }
    for (const row of monthlyOrderRows) { const month = monthValues.get(row.month); if (month) month.businessSold = row.amount; }
    const selectedTotals = monthValues.get(selectedMonth)!;
    const previousMonth = shiftMonth(selectedMonth, -1);
    const previousTotals = monthValues.get(previousMonth)!;
    const monthlySeries = [...monthValues.entries()].map(([month, values]) => ({ month, label: monthLabel(month, { month: "short" }), ...values }));

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
    const scheduledOrders = orderRows.filter((order) => Decimal.max(0, new Decimal(order.total).minus(paidByOrder.get(order.id) ?? 0)).gt(0));
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
      selectedMonth,
      previousMonth,
      monthLabel: monthLabel(selectedMonth),
      previousMonthLabel: monthLabel(previousMonth),
      monthlySeries,
      previousTotals,
      personalIncome: selectedTotals.personalIncome,
      personalExpenses: selectedTotals.personalExpenses,
      personalBalance: new Decimal(selectedTotals.personalIncome).minus(selectedTotals.personalExpenses).toFixed(2),
      outstandingDebt,
      debtPaidMonth,
      debtCancellationPercent,
      emergencyFund,
      emergencyFundTarget: settingsRows[0]?.emergencyFundTarget ?? "0",
      businessCollected: selectedTotals.businessCollected,
      businessExpenses: selectedTotals.businessExpenses,
      businessSold: selectedTotals.businessSold,
      businessCash: cashBalance,
      receivable,
      deliveredReceivable,
      supplierDebtTotal,
      pendingOrders: pendingOrders.length,
      scheduledOrders,
      personalCategories,
      orderCount: orderRows.length,
    };
  } catch {
    return { configured: true as const, error: true as const };
  }
}
