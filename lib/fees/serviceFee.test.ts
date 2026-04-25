import { describe, expect, it } from "vitest";
import {
  calculateServiceFeeXrp,
  estimateInputValueInXrp,
  dropsToXrp,
  xrpToDrops,
} from "@/lib/fees/serviceFee";

describe("service fee", () => {
  it("enforces minimum fee", () => {
    expect(calculateServiceFeeXrp("1").feeXrp).toBe("0.005000");
  });

  it("uses 0.1% when higher", () => {
    expect(calculateServiceFeeXrp("100").feeXrp).toBe("0.100000");
  });

  it("converts between xrp and drops", () => {
    expect(xrpToDrops("1")).toBe("1000000");
    expect(dropsToXrp("1000000")).toBe("1.000000");
  });

  it("never undercharges due to drop rounding", () => {
    expect(xrpToDrops("0.0000011")).toBe("2");
  });

  it("estimates non-xrp input value in xrp", () => {
    const value = estimateInputValueInXrp({
      isInputXrp: false,
      inputAmount: "10",
      quotedInputXrpRate: "0.5",
    });
    expect(value.toFixed(6)).toBe("5.000000");
  });
});
