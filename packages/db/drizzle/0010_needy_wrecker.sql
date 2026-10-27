ALTER TABLE "referrals" RENAME COLUMN "referral_code_hash" TO "referral_code";--> statement-breakpoint
DROP INDEX "referrals_code_hash_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "referrals_code_idx" ON "referrals" USING btree ("referral_code");