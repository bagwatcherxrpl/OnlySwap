import { describe, expect, it } from "vitest";
import { isQuoteExpired, prepareSwapSchema, quoteRequestSchema } from "@/lib/validation/swap";

describe("swap validation", () => {
  it("accepts valid quote request", () => {
    const parsed = quoteRequestSchema.safeParse({
      inputAsset: "XRP",
      outputAsset: "USD.rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq",
      inputAmount: "10.25",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects invalid amount precision", () => {
    const parsed = quoteRequestSchema.safeParse({
      inputAsset: "XRP",
      outputAsset: "USD.rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq",
      inputAmount: "1.12345678901234567",
    });
    expect(parsed.success).toBe(false);
  });

  it("detects expired quotes", () => {
    expect(isQuoteExpired(Date.now() - 1)).toBe(true);
  });

  it("accepts valid prepare payload", () => {
    const parsed = prepareSwapSchema.safeParse({
      account: "rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq",
      walletId: "xaman",
      inputAsset: "XRP",
      outputAsset: "USD.rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq",
      inputAmount: "2",
      quoteExpiresAt: Date.now() + 10000,
    });
    expect(parsed.success).toBe(true);
  });
});
