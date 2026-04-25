import Decimal from "decimal.js";

const DROPS_PER_XRP = new Decimal(1_000_000);
const MIN_FEE_XRP = new Decimal("0.005");
const FEE_RATE = new Decimal("0.001");

export function xrpToDrops(xrp: Decimal.Value): string {
  return new Decimal(xrp).mul(DROPS_PER_XRP).ceil().toFixed(0);
}

export function dropsToXrp(drops: Decimal.Value): string {
  return new Decimal(drops).div(DROPS_PER_XRP).toFixed(6);
}

export function estimateInputValueInXrp(params: {
  isInputXrp: boolean;
  inputAmount: Decimal.Value;
  quotedInputXrpRate?: Decimal.Value;
}): Decimal {
  if (params.isInputXrp) return new Decimal(params.inputAmount);
  if (!params.quotedInputXrpRate) return new Decimal(0);
  return new Decimal(params.inputAmount).mul(params.quotedInputXrpRate);
}

export function calculateServiceFeeXrp(inputValueInXrp: Decimal.Value): {
  feeXrp: string;
  feeDrops: string;
  feePercent: string;
} {
  const volume = new Decimal(inputValueInXrp);
  const percentFee = volume.mul(FEE_RATE);
  const fee = Decimal.max(MIN_FEE_XRP, percentFee);
  return {
    feeXrp: fee.toFixed(6),
    feeDrops: xrpToDrops(fee),
    feePercent: "0.1%",
  };
}
