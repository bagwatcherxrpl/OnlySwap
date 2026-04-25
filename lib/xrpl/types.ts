import { Asset } from "@/lib/assets/types";

export type RouteKind = "direct" | "viaXrp" | "multiHop";

export type QuoteRequest = {
  inputAsset: Asset;
  outputAsset: Asset;
  inputAmount: string;
};

export type QuoteResponse = {
  estimatedOutput: string;
  inputXrpRate: string;
  serviceFeeXrp: string;
  serviceFeeDrops: string;
  networkFeeDrops: string;
  routeKind: RouteKind;
  routeSummary: string;
  priceImpactPct: string;
  expiresAt: number;
  warnings: string[];
};
