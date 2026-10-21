import Decimal from "decimal.js";

export type OrderStage = "created" | "sent" | "confirmed" | "delivered" | "cancelled";
export type StageEntry = { stage: string; at: string };

const transitions: Record<OrderStage, OrderStage[]> = {
  created: ["sent", "delivered", "cancelled"],
  sent: ["confirmed", "delivered", "cancelled"],
  confirmed: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

export function canChangeOrderStage(from: OrderStage, to: OrderStage) {
  return transitions[from].includes(to);
}

// Called inside the payment transaction, after the actual payment is saved.
// A deposit must not complete delivery, and a second payment must not add history twice.
export function deliveryAfterPayment(order: { stage: OrderStage; statusHistory: StageEntry[] }, total: Decimal.Value, paid: Decimal.Value, at: string) {
  if (order.stage === "cancelled" || order.stage === "delivered" || new Decimal(paid).lt(total)) return null;
  return { stage: "delivered" as const, statusHistory: [...order.statusHistory, { stage: "delivered", at }] };
}
