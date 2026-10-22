CREATE TYPE "public"."attempt_status" AS ENUM('in_progress', 'resolved', 'failed', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."attempt_type" AS ENUM('practice', 'assessment');--> statement-breakpoint
CREATE TABLE "attempt_action_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action_group_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"control_key" text NOT NULL,
	"previous_value_json" jsonb NOT NULL,
	"new_value_json" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attempt_action_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"elapsed_ms" integer NOT NULL,
	"reasoning" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attempt_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"elapsed_ms" integer NOT NULL,
	"type" text NOT NULL,
	"message" text NOT NULL,
	"metadata_json" jsonb
);
--> statement-breakpoint
CREATE TABLE "attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"scenario_id" uuid NOT NULL,
	"scenario_version" integer NOT NULL,
	"attempt_type" "attempt_type" DEFAULT 'practice' NOT NULL,
	"assessment_id" uuid,
	"status" "attempt_status" DEFAULT 'in_progress' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"incident_started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"score" integer,
	"recovery_score" integer,
	"customer_impact_score" integer,
	"data_integrity_score" integer,
	"reliability_score" integer,
	"cost_efficiency_score" integer,
	"operational_efficiency_score" integer,
	"recovery_time_ms" integer,
	"revenue_loss_usd" real,
	"peak_severity_rank" integer,
	"peak_infrastructure_cost_usd" real,
	"peak_kafka_lag_messages" integer,
	"number_of_configuration_changes" integer,
	"number_of_beneficial_changes" integer,
	"number_of_harmful_changes" integer,
	"final_state_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"version" integer NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_provider_id" text NOT NULL,
	"display_name" text NOT NULL,
	"leaderboard_visible" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attempt_action_changes" ADD CONSTRAINT "attempt_action_changes_action_group_id_attempt_action_groups_id_fk" FOREIGN KEY ("action_group_id") REFERENCES "public"."attempt_action_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_action_groups" ADD CONSTRAINT "attempt_action_groups_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_events" ADD CONSTRAINT "attempt_events_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_scenario_id_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attempt_action_changes_action_group_id_idx" ON "attempt_action_changes" USING btree ("action_group_id");--> statement-breakpoint
CREATE INDEX "attempt_action_groups_attempt_id_idx" ON "attempt_action_groups" USING btree ("attempt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attempt_action_groups_attempt_sequence_idx" ON "attempt_action_groups" USING btree ("attempt_id","sequence");--> statement-breakpoint
CREATE INDEX "attempt_events_attempt_id_idx" ON "attempt_events" USING btree ("attempt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attempt_events_attempt_sequence_idx" ON "attempt_events" USING btree ("attempt_id","sequence");--> statement-breakpoint
CREATE INDEX "attempts_user_id_idx" ON "attempts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "attempts_scenario_id_idx" ON "attempts" USING btree ("scenario_id");--> statement-breakpoint
CREATE INDEX "attempts_user_scenario_status_idx" ON "attempts" USING btree ("user_id","scenario_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "scenarios_slug_version_idx" ON "scenarios" USING btree ("slug","version");--> statement-breakpoint
CREATE UNIQUE INDEX "users_auth_provider_id_idx" ON "users" USING btree ("auth_provider_id");