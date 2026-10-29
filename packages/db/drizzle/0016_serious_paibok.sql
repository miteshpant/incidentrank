CREATE TYPE "public"."privacy_request_status" AS ENUM('pending', 'completed');--> statement-breakpoint
CREATE TYPE "public"."privacy_request_type" AS ENUM('access', 'correction', 'deletion', 'other');--> statement-breakpoint
CREATE TABLE "privacy_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"request_type" "privacy_request_type" NOT NULL,
	"status" "privacy_request_status" DEFAULT 'pending' NOT NULL,
	"notes" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "privacy_requests_user_id_requested_at_idx" ON "privacy_requests" USING btree ("user_id","requested_at");--> statement-breakpoint
CREATE INDEX "privacy_requests_status_idx" ON "privacy_requests" USING btree ("status");