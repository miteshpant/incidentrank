import { describe, expect, it } from "vitest";
import { paymentRetryStorm } from "./payment-retry-storm";

describe("paymentRetryStorm", () => {
  it("loads valid scenario metadata", () => {
    expect(paymentRetryStorm.slug).toBe("payment-retry-storm");
    expect(paymentRetryStorm.name).toBe("Payment Retry Storm");
    expect(paymentRetryStorm.difficulty).toBe("senior");
    expect(paymentRetryStorm.estimatedMinutes).toBeGreaterThan(0);
    expect(paymentRetryStorm.description.length).toBeGreaterThan(0);
    expect(paymentRetryStorm.isFree).toBe(true);
  });
});
