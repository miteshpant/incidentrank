import { describe, expect, it } from "vitest";
import {
  PRO_ANNUAL_PRICE_USD_CENTS,
  PRO_MONTHLY_PRICE_USD_CENTS,
  proAnnualMrrUsdCents,
  proMonthlyMrrUsdCents,
  orgCreditPurchaseUsdCentsForQuantity,
} from "./revenue-pricing";

describe("revenue-pricing", () => {
  it("monthly MRR equals the monthly price as-is", () => {
    expect(proMonthlyMrrUsdCents()).toBe(PRO_MONTHLY_PRICE_USD_CENTS);
  });

  it("annual MRR normalizes to price/12, rounded", () => {
    expect(proAnnualMrrUsdCents()).toBe(Math.round(PRO_ANNUAL_PRICE_USD_CENTS / 12));
    expect(proAnnualMrrUsdCents()).toBe(658);
  });

  it("maps quantity=1 to the single-credit price", () => {
    expect(orgCreditPurchaseUsdCentsForQuantity(1)).toBe(5000);
  });

  it("maps quantity=110 to the credit-pack price", () => {
    expect(orgCreditPurchaseUsdCentsForQuantity(110)).toBe(500_000);
  });

  it("returns 0 for an unrecognized quantity", () => {
    expect(orgCreditPurchaseUsdCentsForQuantity(5)).toBe(0);
    expect(orgCreditPurchaseUsdCentsForQuantity(-1)).toBe(0);
  });
});
