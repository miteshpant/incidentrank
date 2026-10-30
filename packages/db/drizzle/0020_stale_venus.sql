CREATE TYPE "public"."scenario_domain" AS ENUM('Databases & Storage', 'Messaging & Streaming', 'Caching', 'Microservices & Dependencies', 'API & Traffic', 'Distributed Systems', 'Deployments & Reliability', 'Infrastructure & Capacity', 'Security & Identity', 'Data Pipelines');--> statement-breakpoint
CREATE TYPE "public"."scenario_structure" AS ENUM('linear', 'branching', 'parallel', 'cascading');--> statement-breakpoint
ALTER TABLE "scenarios" ADD COLUMN "structure" "scenario_structure" DEFAULT 'linear' NOT NULL;--> statement-breakpoint
ALTER TABLE "scenarios" ADD COLUMN "is_free" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "scenarios" ADD COLUMN "domain" "scenario_domain";--> statement-breakpoint
ALTER TABLE "scenarios" ADD COLUMN "release_week" text;--> statement-breakpoint
ALTER TABLE "scenarios" ADD COLUMN "published_at" timestamp with time zone;