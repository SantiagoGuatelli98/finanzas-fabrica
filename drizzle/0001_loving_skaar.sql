CREATE INDEX "business_cash_date_direction_idx" ON "business_cash_movements" USING btree ("occurred_on","direction");--> statement-breakpoint
CREATE INDEX "business_cash_source_idx" ON "business_cash_movements" USING btree ("source","source_id");--> statement-breakpoint
CREATE INDEX "business_expenses_date_idx" ON "business_expenses" USING btree ("occurred_on");--> statement-breakpoint
CREATE INDEX "business_expenses_supplier_idx" ON "business_expenses" USING btree ("supplier_id");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_scope_name_idx" ON "categories" USING btree ("scope","name");--> statement-breakpoint
CREATE INDEX "clients_active_name_idx" ON "clients" USING btree ("active","name");--> statement-breakpoint
CREATE INDEX "emergency_fund_entries_date_idx" ON "emergency_fund_entries" USING btree ("occurred_on");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "orders_client_created_idx" ON "orders" USING btree ("client_id","created_on");--> statement-breakpoint
CREATE INDEX "orders_stage_created_idx" ON "orders" USING btree ("stage","created_on");--> statement-breakpoint
CREATE INDEX "payments_order_date_idx" ON "payments" USING btree ("order_id","received_on");--> statement-breakpoint
CREATE INDEX "personal_debt_payments_debt_date_idx" ON "personal_debt_payments" USING btree ("debt_id","paid_on");--> statement-breakpoint
CREATE INDEX "personal_transactions_date_type_idx" ON "personal_transactions" USING btree ("occurred_on","type");--> statement-breakpoint
CREATE INDEX "products_active_name_idx" ON "products" USING btree ("active","name");--> statement-breakpoint
CREATE UNIQUE INDEX "recurring_occurrence_period_idx" ON "recurring_expense_occurrences" USING btree ("recurring_expense_id","period");--> statement-breakpoint
CREATE INDEX "supplier_debts_supplier_idx" ON "supplier_debts" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "supplier_payments_debt_date_idx" ON "supplier_payments" USING btree ("debt_id","paid_on");--> statement-breakpoint
CREATE INDEX "suppliers_active_name_idx" ON "suppliers" USING btree ("active","name");