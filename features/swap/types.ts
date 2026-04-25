import { Asset } from "@/lib/assets/types";
import { QuoteResponse } from "@/lib/xrpl/types";

export type TxStatus =
  | "idle"
  | "review"
  | "signing"
  | "pending"
  | "success"
  | "error";

export type SwapState = {
  fromAsset: Asset;
  toAsset: Asset;
  inputAmount: string;
  quote: QuoteResponse | null;
  quoteLoading: boolean;
  quoteError: string | null;
  txStatus: TxStatus;
  txHash: string | null;
  txError: string | null;
  selectorOpen: null | "from" | "to";
};
