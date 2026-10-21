/* eslint-disable @typescript-eslint/no-require-imports -- CJS interception isolates server actions from Next and production Neon. */
// Run the real server actions against isolated PostgreSQL (PGlite), never Neon.
require("tsx/cjs");
const assert = require("node:assert/strict");
const { test, before, beforeEach, after } = require("node:test");
const { readFileSync, readdirSync } = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const Module = require("node:module");
const { PGlite } = require("@electric-sql/pglite");
const { drizzle } = require("drizzle-orm/pglite");
const schema = require("../src/lib/db/schema.ts");

const pg = new PGlite();
const isolatedDb = drizzle(pg, { schema });
let authenticated = true;
const originalLoad = Module._load;
Module._load = function (request, ...args) {
  if (request === "@/lib/db") return { db: isolatedDb, databaseReady: true };
  if (request === "@/lib/auth") return { requireAuth: async () => { if (!authenticated) throw new Error("unauthorized"); } };
  if (request === "next/cache") return { revalidatePath() {} };
  if (request === "next/navigation") return { redirect: (location) => { throw Object.assign(new Error("redirect"), { location }); } };
  return originalLoad.call(this, request, ...args);
};
const actions = require("../src/app/pedidos/actions.ts");
const personalActions = require("../src/app/personal/actions.ts");

before(async () => {
  for (const name of readdirSync(path.join(__dirname, "../drizzle")).filter((name) => name.endsWith(".sql")).sort()) {
    await pg.exec(readFileSync(path.join(__dirname, "../drizzle", name), "utf8"));
  }
});
beforeEach(async () => {
  authenticated = true;
  await pg.exec("TRUNCATE orders, business_cash_movements, payment_methods, personal_debts, personal_transactions, categories, clients, products RESTART IDENTITY CASCADE");
});
after(async () => { Module._load = originalLoad; await pg.close(); });

function form(values) { const data = new FormData(); for (const [key, value] of Object.entries(values)) data.set(key, String(value)); return data; }
async function invoke(action, values, expected) {
  await assert.rejects(action(form(values)), (error) => typeof error.location === "string" && error.location.includes(expected));
}
async function order(stage = "created", total = "100.00") {
  const [row] = await isolatedDb.insert(schema.orders).values({ clientName: "Cliente de prueba", createdOn: "2026-10-20", subtotal: total, total, stage, statusHistory: [{ stage, at: "2026-10-20T12:00:00Z" }] }).returning();
  return row;
}
function payment(row, amount = "100.00", paymentId = randomUUID()) {
  return { paymentId, orderId: row.id, amount, receivedOn: "2026-10-20", paymentMethod: "Transferencia", note: "" };
}
async function rows(table) { return (await pg.query(`SELECT * FROM ${table}`)).rows; }

test("full collection delivers a created order and links exactly one cash receipt", async () => {
  const row = await order();
  await invoke(actions.registerOrderPayment, payment(row), "pago=guardado");
  const [saved] = await rows("orders");
  const [paid] = await rows("payments");
  const [cash] = await rows("business_cash_movements");
  assert.equal(saved.stage, "delivered");
  assert.deepEqual(saved.status_history.map((entry) => entry.stage), ["created", "delivered"]);
  assert.equal(paid.amount, "100.00");
  assert.equal(paid.cash_movement_id, cash.id);
  assert.equal(cash.source_id, paid.id);
  assert.equal(cash.direction, "in");
});

test("partial payment keeps delivery open; final cents complete it without duplicating history", async () => {
  const row = await order("confirmed", "100.10");
  await invoke(actions.registerOrderPayment, payment(row, "40.05"), "pago=guardado");
  assert.equal((await rows("orders"))[0].stage, "confirmed");
  await invoke(actions.registerOrderPayment, payment(row, "60.05"), "pago=guardado");
  const [saved] = await rows("orders");
  assert.equal(saved.stage, "delivered");
  assert.equal(saved.status_history.filter((entry) => entry.stage === "delivered").length, 1);
  assert.equal((await rows("payments")).length, 2);
});

test("collecting an already delivered order preserves its delivery history", async () => {
  const row = await order("delivered");
  await invoke(actions.registerOrderPayment, payment(row), "pago=guardado");
  assert.equal((await rows("orders"))[0].status_history.length, 1);
});

test("bulk collection settles each balance and delivers each order, ignoring duplicate selected IDs", async () => {
  const a = await order(); const b = await order("sent", "250.00");
  await invoke(actions.registerOrderPayment, payment(b, "50.00"), "pago=guardado");
  await invoke(actions.registerMultipleOrderPayments, { orderIds: JSON.stringify([a.id, b.id, a.id]), receivedOn: "2026-10-20", paymentMethod: "Efectivo", note: "Cobro conjunto" }, "cantidad=2");
  assert.ok((await rows("orders")).every((row) => row.stage === "delivered"));
  const paid = await rows("payments"); const cash = await rows("business_cash_movements");
  assert.equal(paid.length, 3); assert.equal(cash.length, 3);
  assert.ok(paid.every((entry) => cash.some((movement) => movement.id === entry.cash_movement_id && movement.source_id === entry.id)));
  assert.equal((await pg.query("SELECT sum(amount)::text AS total FROM payments")).rows[0].total, "350.00");
});

test("a cancelled order rejects the entire bulk operation", async () => {
  const a = await order(); const b = await order("cancelled");
  await invoke(actions.registerMultipleOrderPayments, { orderIds: JSON.stringify([a.id, b.id]), receivedOn: "2026-10-20", paymentMethod: "Efectivo" }, "error=pago-multiple");
  assert.equal((await rows("payments")).length, 0);
  assert.equal((await rows("business_cash_movements")).length, 0);
  assert.equal((await rows("orders")).find((row) => row.id === a.id).stage, "created");
});

test("an overpayment is rejected without cash or delivery changes", async () => {
  const row = await order();
  await invoke(actions.registerOrderPayment, payment(row, "100.01"), "error=pago");
  assert.equal((await rows("payments")).length, 0);
  assert.equal((await rows("orders"))[0].stage, "created");
});

test("repeated submission cannot duplicate payment or cash", async () => {
  const row = await order(); const values = payment(row, "50.00");
  await invoke(actions.registerOrderPayment, values, "pago=guardado");
  await invoke(actions.registerOrderPayment, values, "error=pago");
  assert.equal((await rows("payments")).length, 1);
  assert.equal((await rows("business_cash_movements")).length, 1);
  assert.equal((await rows("orders"))[0].stage, "created");
});

test("a delivery failure rolls back both payment and cash", async () => {
  const row = await order();
  await pg.exec("CREATE FUNCTION reject_delivery() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test delivery failure'; END; $$; CREATE TRIGGER reject_delivery BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION reject_delivery()");
  try {
    await invoke(actions.registerOrderPayment, payment(row), "error=pago");
    assert.equal((await rows("payments")).length, 0);
    assert.equal((await rows("business_cash_movements")).length, 0);
    assert.equal((await rows("orders"))[0].stage, "created");
  } finally { await pg.exec("DROP TRIGGER reject_delivery ON orders; DROP FUNCTION reject_delivery()"); }
});

test("marking delivered skips intermediate stages without creating income", async () => {
  const row = await order();
  await invoke(actions.updateOrderStage, { orderId: row.id, stage: "delivered" }, "estado=actualizado");
  assert.equal((await rows("orders"))[0].stage, "delivered");
  assert.equal((await rows("payments")).length, 0);
  assert.equal((await rows("business_cash_movements")).length, 0);
});

test("cancelled orders cannot be delivered", async () => {
  const row = await order("cancelled");
  await invoke(actions.updateOrderStage, { orderId: row.id, stage: "delivered" }, "error=estado");
  assert.equal((await rows("orders"))[0].stage, "cancelled");
});

test("creating a paid order saves payment, delivery and cash together", async () => {
  const [client] = await isolatedDb.insert(schema.clients).values({ name: "Cliente" }).returning();
  const [product] = await isolatedDb.insert(schema.products).values({ name: "Producto", unit: "docena", price: "100.00" }).returning();
  await invoke(actions.createOrder, { clientId: client.id, createdOn: "2026-10-20", deliveryOn: "", discount: "0", requestKey: randomUUID(), saveMode: "paid", paymentMethod: "Efectivo", receivedOn: "2026-10-20", itemsJson: JSON.stringify([{ productId: product.id, quantity: "1", unitPrice: "100.00" }]) }, "creado=cobrado");
  assert.equal((await rows("orders"))[0].stage, "delivered");
  assert.equal((await rows("payments")).length, 1);
  assert.equal((await rows("business_cash_movements")).length, 1);
});

test("correcting a historic debt payment debits cash once without duplicating personal expense", async () => {
  const [debt] = await isolatedDb.insert(schema.personalDebts).values({ name: "Tarjeta de prueba", originalAmount: "327632.00", openedOn: "2026-10-01" }).returning();
  await invoke(personalActions.registerDebtPayment, { debtId: debt.id, amount: "327632", paidOn: "2026-10-12", category: "Personal", paymentMethod: "Billetera virtual", paidFrom: "personal" }, "pago=guardado");
  const [paid] = await rows("personal_debt_payments");
  const correction = { paymentId: paid.id, paidFrom: "business", paymentMethod: "Billetera virtual" };
  await invoke(personalActions.updateDebtPaymentSource, correction, "pago=actualizado");
  await invoke(personalActions.updateDebtPaymentSource, correction, "pago=actualizado");
  assert.equal((await rows("personal_transactions")).length, 1);
  assert.equal((await rows("personal_debt_payments")).length, 1);
  const cash = await rows("business_cash_movements");
  assert.equal(cash.length, 1); assert.equal(cash[0].direction, "out"); assert.equal(cash[0].amount, "327632.00");
});

test("actions reject unauthenticated writes", async () => {
  const row = await order(); authenticated = false;
  await assert.rejects(actions.registerOrderPayment(form(payment(row))), /unauthorized/);
  assert.equal((await rows("payments")).length, 0);
});

test("historic paid orders can be delivered together without collecting again", async () => {
  const a = await order(); const b = await order("sent");
  await invoke(actions.registerOrderPayment, payment(a), "pago=guardado");
  await invoke(actions.registerOrderPayment, payment(b), "pago=guardado");
  await pg.exec("UPDATE orders SET stage = 'created', status_history = '[{\"stage\":\"created\",\"at\":\"2026-10-20T12:00:00Z\"}]'");
  const values = { orderIds: JSON.stringify([a.id, b.id]) };
  await invoke(actions.deliverPaidOrders, values, "estado=actualizado");
  await invoke(actions.deliverPaidOrders, values, "estado=actualizado");
  assert.ok((await rows("orders")).every((row) => row.stage === "delivered" && row.status_history.length === 2));
  assert.equal((await rows("payments")).length, 2);
  assert.equal((await rows("business_cash_movements")).length, 2);
});

test("historic batch checks current balances and rejects an unpaid selection", async () => {
  const a = await order(); const b = await order();
  await invoke(actions.registerOrderPayment, payment(a), "pago=guardado");
  await pg.exec("UPDATE orders SET stage = 'created'");
  await invoke(actions.deliverPaidOrders, { orderIds: JSON.stringify([a.id, b.id]) }, "error=estado");
  assert.ok((await rows("orders")).every((row) => row.stage === "created"));
  assert.equal((await rows("payments")).length, 1);
});
