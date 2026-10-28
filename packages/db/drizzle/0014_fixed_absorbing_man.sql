CREATE TYPE "public"."rank_band" AS ENUM('developing', 'intermediate', 'senior', 'staff', 'senior_staff', 'principal');--> statement-breakpoint
CREATE TYPE "public"."rank_confidence" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TABLE "rank_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"algorithm_version" text NOT NULL,
	"rank_band" "rank_band" NOT NULL,
	"provisional" boolean NOT NULL,
	"confidence" "rank_confidence" NOT NULL,
	"normalized_score" real NOT NULL,
	"dimension_scores_json" jsonb NOT NULL,
	"skill_scores_json" jsonb NOT NULL,
	"attempts_count" integer NOT NULL,
	"qualifying_attempts" integer NOT NULL,
	"evidence_breadth" integer NOT NULL,
	"distinct_skill_areas" integer NOT NULL,
	"trigger_attempt_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rank_snapshots" ADD CONSTRAINT "rank_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_snapshots" ADD CONSTRAINT "rank_snapshots_trigger_attempt_id_attempts_id_fk" FOREIGN KEY ("trigger_attempt_id") REFERENCES "public"."attempts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rank_snapshots_user_id_created_at_idx" ON "rank_snapshots" USING btree ("user_id","created_at");