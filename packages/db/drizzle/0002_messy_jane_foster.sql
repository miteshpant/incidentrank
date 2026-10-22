ALTER TABLE "assessment_candidates" ADD COLUMN "invite_expires_at" timestamp with time zone;--> statement-breakpoint
UPDATE "assessment_candidates" SET "invite_expires_at" = "invited_at" + INTERVAL '7 days' WHERE "invite_expires_at" IS NULL;--> statement-breakpoint
ALTER TABLE "assessment_candidates" ALTER COLUMN "invite_expires_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "last_simulation_time_ms" integer;