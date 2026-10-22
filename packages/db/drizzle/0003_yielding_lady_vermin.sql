CREATE TYPE "public"."scenario_ownership_type" AS ENUM('incidentrank', 'organization');--> statement-breakpoint
CREATE TYPE "public"."scenario_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."scenario_version_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TYPE "public"."scenario_visibility" AS ENUM('public', 'private');--> statement-breakpoint
CREATE TABLE "scenario_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scenario_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"definition_json" jsonb NOT NULL,
	"status" "scenario_version_status" DEFAULT 'draft' NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
DROP INDEX "scenarios_slug_version_idx";--> statement-breakpoint
ALTER TABLE "scenarios" ADD COLUMN "ownership_type" "scenario_ownership_type" DEFAULT 'incidentrank' NOT NULL;--> statement-breakpoint
ALTER TABLE "scenarios" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "scenarios" ADD COLUMN "visibility" "scenario_visibility" DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE "scenarios" ADD COLUMN "status" "scenario_status" DEFAULT 'published' NOT NULL;--> statement-breakpoint
ALTER TABLE "scenarios" ADD COLUMN "created_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "scenarios" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "scenario_versions" ADD CONSTRAINT "scenario_versions_scenario_id_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_versions" ADD CONSTRAINT "scenario_versions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "scenario_versions_scenario_version_idx" ON "scenario_versions" USING btree ("scenario_id","version");--> statement-breakpoint
CREATE INDEX "scenario_versions_scenario_id_idx" ON "scenario_versions" USING btree ("scenario_id");--> statement-breakpoint
ALTER TABLE "scenarios" ADD CONSTRAINT "scenarios_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenarios" ADD CONSTRAINT "scenarios_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "scenarios_slug_idx" ON "scenarios" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "scenarios_organization_id_idx" ON "scenarios" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "scenarios" DROP COLUMN "version";