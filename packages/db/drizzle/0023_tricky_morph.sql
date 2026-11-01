CREATE TABLE "company_inquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_name" text NOT NULL,
	"name" text NOT NULL,
	"work_email" text NOT NULL,
	"message" text NOT NULL,
	"ip_hash" text,
	"email_sent" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "company_inquiries_created_at_idx" ON "company_inquiries" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "company_inquiries_ip_hash_created_at_idx" ON "company_inquiries" USING btree ("ip_hash","created_at");