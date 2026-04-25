import { describe, expect, it } from "vitest";
import { formatAmount, formatPercent } from "@/lib/format/amounts";

describe("format helpers", () => {
  it("formats amount safely", () => {
    expect(formatAmount("12.340000")).toBe("12.34");
  });

  it("formats percent", () => {
    expect(formatPercent("0.3")).toBe("0.30%");
  });
});
