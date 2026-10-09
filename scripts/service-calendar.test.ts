import assert from "node:assert/strict";
import test from "node:test";
import { monthDueDate, serviceMonth, shiftMonth, type ServiceOccurrence, type ServiceTemplate } from "../src/lib/service-calendar";

const service: ServiceTemplate = { id: "internet", name: "Internet", amount: "20000.00", dueDay: 31, startsOn: "2026-10-31", repeatMonthly: true, active: true, categoryId: null, paymentMethodId: null };
const bill: ServiceOccurrence = { id: "october", recurringExpenseId: service.id, period: "2026-10", dueOn: "2026-10-29", amount: "23000.00", status: "pending", paidOn: null };

test("monthly due dates clamp to the final day, including leap years", () => {
  assert.equal(monthDueDate("2026-02", 31), "2026-02-28");
  assert.equal(monthDueDate("2028-02", 31), "2028-02-29");
  assert.equal(monthDueDate("2026-04", 31), "2026-04-30");
});
test("month navigation crosses year boundaries", () => {
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
});
test("a service starts in its scheduled month and repeats without creating a payment", () => {
  assert.deepEqual(serviceMonth([service], [], "2026-09"), []);
  const [scheduled] = serviceMonth([service], [], "2026-11");
  assert.equal(scheduled.dueOn, "2026-11-30");
  assert.equal(scheduled.status, "pending");
  assert.equal(scheduled.paidOn, null);
});
test("a single bill does not repeat the following month", () => {
  const once = { ...service, repeatMonthly: false };
  assert.equal(serviceMonth([once], [], "2026-10").length, 1);
  assert.equal(serviceMonth([once], [], "2026-11").length, 0);
});
test("an edited bill keeps its own date and amount", () => {
  const [scheduled] = serviceMonth([service], [bill], "2026-10");
  assert.equal(scheduled.dueOn, bill.dueOn);
  assert.equal(scheduled.amount, bill.amount);
});
test("a confirmed payment retains its date and amount after pausing or changing the service", () => {
  const paid = { ...bill, status: "paid" as const, paidOn: "2026-10-28" };
  const [scheduled] = serviceMonth([{ ...service, active: false, amount: "40000.00", dueDay: 5 }], [paid], "2026-10");
  assert.equal(scheduled.amount, "23000.00");
  assert.equal(scheduled.dueOn, "2026-10-29");
  assert.equal(scheduled.status, "paid");
  assert.equal(scheduled.paidOn, "2026-10-28");
  assert.equal(serviceMonth([{ ...service, active: false }], [], "2026-11").length, 0);
});
test("a moved or skipped bill does not reappear as a projected payment", () => {
  assert.deepEqual(serviceMonth([service], [{ ...bill, status: "skipped" }], "2026-10"), []);
});
