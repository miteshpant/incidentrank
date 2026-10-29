CREATE TYPE "public"."legal_acceptance_type" AS ENUM('platform_terms', 'privacy_policy', 'candidate_assessment_notice', 'organization_business_terms');--> statement-breakpoint
CREATE TABLE "legal_acceptances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"acceptance_type" "legal_acceptance_type" NOT NULL,
	"terms_version" text,
	"privacy_version" text,
	"assessment_notice_version" text,
	"org_terms_version" text,
	"organization_id" uuid,
	"assessment_id" uuid,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acceptance_source" text DEFAULT 'web' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "legal_acceptances" ADD CONSTRAINT "legal_acceptances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_acceptances" ADD CONSTRAINT "legal_acceptances_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_acceptances" ADD CONSTRAINT "legal_acceptances_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "legal_acceptances_user_id_created_at_idx" ON "legal_acceptances" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "legal_acceptances_user_id_type_idx" ON "legal_acceptances" USING btree ("user_id","acceptance_type");