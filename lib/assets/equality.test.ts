import { describe, expect, it } from "vitest";
import { assetEquals } from "@/lib/assets/parser";
import { NATIVE_XRP_ASSET } from "@/lib/assets/types";

describe("asset equality", () => {
  it("matches native XRP", () => {
    expect(assetEquals(NATIVE_XRP_ASSET, NATIVE_XRP_ASSET)).toBe(true);
  });

  it("compares issued asset by currency+issuer", () => {
    const a = { kind: "issued" as const, currency: "USD", issuer: "rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq" };
    const b = { kind: "issued" as const, currency: "USD", issuer: "rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq" };
    expect(assetEquals(a, b)).toBe(true);
  });
});
