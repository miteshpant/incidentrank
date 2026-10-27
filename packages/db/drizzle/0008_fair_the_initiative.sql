CREATE TYPE "public"."admin_invite_status" AS ENUM('pending', 'accepted', 'expired', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."admin_role" AS ENUM('owner', 'admin');--> statement-breakpoint
CREATE TYPE "public"."incident_pass_source_type" AS ENUM('promo_invite', 'referral_reward', 'admin_grant');--> statement-breakpoint
CREATE TYPE "public"."incident_pass_status" AS ENUM('available', 'bound', 'consumed', 'expired', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."promotional_invite_status" AS ENUM('created', 'sent', 'redeemed', 'expired', 'revoked', 'send_failed');--> statement-breakpoint
CREATE TYPE "public"."referral_status" AS ENUM('created', 'claimed', 'qualified', 'rewarded', 'rejected', 'expired', 'revoked');--> statement-breakpoint
CREATE TABLE "admin_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid,
	"metadata_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"role" "admin_role" NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by_user_id" uuid NOT NULL,
	"status" "admin_invite_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_by_user_id" uuid,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "admin_role" NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "incident_passes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source_type" "incident_pass_source_type" NOT NULL,
	"source_id" uuid,
	"scenario_id" uuid,
	"status" "incident_pass_status" DEFAULT 'available' NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"bound_at" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promotional_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"normalized_email" text NOT NULL,
	"token_hash" text NOT NULL,
	"campaign" text,
	"status" "promotional_invite_status" DEFAULT 'created' NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"redeemed_by_user_id" uuid,
	"incident_pass_id" uuid,
	"sent_at" timestamp with time zone,
	"opened_at" timestamp with time zone,
	"redeemed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referrals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referral_code_hash" text NOT NULL,
	"referrer_user_id" uuid NOT NULL,
	"referred_user_id" uuid,
	"status" "referral_status" DEFAULT 'created' NOT NULL,
	"referred_incident_pass_id" uuid,
	"qualifying_attempt_id" uuid,
	"reward_incident_pass_id" uuid,
	"clicked_at" timestamp with time zone,
	"claimed_at" timestamp with time zone,
	"qualified_at" timestamp with time zone,
	"rewarded_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "incident_pass_id" uuid;--> statement-breakpoint
ALTER TABLE "admin_audit_events" ADD CONSTRAINT "admin_audit_events_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_invites" ADD CONSTRAINT "admin_invites_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_invites" ADD CONSTRAINT "admin_invites_accepted_by_user_id_users_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_passes" ADD CONSTRAINT "incident_passes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_passes" ADD CONSTRAINT "incident_passes_scenario_id_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotional_invites" ADD CONSTRAINT "promotional_invites_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotional_invites" ADD CONSTRAINT "promotional_invites_redeemed_by_user_id_users_id_fk" FOREIGN KEY ("redeemed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotional_invites" ADD CONSTRAINT "promotional_invites_incident_pass_id_incident_passes_id_fk" FOREIGN KEY ("incident_pass_id") REFERENCES "public"."incident_passes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_user_id_users_id_fk" FOREIGN KEY ("referrer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referred_user_id_users_id_fk" FOREIGN KEY ("referred_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referred_incident_pass_id_incident_passes_id_fk" FOREIGN KEY ("referred_incident_pass_id") REFERENCES "public"."incident_passes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_qualifying_attempt_id_attempts_id_fk" FOREIGN KEY ("qualifying_attempt_id") REFERENCES "public"."attempts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_reward_incident_pass_id_incident_passes_id_fk" FOREIGN KEY ("reward_incident_pass_id") REFERENCES "public"."incident_passes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_audit_events_admin_user_id_idx" ON "admin_audit_events" USING btree ("admin_user_id");--> statement-breakpoint
CREATE INDEX "admin_audit_events_target_idx" ON "admin_audit_events" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "admin_audit_events_created_at_idx" ON "admin_audit_events" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_invites_token_hash_idx" ON "admin_invites" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "admin_invites_status_idx" ON "admin_invites" USING btree ("status");--> statement-breakpoint
CREATE INDEX "admin_users_user_id_idx" ON "admin_users" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_users_active_user_idx" ON "admin_users" USING btree ("user_id") WHERE "admin_users"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "incident_passes_user_id_idx" ON "incident_passes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "incident_passes_status_idx" ON "incident_passes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "incident_passes_scenario_id_idx" ON "incident_passes" USING btree ("scenario_id");--> statement-breakpoint
CREATE UNIQUE INDEX "incident_passes_source_idx" ON "incident_passes" USING btree ("source_type","source_id") WHERE "incident_passes"."source_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "promotional_invites_token_hash_idx" ON "promotional_invites" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "promotional_invites_normalized_email_idx" ON "promotional_invites" USING btree ("normalized_email");--> statement-breakpoint
CREATE INDEX "promotional_invites_status_idx" ON "promotional_invites" USING btree ("status");--> statement-breakpoint
CREATE INDEX "promotional_invites_campaign_idx" ON "promotional_invites" USING btree ("campaign");--> statement-breakpoint
CREATE INDEX "promotional_invites_created_at_idx" ON "promotional_invites" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "promotional_invites_redeemed_by_user_id_idx" ON "promotional_invites" USING btree ("redeemed_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "referrals_code_hash_idx" ON "referrals" USING btree ("referral_code_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "referrals_qualifying_attempt_idx" ON "referrals" USING btree ("qualifying_attempt_id") WHERE "referrals"."qualifying_attempt_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "referrals_reward_pass_idx" ON "referrals" USING btree ("reward_incident_pass_id") WHERE "referrals"."reward_incident_pass_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "referrals_referrer_user_id_idx" ON "referrals" USING btree ("referrer_user_id");--> statement-breakpoint
CREATE INDEX "referrals_referred_user_id_idx" ON "referrals" USING btree ("referred_user_id");--> statement-breakpoint
CREATE INDEX "referrals_status_idx" ON "referrals" USING btree ("status");--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_incident_pass_id_incident_passes_id_fk" FOREIGN KEY ("incident_pass_id") REFERENCES "public"."incident_passes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attempts_incident_pass_id_idx" ON "attempts" USING btree ("incident_pass_id");