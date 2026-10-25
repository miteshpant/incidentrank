import type { ControlDefinition } from "@incidentrank/simulator";

/**
 * The real correctness fix: the service requires a client-supplied
 * idempotency key on every order-creation request and checks it against
 * recently-seen keys BEFORE executing the side effect (creating the order
 * charge). A retried request carrying the same key as its original is
 * recognized and its side effect is skipped — the client gets a response,
 * but the order is created at most once. This is the only control that
 * stops duplicate side effects regardless of how aggressively the client
 * or gateway retry.
 */
export const IDEMPOTENCY_KEY_HANDLING_KEY = "idempotencyKeyHandling";

/**
 * How many times the CLIENT will retry a request it believes may not have
 * succeeded (timeout or no response) before giving up. Raising this "to
 * ensure the request eventually succeeds" sounds protective, but every
 * additional retry is another copy of the same logical request reaching
 * the service — without key checking, that is another copy of the side
 * effect.
 */
export const CLIENT_RETRY_COUNT_KEY = "clientRetryCount";

/**
 * How long the CLIENT waits for a response before deciding the first
 * attempt is lost and retrying. Shortening this while the service is
 * already slow makes the client give up and retry BEFORE the original
 * request's response (and its already-executed side effect) comes back —
 * the client has no way to know the first attempt actually succeeded, so
 * a shorter timeout fires more retries against in-flight, not-yet-failed
 * requests, not fewer.
 */
export const CLIENT_TIMEOUT_MS_KEY = "clientTimeoutMs";

/**
 * Whether the API GATEWAY itself retries a request on a 5xx/timeout
 * response from the service, independent of whatever the client is also
 * doing. When enabled, the gateway can produce its own additional copy of
 * the same logical request without the client's knowledge or
 * involvement — a second, independent source of duplication layered on
 * top of client-side retries.
 */
export const GATEWAY_RETRY_ENABLED_KEY = "gatewayRetryEnabled";

/**
 * A short-lived window (in seconds) during which the gateway recognizes
 * an incoming request as a probable retry of one it already forwarded
 * very recently (by client-supplied idempotency key) and coalesces it
 * instead of forwarding a second copy downstream. This is gateway-level
 * request deduplication — a second, complementary layer to the service's
 * own idempotency-key check, not a replacement for it: it only catches
 * retries that arrive while the window is still open.
 */
export const REQUEST_DEDUPLICATION_WINDOW_SECONDS_KEY = "requestDeduplicationWindowSeconds";

/**
 * How the service wraps "check the idempotency key" and "execute the side
 * effect" together. "none" performs them as two separate steps, leaving a
 * race window in which two concurrently-arriving copies of the same
 * retried request can both pass the key check before either one has
 * recorded its key — both then execute the side effect. "atomic" performs
 * the check-and-record and the side effect as a single transaction, so
 * only one concurrent copy can ever win the race.
 */
export const TRANSACTION_HANDLING_KEY = "transactionHandling";

export const controls: ControlDefinition[] = [
  {
    key: IDEMPOTENCY_KEY_HANDLING_KEY,
    allowedValues: ["disabled", "logged-only", "enforced"],
    initialValue: "disabled",
  },
  {
    key: CLIENT_RETRY_COUNT_KEY,
    allowedValues: [1, 3, 6, 10],
    initialValue: 1,
  },
  {
    key: CLIENT_TIMEOUT_MS_KEY,
    allowedValues: [500, 1_500, 4_000, 8_000],
    initialValue: 4_000,
  },
  {
    key: GATEWAY_RETRY_ENABLED_KEY,
    allowedValues: [false, true],
    initialValue: true,
  },
  {
    key: REQUEST_DEDUPLICATION_WINDOW_SECONDS_KEY,
    allowedValues: [0, 10, 30, 120],
    initialValue: 0,
  },
  {
    key: TRANSACTION_HANDLING_KEY,
    allowedValues: ["none", "atomic"],
    initialValue: "none",
  },
];
