ALTER TABLE "attempt_action_groups" ADD COLUMN "client_request_id" text;--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "runtime_anchored_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "runtime_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "attempt_action_groups_attempt_client_request_idx" ON "attempt_action_groups" USING btree ("attempt_id","client_request_id");