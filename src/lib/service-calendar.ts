export type ServiceTemplate = {
  id: string;
  name: string;
  amount: string;
  dueDay: number;
  startsOn: string | null;
  repeatMonthly: boolean;
  active: boolean;
  categoryId: string | null;
  paymentMethodId: string | null;
};

export type ServiceOccurrence = {
  id: string;
  recurringExpenseId: string;
  period: string;
  amount: string;
  dueOn: string | null;
  status: "pending" | "paid" | "skipped";
  paidOn: string | null;
};

export type ScheduledService = ServiceTemplate & {
  period: string;
  dueOn: string;
  status: ServiceOccurrence["status"];
  paidOn: string | null;
};

export function monthDueDate(period: string, day: number) {
  const [year, month] = period.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${period}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

export function serviceRunsInMonth(service: ServiceTemplate, period: string) {
  if (!service.active) return false;
  const firstPeriod = service.startsOn?.slice(0, 7);
  if (firstPeriod && period < firstPeriod) return false;
  return service.repeatMonthly || period === firstPeriod;
}

export function serviceMonth(services: ServiceTemplate[], occurrences: ServiceOccurrence[], period: string): ScheduledService[] {
  return services.flatMap<ScheduledService>((service) => {
    const occurrence = occurrences.find((item) => item.recurringExpenseId === service.id && item.period === period);
    // Keep confirmed payments visible even when the service is paused later.
    if (occurrence?.status === "paid") return [{ ...service, period, dueOn: occurrence.dueOn ?? monthDueDate(period, service.dueDay), amount: occurrence.amount, status: occurrence.status, paidOn: occurrence.paidOn }];
    if (occurrence?.status === "skipped" || !serviceRunsInMonth(service, period)) return [];
    return [{ ...service, period, dueOn: occurrence?.dueOn ?? monthDueDate(period, service.dueDay), amount: occurrence?.amount ?? service.amount, status: "pending" as const, paidOn: null }];
  }).sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.name.localeCompare(b.name, "es"));
}

export function shiftMonth(period: string, offset: number) {
  const [year, month] = period.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 7);
}
