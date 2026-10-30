CREATE TYPE "public"."organization_launch_discount_claim_status" AS ENUM('reserved', 'redeemed', 'released', 'expired');--> statement-breakpoint
CREATE TABLE "organization_launch_discount_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"status" "organization_launch_discount_claim_status" DEFAULT 'reserved' NOT NULL,
	"stripe_checkout_session_id" text,
	"reserved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"redeemed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization_launch_discount_claims" ADD CONSTRAINT "organization_launch_discount_claims_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "organization_launch_discount_claims_org_id_idx" ON "organization_launch_discount_claims" USING btree ("organization_id");