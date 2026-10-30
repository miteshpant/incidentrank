ALTER TABLE "organization_credit_ledger" ADD COLUMN "amount_total_usd_cents" integer;--> statement-breakpoint
ALTER TABLE "organization_credit_ledger" ADD COLUMN "currency" text;--> statement-breakpoint
ALTER TABLE "organization_credit_ledger" ADD COLUMN "discount_amount_usd_cents" integer;--> statement-breakpoint
ALTER TABLE "paid_entitlements" ADD COLUMN "amount_total_usd_cents" integer;--> statement-breakpoint
ALTER TABLE "paid_entitlements" ADD COLUMN "currency" text;--> statement-breakpoint
ALTER TABLE "paid_entitlements" ADD COLUMN "discount_amount_usd_cents" integer;--> statement-breakpoint
ALTER TABLE "stripe_subscriptions" ADD COLUMN "last_invoice_amount_paid_usd_cents" integer;--> statement-breakpoint
ALTER TABLE "stripe_subscriptions" ADD COLUMN "last_invoice_currency" text;--> statement-breakpoint
ALTER TABLE "stripe_subscriptions" ADD COLUMN "last_invoice_discount_amount_usd_cents" integer;