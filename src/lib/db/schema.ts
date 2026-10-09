import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const amount = (name: string) => numeric(name, { precision: 14, scale: 2 }).notNull();

export const categoryScope = pgEnum("category_scope", ["personal", "business"]);
export const personalTransactionType = pgEnum("personal_transaction_type", ["income", "expense"]);
export const orderStage = pgEnum("order_stage", ["created", "sent", "confirmed", "delivered", "cancelled"]);
export const recurrenceStatus = pgEnum("recurrence_status", ["pending", "paid", "skipped"]);
export const cashDirection = pgEnum("cash_direction", ["in", "out"]);
export const fundDirection = pgEnum("fund_direction", ["add", "remove"]);

export const appSettings = pgTable("app_settings", {
  id: integer("id").primaryKey().default(1),
  businessName: text("business_name").notNull().default(""),
  businessPhone: text("business_phone"),
  businessAddress: text("business_address"),
  businessLogoUrl: text("business_logo_url"),
  currency: text("currency").notNull().default("ARS"),
  debtTargetDate: date("debt_target_date"),
  emergencyFundTarget: amount("emergency_fund_target").default("0"),
  updatedAt: createdAt(),
});

export const categories = pgTable("categories", {
  id: id(),
  scope: categoryScope("scope").notNull(),
  name: text("name").notNull(),
  color: text("color"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
}, (table) => [uniqueIndex("categories_scope_name_idx").on(table.scope, table.name)]);

export const paymentMethods = pgTable("payment_methods", {
  id: id(),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
}, (table) => [uniqueIndex("payment_methods_name_idx").on(table.name)]);

export const personalTransactions = pgTable("personal_transactions", {
  id: id(),
  type: personalTransactionType("type").notNull(),
  amount: amount("amount"),
  occurredOn: date("occurred_on").notNull(),
  categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
  paymentMethodId: uuid("payment_method_id").references(() => paymentMethods.id, { onDelete: "set null" }),
  source: text("source"),
  description: text("description"),
  notes: text("notes"),
  createdAt: createdAt(),
}, (table) => [index("personal_transactions_date_type_idx").on(table.occurredOn, table.type)]);

export const recurringExpenses = pgTable("recurring_expenses", {
  id: id(),
  name: text("name").notNull(),
  amount: amount("amount"),
  categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
  paymentMethodId: uuid("payment_method_id").references(() => paymentMethods.id, { onDelete: "set null" }),
  dueDay: integer("due_day").notNull(),
  startsOn: date("starts_on"),
  repeatMonthly: boolean("repeat_monthly").notNull().default(true),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const recurringExpenseOccurrences = pgTable("recurring_expense_occurrences", {
  id: id(),
  recurringExpenseId: uuid("recurring_expense_id").notNull().references(() => recurringExpenses.id),
  period: text("period").notNull(),
  amount: amount("amount"),
  status: recurrenceStatus("status").notNull().default("pending"),
  dueOn: date("due_on"),
  paidOn: date("paid_on"),
  personalTransactionId: uuid("personal_transaction_id").references(() => personalTransactions.id),
}, (table) => [uniqueIndex("recurring_occurrence_period_idx").on(table.recurringExpenseId, table.period)]);

export const personalDebts = pgTable("personal_debts", {
  id: id(),
  name: text("name").notNull(),
  creditor: text("creditor"),
  originalAmount: amount("original_amount"),
  openedOn: date("opened_on").notNull(),
  notes: text("notes"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const personalDebtPayments = pgTable("personal_debt_payments", {
  id: id(),
  debtId: uuid("debt_id").notNull().references(() => personalDebts.id),
  amount: amount("amount"),
  paidOn: date("paid_on").notNull(),
  note: text("note"),
  personalTransactionId: uuid("personal_transaction_id").references(() => personalTransactions.id),
  createdAt: createdAt(),
}, (table) => [index("personal_debt_payments_debt_date_idx").on(table.debtId, table.paidOn)]);

export const emergencyFundEntries = pgTable("emergency_fund_entries", {
  id: id(),
  amount: amount("amount"),
  direction: fundDirection("direction").notNull(),
  occurredOn: date("occurred_on").notNull(),
  note: text("note"),
  createdAt: createdAt(),
}, (table) => [index("emergency_fund_entries_date_idx").on(table.occurredOn)]);

export const products = pgTable("products", {
  id: id(),
  name: text("name").notNull(),
  unit: text("unit").notNull(),
  price: amount("price"),
  description: text("description"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
}, (table) => [uniqueIndex("products_name_idx").on(table.name), index("products_active_name_idx").on(table.active, table.name)]);

export const clients = pgTable("clients", {
  id: id(),
  name: text("name").notNull(),
  phone: text("phone"),
  address: text("address"),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
}, (table) => [index("clients_active_name_idx").on(table.active, table.name)]);

export const suppliers = pgTable("suppliers", {
  id: id(),
  name: text("name").notNull(),
  phone: text("phone"),
  description: text("description"),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
}, (table) => [index("suppliers_active_name_idx").on(table.active, table.name)]);

export const orders = pgTable("orders", {
  id: id(),
  orderNumber: serial("order_number").notNull().unique(),
  requestKey: uuid("request_key").notNull().defaultRandom().unique(),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
  clientName: text("client_name").notNull(),
  stage: orderStage("stage").notNull().default("created"),
  createdOn: date("created_on").notNull(),
  deliveryOn: date("delivery_on"),
  subtotal: amount("subtotal"),
  discount: amount("discount").default("0"),
  total: amount("total"),
  notes: text("notes"),
  statusHistory: jsonb("status_history").$type<{ stage: string; at: string }[]>().notNull().default([]),
  createdAt: createdAt(),
}, (table) => [index("orders_client_created_idx").on(table.clientId, table.createdOn), index("orders_stage_created_idx").on(table.stage, table.createdOn)]);

export const orderItems = pgTable("order_items", {
  id: id(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
  productName: text("product_name").notNull(),
  unit: text("unit").notNull(),
  quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
  unitPrice: amount("unit_price"),
  subtotal: amount("subtotal"),
}, (table) => [index("order_items_order_idx").on(table.orderId)]);

export const businessCashMovements = pgTable("business_cash_movements", {
  id: id(),
  direction: cashDirection("direction").notNull(),
  amount: amount("amount"),
  occurredOn: date("occurred_on").notNull(),
  categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
  paymentMethodId: uuid("payment_method_id").references(() => paymentMethods.id, { onDelete: "set null" }),
  description: text("description"),
  source: text("source").notNull(),
  sourceId: uuid("source_id"),
  createdAt: createdAt(),
}, (table) => [index("business_cash_date_direction_idx").on(table.occurredOn, table.direction), uniqueIndex("business_cash_source_idx").on(table.source, table.sourceId)]);

export const payments = pgTable("payments", {
  id: id(),
  orderId: uuid("order_id").notNull().references(() => orders.id),
  amount: amount("amount"),
  receivedOn: date("received_on").notNull(),
  paymentMethodId: uuid("payment_method_id").references(() => paymentMethods.id, { onDelete: "set null" }),
  note: text("note"),
  cashMovementId: uuid("cash_movement_id").references(() => businessCashMovements.id),
  createdAt: createdAt(),
}, (table) => [index("payments_order_date_idx").on(table.orderId, table.receivedOn), uniqueIndex("payments_cash_movement_idx").on(table.cashMovementId)]);

export const businessExpenses = pgTable("business_expenses", {
  id: id(),
  amount: amount("amount"),
  occurredOn: date("occurred_on").notNull(),
  categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
  supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
  paymentMethodId: uuid("payment_method_id").references(() => paymentMethods.id, { onDelete: "set null" }),
  description: text("description").notNull(),
  notes: text("notes"),
  cashMovementId: uuid("cash_movement_id").references(() => businessCashMovements.id),
  createdAt: createdAt(),
}, (table) => [index("business_expenses_date_idx").on(table.occurredOn), index("business_expenses_supplier_idx").on(table.supplierId), uniqueIndex("business_expenses_cash_movement_idx").on(table.cashMovementId)]);

export const supplierDebts = pgTable("supplier_debts", {
  id: id(),
  supplierId: uuid("supplier_id").notNull().references(() => suppliers.id),
  concept: text("concept").notNull(),
  originalAmount: amount("original_amount"),
  openedOn: date("opened_on").notNull(),
  notes: text("notes"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (table) => [index("supplier_debts_supplier_idx").on(table.supplierId)]);

export const supplierPayments = pgTable("supplier_payments", {
  id: id(),
  debtId: uuid("debt_id").notNull().references(() => supplierDebts.id),
  amount: amount("amount"),
  paidOn: date("paid_on").notNull(),
  note: text("note"),
  cashMovementId: uuid("cash_movement_id").references(() => businessCashMovements.id),
  createdAt: createdAt(),
}, (table) => [index("supplier_payments_debt_date_idx").on(table.debtId, table.paidOn), uniqueIndex("supplier_payments_cash_movement_idx").on(table.cashMovementId)]);

export const businessWithdrawals = pgTable("business_withdrawals", {
  id: id(),
  amount: amount("amount"),
  occurredOn: date("occurred_on").notNull(),
  note: text("note"),
  cashMovementId: uuid("cash_movement_id").references(() => businessCashMovements.id),
  personalTransactionId: uuid("personal_transaction_id").references(() => personalTransactions.id),
  createdAt: createdAt(),
}, (table) => [uniqueIndex("business_withdrawals_cash_movement_idx").on(table.cashMovementId), uniqueIndex("business_withdrawals_personal_transaction_idx").on(table.personalTransactionId)]);
