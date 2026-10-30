CREATE TABLE "benchmark_action_facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"benchmark_attempt_fact_id" uuid NOT NULL,
	"sequence_number" integer NOT NULL,
	"action_id" uuid NOT NULL,
	"action_group_id" uuid NOT NULL,
	"action_type" text,
	"elapsed_seconds" integer NOT NULL,
	"system_state_before_json" jsonb,
	"system_state_after_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "benchmark_attempt_facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"benchmark_subject_id" uuid NOT NULL,
	"scenario_id" uuid NOT NULL,
	"scenario_version" integer NOT NULL,
	"scenario_slug" text NOT NULL,
	"difficulty" text NOT NULL,
	"category" text,
	"scoring_version" text NOT NULL,
	"rank_algorithm_version" text NOT NULL,
	"benchmark_projection_version" text NOT NULL,
	"attempt_number_for_scenario" integer NOT NULL,
	"is_first_attempt" boolean NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"duration_seconds" integer NOT NULL,
	"terminal_outcome" "attempt_outcome" NOT NULL,
	"raw_score" real,
	"normalized_score" real,
	"recovery_score" real,
	"customer_impact_score" real,
	"data_integrity_score" real,
	"reliability_score" real,
	"cost_efficiency_score" real,
	"operational_efficiency_score" real,
	"rank_before" "rank_band",
	"rank_after" "rank_band",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "benchmark_projection_failures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"error" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "benchmark_subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "benchmark_action_facts" ADD CONSTRAINT "benchmark_action_facts_benchmark_attempt_fact_id_benchmark_attempt_facts_id_fk" FOREIGN KEY ("benchmark_attempt_fact_id") REFERENCES "public"."benchmark_attempt_facts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmark_attempt_facts" ADD CONSTRAINT "benchmark_attempt_facts_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmark_attempt_facts" ADD CONSTRAINT "benchmark_attempt_facts_benchmark_subject_id_benchmark_subjects_id_fk" FOREIGN KEY ("benchmark_subject_id") REFERENCES "public"."benchmark_subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmark_attempt_facts" ADD CONSTRAINT "benchmark_attempt_facts_scenario_id_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmark_projection_failures" ADD CONSTRAINT "benchmark_projection_failures_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmark_subjects" ADD CONSTRAINT "benchmark_subjects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "benchmark_action_facts_fact_sequence_idx" ON "benchmark_action_facts" USING btree ("benchmark_attempt_fact_id","sequence_number");--> statement-breakpoint
CREATE UNIQUE INDEX "benchmark_attempt_facts_attempt_version_idx" ON "benchmark_attempt_facts" USING btree ("attempt_id","benchmark_projection_version");--> statement-breakpoint
CREATE INDEX "benchmark_attempt_facts_scenario_id_idx" ON "benchmark_attempt_facts" USING btree ("scenario_id");--> statement-breakpoint
CREATE INDEX "benchmark_attempt_facts_subject_id_idx" ON "benchmark_attempt_facts" USING btree ("benchmark_subject_id");--> statement-breakpoint
CREATE INDEX "benchmark_attempt_facts_is_first_attempt_idx" ON "benchmark_attempt_facts" USING btree ("is_first_attempt");--> statement-breakpoint
CREATE INDEX "benchmark_projection_failures_attempt_id_idx" ON "benchmark_projection_failures" USING btree ("attempt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "benchmark_subjects_user_id_idx" ON "benchmark_subjects" USING btree ("user_id");