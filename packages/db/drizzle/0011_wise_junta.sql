CREATE TYPE "public"."founding_allocation_status" AS ENUM('reserved', 'issued', 'released', 'expired');--> statement-breakpoint
CREATE TYPE "public"."paid_entitlement_status" AS ENUM('active', 'inactive', 'canceled', 'past_due', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."paid_entitlement_type" AS ENUM('pro', 'founding_lifetime');--> statement-breakpoint
CREATE TYPE "public"."stripe_webhook_processing_status" AS ENUM('received', 'processing', 'processed', 'failed');--> statement-breakpoint
CREATE TABLE "founding_engineer_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slot_number" integer NOT NULL,
	"user_id" uuid,
	"status" "founding_allocation_status" DEFAULT 'released' NOT NULL,
	"stripe_checkout_session_id" text,
	"stripe_payment_intent_id" text,
	"reserved_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"issued_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paid_entitlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"entitlement_type" "paid_entitlement_type" NOT NULL,
	"status" "paid_entitlement_status" NOT NULL,
	"source" text NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"stripe_checkout_session_id" text,
	"stripe_payment_intent_id" text,
	"stripe_price_id" text,
	"starts_at" timestamp with time zone NOT NULL,
	"current_period_end" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"stripe_customer_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"stripe_customer_id" text NOT NULL,
	"stripe_subscription_id" text NOT NULL,
	"stripe_price_id" text NOT NULL,
	"stripe_product_id" text NOT NULL,
	"stripe_status" text NOT NULL,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"canceled_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stripe_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"processed_at" timestamp with time zone,
	"processing_status" "stripe_webhook_processing_status" DEFAULT 'received' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "founding_engineer_allocations" ADD CONSTRAINT "founding_engineer_allocations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paid_entitlements" ADD CONSTRAINT "paid_entitlements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_customers" ADD CONSTRAINT "stripe_customers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_subscriptions" ADD CONSTRAINT "stripe_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "founding_engineer_allocations_slot_number_idx" ON "founding_engineer_allocations" USING btree ("slot_number");--> statement-breakpoint
CREATE INDEX "founding_engineer_allocations_status_idx" ON "founding_engineer_allocations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "founding_engineer_allocations_user_id_idx" ON "founding_engineer_allocations" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "founding_engineer_allocations_one_active_per_user_idx" ON "founding_engineer_allocations" USING btree ("user_id") WHERE "founding_engineer_allocations"."status" IN ('reserved', 'issued');--> statement-breakpoint
CREATE INDEX "paid_entitlements_user_id_idx" ON "paid_entitlements" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "paid_entitlements_status_idx" ON "paid_entitlements" USING btree ("status");--> statement-breakpoint
CREATE INDEX "paid_entitlements_entitlement_type_idx" ON "paid_entitlements" USING btree ("entitlement_type");--> statement-breakpoint
CREATE UNIQUE INDEX "paid_entitlements_one_founding_per_user_idx" ON "paid_entitlements" USING btree ("user_id") WHERE "paid_entitlements"."entitlement_type" = 'founding_lifetime';--> statement-breakpoint
CREATE UNIQUE INDEX "stripe_customers_user_id_idx" ON "stripe_customers" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stripe_customers_stripe_customer_id_idx" ON "stripe_customers" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stripe_subscriptions_subscription_id_idx" ON "stripe_subscriptions" USING btree ("stripe_subscription_id");--> statement-breakpoint
CREATE INDEX "stripe_subscriptions_user_id_idx" ON "stripe_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "stripe_subscriptions_customer_id_idx" ON "stripe_subscriptions" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE INDEX "stripe_subscriptions_status_idx" ON "stripe_subscriptions" USING btree ("stripe_status");--> statement-breakpoint
CREATE UNIQUE INDEX "stripe_webhook_events_event_id_idx" ON "stripe_webhook_events" USING btree ("stripe_event_id");--> statement-breakpoint
CREATE INDEX "stripe_webhook_events_processing_status_idx" ON "stripe_webhook_events" USING btree ("processing_status");