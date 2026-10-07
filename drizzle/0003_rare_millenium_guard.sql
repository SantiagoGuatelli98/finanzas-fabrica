DROP INDEX "business_cash_source_idx";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "request_key" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "business_expenses_cash_movement_idx" ON "business_expenses" USING btree ("cash_movement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "business_withdrawals_cash_movement_idx" ON "business_withdrawals" USING btree ("cash_movement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "business_withdrawals_personal_transaction_idx" ON "business_withdrawals" USING btree ("personal_transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_cash_movement_idx" ON "payments" USING btree ("cash_movement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_payments_cash_movement_idx" ON "supplier_payments" USING btree ("cash_movement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "business_cash_source_idx" ON "business_cash_movements" USING btree ("source","source_id");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_request_key_unique" UNIQUE("request_key");