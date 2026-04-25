import Decimal from "decimal.js";

export function formatAmount(value: Decimal.Value, maxDp = 6): string {
  const decimal = new Decimal(value);
  return decimal.toFixed(maxDp).replace(/\.?0+$/, "");
}

export function formatPercent(value: Decimal.Value, maxDp = 2): string {
  return `${new Decimal(value).toFixed(maxDp)}%`;
}
