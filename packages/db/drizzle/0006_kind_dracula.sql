DROP INDEX "scenarios_slug_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "scenarios_builtin_slug_idx" ON "scenarios" USING btree ("slug") WHERE "scenarios"."ownership_type" = 'incidentrank';--> statement-breakpoint
CREATE UNIQUE INDEX "scenarios_org_slug_idx" ON "scenarios" USING btree ("organization_id","slug") WHERE "scenarios"."ownership_type" = 'organization';