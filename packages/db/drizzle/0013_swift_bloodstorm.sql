CREATE TYPE "public"."organization_credit_transaction_type" AS ENUM('purchase', 'assessment_started', 'admin_adjustment', 'refund', 'reversal', 'expiration');--> statement-breakpoint
CREATE TABLE "organization_credit_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"transaction_type" "organization_credit_transaction_type" NOT NULL,
	"quantity" integer NOT NULL,
	"assessment_id" uuid,
	"attempt_id" uuid,
	"stripe_checkout_session_id" text,
	"stripe_payment_intent_id" text,
	"source_id" uuid,
	"reason" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_stripe_customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"stripe_customer_id" text NOT NULL,
	"billing_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization_credit_ledger" ADD CONSTRAINT "organization_credit_ledger_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_credit_ledger" ADD CONSTRAINT "organization_credit_ledger_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_credit_ledger" ADD CONSTRAINT "organization_credit_ledger_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_credit_ledger" ADD CONSTRAINT "organization_credit_ledger_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_stripe_customers" ADD CONSTRAINT "organization_stripe_customers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "organization_credit_ledger_organization_id_idx" ON "organization_credit_ledger" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "organization_credit_ledger_assessment_id_idx" ON "organization_credit_ledger" USING btree ("assessment_id");--> statement-breakpoint
CREATE INDEX "organization_credit_ledger_attempt_id_idx" ON "organization_credit_ledger" USING btree ("attempt_id");--> statement-breakpoint
CREATE INDEX "organization_credit_ledger_created_at_idx" ON "organization_credit_ledger" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_credit_ledger_purchase_session_idx" ON "organization_credit_ledger" USING btree ("stripe_checkout_session_id") WHERE "organization_credit_ledger"."transaction_type" = 'purchase';--> statement-breakpoint
CREATE UNIQUE INDEX "organization_credit_ledger_consumption_attempt_idx" ON "organization_credit_ledger" USING btree ("attempt_id") WHERE "organization_credit_ledger"."transaction_type" = 'assessment_started';--> statement-breakpoint
CREATE UNIQUE INDEX "organization_stripe_customers_organization_id_idx" ON "organization_stripe_customers" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_stripe_customers_stripe_customer_id_idx" ON "organization_stripe_customers" USING btree ("stripe_customer_id");