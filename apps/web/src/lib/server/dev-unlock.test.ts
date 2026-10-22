import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isDevUnlockPaidScenariosRequest } from "./dev-unlock";

/**
 * The dev-only paid-scenario unlock must require ALL of: non-production
 * NODE_ENV, the explicit opt-in env var, and a request that actually
 * arrived on localhost — so an env var set by mistake on a deployed
 * environment still cannot unlock anything there.
 */
describe("isDevUnlockPaidScenariosRequest", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEV_UNLOCK_PAID_SCENARIOS", "true");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("unlocks for localhost with port when flag set and non-production", () => {
    expect(isDevUnlockPaidScenariosRequest("localhost:3000")).toBe(true);
  });

  it("unlocks for 127.0.0.1", () => {
    expect(isDevUnlockPaidScenariosRequest("127.0.0.1:3000")).toBe(true);
  });

  it("unlocks for bracketed IPv6 localhost [::1]:3000", () => {
    expect(isDevUnlockPaidScenariosRequest("[::1]:3000")).toBe(true);
  });

  it("unlocks for bare IPv6 localhost ::1 with no port", () => {
    expect(isDevUnlockPaidScenariosRequest("::1")).toBe(true);
  });

  it("does not unlock for a deployed host even when flag is set", () => {
    expect(isDevUnlockPaidScenariosRequest("app.incidentrank.com")).toBe(false);
  });

  it("does not unlock for a staging host even when flag is set", () => {
    expect(isDevUnlockPaidScenariosRequest("staging.incidentrank.com")).toBe(false);
  });

  it("does not unlock when host header is missing", () => {
    expect(isDevUnlockPaidScenariosRequest(null)).toBe(false);
  });

  it("does not unlock when NODE_ENV is production, even on localhost", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(isDevUnlockPaidScenariosRequest("localhost:3000")).toBe(false);
  });

  it("does not unlock when the flag is unset, even on localhost", () => {
    vi.stubEnv("DEV_UNLOCK_PAID_SCENARIOS", undefined);
    expect(isDevUnlockPaidScenariosRequest("localhost:3000")).toBe(false);
  });

  it("does not unlock when the flag is set to a non-true value", () => {
    vi.stubEnv("DEV_UNLOCK_PAID_SCENARIOS", "1");
    expect(isDevUnlockPaidScenariosRequest("localhost:3000")).toBe(false);
  });
});
