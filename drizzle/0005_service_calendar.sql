ALTER TABLE "recurring_expense_occurrences" ADD COLUMN "due_on" date;--> statement-breakpoint
ALTER TABLE "recurring_expenses" ADD COLUMN "starts_on" date;--> statement-breakpoint
ALTER TABLE "recurring_expenses" ADD COLUMN "repeat_monthly" boolean DEFAULT true NOT NULL;--> statement-breakpoint
-- Freeze existing due dates before services can be edited in the calendar.
UPDATE recurring_expense_occurrences AS occurrence
SET due_on = (occurrence.period || '-01')::date +
  (LEAST(service.due_day, EXTRACT(DAY FROM
    ((occurrence.period || '-01')::date + INTERVAL '1 month' - INTERVAL '1 day'))::integer) - 1)
FROM recurring_expenses AS service
WHERE occurrence.recurring_expense_id = service.id;--> statement-breakpoint
UPDATE recurring_expenses AS service
SET starts_on = COALESCE(
  (SELECT (MIN(occurrence.period) || '-01')::date
   FROM recurring_expense_occurrences AS occurrence
   WHERE occurrence.recurring_expense_id = service.id),
  date_trunc('month', service.created_at)::date
);
