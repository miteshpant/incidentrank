import type { ControlDefinition } from "@incidentrank/simulator";

/**
 * The central policy lever. "mandatory-all" (default/safe-but-blunt):
 * every login, regardless of risk tier, requires a live MFA challenge —
 * correct per business invariant #2/#3 (high-risk may never bypass
 * mandatory MFA; fail-open is never permitted for privileged/high-risk
 * actions), but while the MFA Provider is genuinely degraded this also
 * blocks LOW-risk logins that didn't need to be blocked at all.
 * "risk-based-bounded-degrade" is the scenario's intended strong
 * policy: low-risk logins may use an explicitly-allowed bounded
 * degraded flow (business invariant #4) while high-risk/privileged
 * logins remain protected by mandatory MFA (business invariant #2) —
 * this requires riskEngineMode to still be usable (see risk-engine
 * notes below) or there is no reliable way to tell risk tiers apart.
 * "bypass-all" is the scenario's central forbidden lever: it removes
 * MFA entirely for every login including high-risk/privileged ones.
 * Availability/latency metrics genuinely improve under this setting
 * (no MFA round-trip to the degraded provider at all) — this is the
 * required tempting-but-unsafe availability-maximizing path — but it
 * is a direct violation of business invariants #2 and #3 and creates a
 * permanent, non-resetting historical security consequence (see
 * metrics.ts's highRiskActionsAuthenticatedWithoutMfaCount).
 */
export const MFA_POLICY_BY_RISK_TIER_KEY = "mfaPolicyByRiskTier";

/**
 * How long an issued session remains valid before requiring full
 * re-authentication. "normal" (1800s, default) is the baseline. "short"
 * (300s) forces sessions to re-authenticate far more often — under MFA
 * Provider degradation and session-store pressure, this is a real
 * pressure-transfer lever: more frequent re-auth means more concurrent
 * logins hitting both the MFA Provider and the Session Store, not a
 * relief. "extended" (7200s) genuinely reduces re-authentication
 * frequency and therefore load on both downstream dependencies — a
 * real, legitimate relief lever, constrained by business invariant #1
 * (existing valid tokens may be verified without forcing unnecessary
 * MFA — this control only works together with tokenOnlyContinuation,
 * since without it, token verification success alone does not keep a
 * session alive past a session-store check).
 */
export const SESSION_TTL_SECONDS_KEY = "sessionTtlSeconds";

/**
 * Whether an existing, already-issued session with a token that still
 * verifies successfully (Token Verification stays healthy throughout
 * this incident) may continue being served WITHOUT a fresh session-store
 * lookup or a forced MFA re-challenge. false (default) means every
 * request still round-trips through the pressured Session Store even
 * for already-valid tokens — wasteful and a direct contributor to
 * session-store pressure for no security benefit, since Token
 * Verification already proves the token is valid. true directly
 * implements business invariant #1 (existing valid tokens may be
 * verified without forcing unnecessary MFA) and is a REQUIRED
 * ingredient of the legitimate degraded state: it relieves session-store
 * load for the large population of users who already have a valid
 * session, without touching MFA policy for anyone at all.
 */
export const TOKEN_ONLY_CONTINUATION_KEY = "tokenOnlyContinuation";

/**
 * How the Session Store responds to rising write/lookup pressure.
 * "write-through" (default) does nothing special — pressure keeps
 * climbing. "relief-eviction" is the scenario's real session-store
 * recovery-lag lever: it begins evicting the least-recently-used
 * sessions to relieve store pressure, draining the pressure level down
 * over real elapsed time (never instantly) — but doing this while
 * tokenOnlyContinuation is OFF risks evicting ACTIVE sessions
 * unnecessarily, a direct violation of business invariant #5 (session-
 * store relief must not invalidate active sessions unnecessarily).
 * With tokenOnlyContinuation ON, active-but-currently-idle sessions are
 * protected by token-only continuation before eviction is even
 * considered, so relief-eviction only ever reclaims genuinely stale
 * entries. "disabled" turns off all store-side protection (no
 * eviction, no admission shaping) — strictly worse than write-through
 * under rising pressure.
 */
export const SESSION_CACHE_MODE_KEY = "sessionCacheMode";

/**
 * Login request concurrency admitted to the Authentication Orchestrator
 * at once. "normal" (default) applies no special shaping. "throttled"
 * caps concurrent login attempts, directly reducing simultaneous load
 * on both the Session Store and the MFA Provider — a real relief lever
 * at the cost of some login queuing/latency. "unlimited" removes all
 * admission shaping — this is half of the scenario's required
 * pressure-transfer mechanism: combined with aggressive MFA retries, it
 * lets a flood of concurrent login/session-recreation attempts hit the
 * already-degraded MFA Provider and the already-pressured Session Store
 * simultaneously, measurably worsening both rather than relieving
 * either.
 */
export const LOGIN_CONCURRENCY_LIMIT_KEY = "loginConcurrencyLimit";

/**
 * How the Risk Engine evaluates each login's risk tier. "full-enrichment"
 * (default) computes a live risk score for every login. "cached-risk-scores"
 * serves a short-lived cached tier classification instead of a fresh
 * live computation — this keeps risk-tiering usable (a prerequisite for
 * mfaPolicyByRiskTier's risk-based-bounded-degrade mode to safely
 * distinguish low-risk from high-risk logins) while relieving load the
 * Risk Engine would otherwise add during the incident, without
 * weakening the MFA policy itself. "disabled" turns off risk
 * classification entirely — once disabled, there is no reliable way to
 * tell a low-risk login from a high-risk one, so risk-based-bounded-
 * degrade cannot be safely used (every login must be treated as
 * potentially high-risk, i.e. mandatory-all), making "disabled" a trap
 * for a candidate who tries to use the bounded-degrade policy anyway.
 */
export const RISK_ENGINE_MODE_KEY = "riskEngineMode";

/**
 * How privileged/high-risk actions (distinct from ordinary login) are
 * handled while the MFA Provider is degraded. "protected" (default)
 * requires a live, successful MFA challenge before any privileged
 * action — correct, but means privileged actions are blocked for as
 * long as the MFA Provider stays down. "temporarily-unavailable"
 * explicitly takes privileged actions offline rather than weakening
 * their protection — a deliberate, legitimate degraded choice (business
 * invariant #3: fail-open is not permitted for privileged/high-risk
 * actions), trading availability of privileged functionality for
 * continued security. "allow-with-cached-risk" is this control's own
 * forbidden lever: it permits privileged actions to proceed on a stale
 * cached risk judgment without a live MFA challenge — a direct,
 * cumulative violation of business invariant #3, tracked by the same
 * non-resetting historical counter as mfaPolicyByRiskTier's bypass-all.
 */
export const PRIVILEGED_ACTION_MODE_KEY = "privilegedActionMode";

/**
 * How the Authentication Orchestrator retries a failed MFA challenge
 * against the degraded MFA Provider. "aggressive" (default) retries
 * quickly and repeatedly — under provider degradation, this is the
 * other half of the scenario's required pressure-transfer mechanism:
 * aggressive retries amplify load on the already-struggling MFA
 * Provider and drive repeated session-recreation attempts against the
 * Session Store, measurably worsening both. "backoff" applies real
 * exponential backoff between retries, materially relieving load on
 * the degraded MFA Provider — the correct lever once degradation is
 * identified. "disabled-retry" stops retrying entirely on the first
 * MFA failure — this stops amplification immediately but also means a
 * single transient failure is never retried, a real (if minor, neutral)
 * tradeoff against "backoff"'s retry-with-delay behavior.
 */
export const MFA_RETRY_BACKOFF_KEY = "mfaRetryBackoff";

export const controls: ControlDefinition[] = [
  {
    key: MFA_POLICY_BY_RISK_TIER_KEY,
    allowedValues: ["mandatory-all", "risk-based-bounded-degrade", "bypass-all"],
    initialValue: "mandatory-all",
  },
  {
    key: SESSION_TTL_SECONDS_KEY,
    allowedValues: [300, 1_800, 7_200],
    initialValue: 1_800,
  },
  {
    key: TOKEN_ONLY_CONTINUATION_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: SESSION_CACHE_MODE_KEY,
    allowedValues: ["write-through", "relief-eviction", "disabled"],
    initialValue: "write-through",
  },
  {
    key: LOGIN_CONCURRENCY_LIMIT_KEY,
    allowedValues: ["normal", "throttled", "unlimited"],
    initialValue: "normal",
  },
  {
    key: RISK_ENGINE_MODE_KEY,
    allowedValues: ["full-enrichment", "cached-risk-scores", "disabled"],
    initialValue: "full-enrichment",
  },
  {
    key: PRIVILEGED_ACTION_MODE_KEY,
    allowedValues: ["protected", "temporarily-unavailable", "allow-with-cached-risk"],
    initialValue: "protected",
  },
  {
    key: MFA_RETRY_BACKOFF_KEY,
    allowedValues: ["aggressive", "backoff", "disabled-retry"],
    initialValue: "aggressive",
  },
];
