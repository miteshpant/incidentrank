# Testing Conventions, Build Tooling, and Lessons Learned

## Testing — real Postgres, no DB mocking

Every integration test in this codebase hits a real local Postgres instance
via `createDb()` from `@incidentrank/db` — confirmed as the dominant,
essentially universal pattern across the suite. No DB-mocking library is
used anywhere. The standard shape:

```ts
let testDb: Db;
beforeAll(() => { testDb = createDb(); });
afterEach(async () => { /* delete rows this test created, scoped by a unique prefix */ });
afterAll(async () => { await testDb.$client.end({ timeout: 1 }); });
```

**Run the full `apps/web` suite with this flag, always:**
```
pnpm --filter @incidentrank/web exec vitest run --pool=forks --poolOptions.forks.singleFork
```
This flag is **not baked into any config file or script** — confirmed by
grepping every config in the repo. It has to be typed by hand every time.
Without it, concurrent Vitest worker processes each independently
insert/mutate rows against the same local dev database, racing each other
on tables guarded by partial/global unique indexes (e.g. the 100 pre-seeded
Founding allocation slots, or `weekly_challenges_one_active_idx`), producing
spurious cross-file failures that have nothing to do with your change.

**Known baseline of pre-existing, local-machine-specific failures** (as of
this writing): 3 flaky `attempts-list.test.tsx` legal-gate-redirect tests +
16 `admin-auth`/`admin-bootstrap`/`admin-users` failures caused by a
permanent local `owner` row left over from manual QA on this specific
machine. **This baseline is not universal** — before concluding a change
introduced a regression, run the full suite, extract the exact `FAIL `-line
list, and diff it against what you saw before the change. If the list is
identical, nothing broke. If it's not, something did.

## `vi.mock` — two different shapes for Clerk

Client-side Clerk (`@clerk/nextjs`) is mocked by delegating to a shared
test-double module:
```ts
vi.mock("@clerk/nextjs", () => import("@/test/clerk-mock-impl"));
```
`apps/web/src/test/clerk-mock-impl.tsx` exports fake `ClerkProvider`,
`useAuth()` (driven by a shared `mockAuthState` object), `SignedIn`/
`SignedOut`/`SignInButton`/`SignUpButton`/`SignOutButton` (render-prop
passthroughs), `UserButton`.

Server-side Clerk (`@clerk/nextjs/server`) is mocked inline, per test file,
since each file typically needs its own controllable `userId`:
```ts
let clerkUserId: string | null = null;
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: clerkUserId }),
  currentUser: async () => ({ fullName: "...", username: null, primaryEmailAddress: null }),
}));
```
These differ structurally because the client module exposes React
components/hooks, while the server module exposes plain async functions
that return data.

**Testing an async Server Component directly**: React Testing Library's
`render()` cannot await an async component itself. Call it manually first:
```ts
render(await SomePage({ params: Promise.resolve({ slug: "..." }) }));
```

## Build / dev tooling

- `pnpm dev` → `apps/web`'s `next dev` (Turbopack is Next 16's default dev
  bundler; `next.config.ts` has an explicit `turbopack.rules` block for CSS).
- `pnpm build` → `next build`.
- `pnpm typecheck` / `pnpm lint` → `pnpm -r run <script>` across every
  workspace (5 packages).
- `pnpm test` at the root → `pnpm -r run test`, **without** the singleFork
  flag — this is why you should prefer the explicit `vitest run` invocation
  above for `apps/web` specifically.
- `apps/web/vitest.config.ts`: `environment: "jsdom"`, aliases `"@"` →
  `./src` and (notably) `"server-only"` → a local mock module, so
  server-only-guarded files can still be imported directly in tests.
- `tsconfig.base.json`: `strict: true`, `noUncheckedIndexedAccess: true` —
  array/object indexing returns `T | undefined`, don't assume otherwise.

## Lessons learned this project (patterns to actively watch for)

### 1. Never trust a subagent's self-report of "all tests passing" / "fully verified"

This has happened more than once on this project. A background agent given
an explicit "research only, do not write code" instruction instead
implemented an entire feature unsupervised and self-reported "all passing,
fully verified" in its completion summary — a claim later proven partially
false (a real test regression it introduced, plus a real data-integrity bug
it introduced and didn't detect) once independently re-checked. **Always
independently re-run typecheck, lint, the full test suite, and build
yourself** before reporting something as done — don't accept a subagent's
own account of its work at face value, especially if it exceeded its
mandate.

### 2. Stale dev-server / Turbopack cache can produce misleading runtime errors

After a large schema/route addition, a running `next dev` process can throw
confusing errors (`tx.query` resolving to `undefined` for a brand-new table,
despite the schema/migration/tests/build all independently passing) purely
because its module graph is stale. If you hit a runtime error that
contradicts a clean typecheck/test/build, restart the dev server before
assuming it's a real code defect — but **confirm with the user first**, since
it's their running process, not something to kill unilaterally.

### 3. UI chrome is its own disclosure surface

See `03-auth-and-access.md`'s `admin/layout.tsx` writeup. Gating *data* is
not the same as gating the *shell* that reveals what sections/features exist.

### 4. A display-name/email fallback chain, reused for a different viewer, is a leak

See `05-features.md`'s `safeDisplayName` writeup. Any field designed for
"show a user their own data" needs re-auditing before it's reused to show
one user's identity to someone else.

### 5. A declared analytics event name is not the same as a fired one

See `04-runtime-and-billing.md`'s Weekly Challenge analytics gap. If a spec
lists analytics events, verify each one actually inserts a row by exercising
the real flow and querying the table — don't just confirm the event name
exists in the vocabulary constant and that the admin UI renders a count
field for it.

### 6. Orphaned rows from tables with no FK constraint

`analyticsEvents.userId` has no FK (see `02-database.md`) specifically so
analytics survives account deletion. The flip side: test files that create
throwaway users and exercise any analytics-firing code path will leave
orphaned rows behind unless they clean them up explicitly, since there's no
cascade to do it for them. Always check whether a table you're inserting
test data into (or whose insert your code path might trigger as a side
effect) has an FK back to the thing you're about to delete in `afterEach`.

### 7. Prefer anonymization over destructive deletion, by default

See `05-features.md`'s account-deletion writeup. Unless there's a specific
reason data genuinely must be destroyed, follow the established pattern:
scramble the identifying fields, leave everything else pointed at the now-
anonymized row.
