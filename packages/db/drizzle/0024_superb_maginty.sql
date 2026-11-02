CREATE TABLE "challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"scenario_id" uuid NOT NULL,
	"challenger_user_id" uuid NOT NULL,
	"challenger_attempt_id" uuid NOT NULL,
	"challenged_user_id" uuid,
	"challenged_attempt_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "weekly_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scenario_id" uuid NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "weekly_challenge_id" uuid;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_scenario_id_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_challenger_user_id_users_id_fk" FOREIGN KEY ("challenger_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_challenger_attempt_id_attempts_id_fk" FOREIGN KEY ("challenger_attempt_id") REFERENCES "public"."attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_challenged_user_id_users_id_fk" FOREIGN KEY ("challenged_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_challenged_attempt_id_attempts_id_fk" FOREIGN KEY ("challenged_attempt_id") REFERENCES "public"."attempts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_challenges" ADD CONSTRAINT "weekly_challenges_scenario_id_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_challenges" ADD CONSTRAINT "weekly_challenges_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "challenges_token_hash_idx" ON "challenges" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "challenges_challenger_user_id_idx" ON "challenges" USING btree ("challenger_user_id");--> statement-breakpoint
CREATE INDEX "challenges_challenger_attempt_id_idx" ON "challenges" USING btree ("challenger_attempt_id");--> statement-breakpoint
CREATE INDEX "weekly_challenges_active_idx" ON "weekly_challenges" USING btree ("active");--> statement-breakpoint
CREATE INDEX "weekly_challenges_scenario_id_idx" ON "weekly_challenges" USING btree ("scenario_id");--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_challenges_one_active_idx" ON "weekly_challenges" USING btree ("active") WHERE "weekly_challenges"."active" = true;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_weekly_challenge_id_weekly_challenges_id_fk" FOREIGN KEY ("weekly_challenge_id") REFERENCES "public"."weekly_challenges"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attempts_weekly_challenge_id_idx" ON "attempts" USING btree ("weekly_challenge_id");