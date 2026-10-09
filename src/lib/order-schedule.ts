export type ScheduledOrder = {
  id: string;
  orderNumber: number;
  clientName: string;
  total: string;
  stage: string;
  deliveryOn: string | null;
};

export function upcomingOrders(orders: ScheduledOrder[], today: string) {
  // Calendar arithmetic starts from today's Buenos Aires date, avoiding host timezone shifts.
  const nextMonday = new Date(`${today}T12:00:00Z`);
  nextMonday.setUTCDate(nextMonday.getUTCDate() + (7 - ((nextMonday.getUTCDay() + 6) % 7)));
  const nextWeek = nextMonday.toISOString().slice(0, 10);
  nextMonday.setUTCDate(nextMonday.getUTCDate() + 7);
  const end = nextMonday.toISOString().slice(0, 10);
  const scheduled = orders.filter((order): order is ScheduledOrder & { deliveryOn: string } =>
    order.deliveryOn !== null && order.deliveryOn >= today && order.deliveryOn < end &&
    order.stage !== "delivered" && order.stage !== "cancelled"
  ).sort((a, b) => a.deliveryOn.localeCompare(b.deliveryOn) || a.orderNumber - b.orderNumber);
  return { scheduled, nextWeek };
}
