import { describe, expect, it } from "vitest";
import {
  assetEquals,
  normalizeAssetInput,
  parseAssetIdentifier,
} from "@/lib/assets/parser";

describe("asset parser", () => {
  it("parses XRP", () => {
    const result = parseAssetIdentifier("XRP");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.asset.kind).toBe("native");
  });

  it("strips _xrp suffix", () => {
    expect(normalizeAssetInput(" USD.rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq_xrp ")).toBe(
      "USD.rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq",
    );
  });

  it("rejects invalid issuer", () => {
    const result = parseAssetIdentifier("USD.notAnIssuer");
    expect(result.ok).toBe(false);
  });

  it("parses 40-char hex currency", () => {
    const result = parseAssetIdentifier(
      "41524D5900000000000000000000000000000000.rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq",
    );
    expect(result.ok).toBe(true);
    if (result.ok && result.asset.kind === "issued") {
      expect(result.asset.currency).toBe("41524D5900000000000000000000000000000000");
    }
  });

  it("trims and uppercases standard currency", () => {
    const result = parseAssetIdentifier(" usd.rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq ");
    expect(result.ok).toBe(true);
    if (result.ok && result.asset.kind === "issued") {
      expect(result.asset.currency).toBe("USD");
    }
  });

  it("uses currency+issuer for identity", () => {
    const a = parseAssetIdentifier("USD.rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq");
    const b = parseAssetIdentifier("USD.rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq");
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(assetEquals(a.asset, b.asset)).toBe(true);
    }
  });
});
