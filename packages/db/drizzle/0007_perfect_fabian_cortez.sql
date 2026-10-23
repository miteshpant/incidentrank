CREATE TYPE "public"."attempt_completion_tier" AS ENUM('optimal', 'acceptable');--> statement-breakpoint
CREATE TYPE "public"."attempt_outcome" AS ENUM('resolved', 'failed', 'declared_unstable', 'timed_out');--> statement-breakpoint
CREATE TYPE "public"."attempt_status_v2" AS ENUM('in_progress', 'completed', 'abandoned');--> statement-breakpoint
-- Phase 6.1: split the old 4-value attempt_status enum (in_progress,
-- resolved, failed, abandoned) into a 3-value lifecycle status
-- (attempt_status_v2: in_progress, completed, abandoned) plus a separate
-- outcome column. The old enum's resolved/failed values collapse into
-- status=completed with the same value carried over into the new outcome
-- column; abandoned/in_progress map 1:1 with outcome left null. This
-- cannot be a straight `ALTER COLUMN ... SET DATA TYPE` cast since the
-- value sets don't overlap — add a new column, backfill it from the old
-- one, then swap.
ALTER TABLE "attempts" ADD COLUMN "status_v2" "attempt_status_v2";--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "outcome" "attempt_outcome";--> statement-breakpoint
UPDATE "attempts" SET
  "status_v2" = CASE "status"
    WHEN 'in_progress' THEN 'in_progress'::attempt_status_v2
    WHEN 'abandoned' THEN 'abandoned'::attempt_status_v2
    WHEN 'resolved' THEN 'completed'::attempt_status_v2
    WHEN 'failed' THEN 'completed'::attempt_status_v2
  END,
  "outcome" = CASE "status"
    WHEN 'resolved' THEN 'resolved'::attempt_outcome
    WHEN 'failed' THEN 'failed'::attempt_outcome
    ELSE NULL
  END;--> statement-breakpoint
ALTER TABLE "attempts" ALTER COLUMN "status_v2" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "attempts" ALTER COLUMN "status_v2" SET DEFAULT 'in_progress';--> statement-breakpoint
-- Dropping "status" also drops attempts_user_scenario_status_idx (it
-- references this column) — recreated below against the renamed column.
ALTER TABLE "attempts" DROP COLUMN "status";--> statement-breakpoint
ALTER TABLE "attempts" RENAME COLUMN "status_v2" TO "status";--> statement-breakpoint
CREATE INDEX "attempts_user_scenario_status_idx" ON "attempts" USING btree ("user_id","scenario_id","status");--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "completion_note" text;--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "completion_declared_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "completion_simulation_time_ms" integer;--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "completion_tier" "attempt_completion_tier";--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "finish_request_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "attempts_finish_request_idx" ON "attempts" USING btree ("id","finish_request_id");--> statement-breakpoint
DROP TYPE "public"."attempt_status";
