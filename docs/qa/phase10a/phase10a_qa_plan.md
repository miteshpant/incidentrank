# Phase 10A Browser QA Plan — Platform Admin & Organization Governance

Real browser QA against the local dev environment, per docs/implementation_plan/phase10a.md §68's 18 required stories. Mirrors the Phase 8/9 QA workspace precedent: live `claude-in-chrome` sessions, DB state verified after every claim (never trusting the UI alone), real Clerk dev-mode identities, real Resend email sending.

## Environment

- Local dev server (`pnpm dev`), `apps/web/.env.local` with `ADMIN_PORTAL_ENABLED=true`, `TRANSACTIONAL_EMAILS_ENABLED=true`, real `RESEND_API_KEY`.
- Clerk dev-mode sign-ups: `+clerk_test@example.com` / `+clerk_test@incidentrank.com` convention, fixed test OTP `424242`, email+password sign-up (this Clerk instance requires a password, not OTP-only sign-in).
- Platform-admin grants: sandbox cannot self-grant `admin_users` rows (blocked by the privilege-escalation guard), so the user ran one `INSERT` command to grant `qa-phase10a-platformadmin+clerk_test@example.com` a plain `admin` row — same workaround established in Phase 8/9 QA.
- `mpant@incidentrank.com`-specific stories (QA-16/17): Clerk test mode cannot authenticate that exact literal, and `bootstrapOwnerIfEligible`'s match is exact-string, never normalized. Per phase8loc.md's explicit allowance, temporarily overrode `INITIAL_ADMIN_EMAIL` to `mpant-phase10aqa+clerk_test@incidentrank.com` in `.env.local`, restarted the dev server, ran QA-16/17, then reverted the override and restarted again before finishing the session. Never committed.
- Real test identities created this session: `qa-phase10a-ordinary`, `qa-phase10a-platformadmin`, `qa-phase10a-owner1`, `qa-phase10a-owner1b`, `qa-phase10a-admin1`, `qa-phase10a-owner2`, `qa-phase10a-candidate` (all `+clerk_test@example.com`), plus `mpant-phase10aqa+clerk_test@incidentrank.com` and `qa-phase10a-newadmin+clerk_test@incidentrank.com` for the platform-owner stories.
- Two organizations created live: "Acme QA Phase10A" (`acme-qa-phase10a`) and "Globex QA Phase10A" (`globex-qa-phase10a`), used throughout for same-org and cross-org stories.

## Story-to-evidence mapping

All 18 required stories were executed live in this single session, in dependency order (org creation → owner acceptance → additional owners → suspension → candidate continuity → reactivation → isolation → platform-owner stories → audit logs). See `user_story_matrix.md` for the per-story pass/fail table and `execution_log.md` for detailed steps, API responses, and DB verification for each story.
