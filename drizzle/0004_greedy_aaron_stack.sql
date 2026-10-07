CREATE TYPE "public"."fund_direction" AS ENUM('add', 'remove');--> statement-breakpoint
ALTER TABLE "emergency_fund_entries" ADD COLUMN "direction" "fund_direction" NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "products_name_idx" ON "products" USING btree ("name");