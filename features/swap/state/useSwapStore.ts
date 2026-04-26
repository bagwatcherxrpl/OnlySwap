"use client";

import { create } from "zustand";
import { PRELISTED_TOKENS } from "@/lib/assets/prelistedTokens";
import { assetEquals, formatAssetForDisplay } from "@/lib/assets/parser";
import { Asset } from "@/lib/assets/types";
import { QuoteResponse } from "@/lib/xrpl/types";
import { isQuoteExpired } from "@/lib/validation/swap";

type Store = {
  fromAsset: Asset;
  toAsset: Asset;
  inputAmount: string;
  quote: QuoteResponse | null;
  quoteLoading: boolean;
  quoteError: string | null;
  txStatus: "idle" | "review" | "signing" | "pending" | "success" | "error";
  txHash: string | null;
  txError: string | null;
  selectorOpen: null | "from" | "to";
  setInputAmount: (value: string) => void;
  setAsset: (side: "from" | "to", asset: Asset) => void;
  switchAssets: () => void;
  setQuote: (quote: QuoteResponse | null, quoteError?: string | null) => void;
  setQuoteLoading: (loading: boolean) => void;
  openSelector: (side: "from" | "to") => void;
  closeSelector: () => void;
  setTxStatus: (status: Store["txStatus"], err?: string | null, txHash?: string | null) => void;
};

export const useSwapStore = create<Store>((set, get) => ({
  fromAsset: PRELISTED_TOKENS[0],
  toAsset: PRELISTED_TOKENS[1],
  inputAmount: "1",
  quote: null,
  quoteLoading: false,
  quoteError: null,
  txStatus: "idle",
  txHash: null,
  txError: null,
  selectorOpen: null,
  setInputAmount: (value) => {
    const normalizedDecimal = value.replace(/,/g, ".");
    const sanitized = normalizedDecimal.replace(/[^\d.]/g, "");
    const firstDotIndex = sanitized.indexOf(".");
    const normalized =
      firstDotIndex === -1
        ? sanitized
        : `${sanitized.slice(0, firstDotIndex + 1)}${sanitized.slice(firstDotIndex + 1).replace(/\./g, "")}`;
    set({ inputAmount: normalized, quote: null, quoteError: null });
  },
  setAsset: (side, asset) => {
    const state = get();
    const opposite = side === "from" ? state.toAsset : state.fromAsset;
    if (assetEquals(asset, opposite)) {
      set({ quoteError: "Input and output assets must be different." });
      return;
    }
    if (side === "from") set({ fromAsset: asset, quote: null, quoteError: null });
    else set({ toAsset: asset, quote: null, quoteError: null });
  },
  switchAssets: () =>
    set((state) => ({
      fromAsset: state.toAsset,
      toAsset: state.fromAsset,
      quote: null,
      quoteError: null,
    })),
  setQuote: (quote, quoteError = null) => set({ quote, quoteError, quoteLoading: false }),
  setQuoteLoading: (quoteLoading) => set({ quoteLoading }),
  openSelector: (selectorOpen) => set({ selectorOpen }),
  closeSelector: () => set({ selectorOpen: null }),
  setTxStatus: (txStatus, txError = null, txHash = null) => set({ txStatus, txError, txHash }),
}));

export function buildAssetIdentifier(asset: Asset): string {
  if (asset.kind === "native") return "XRP";
  return `${asset.currency}.${asset.issuer}`;
}

export function canRequestQuote(state: Pick<Store, "inputAmount" | "fromAsset" | "toAsset">): boolean {
  return Boolean(
    state.inputAmount &&
      Number(state.inputAmount) > 0 &&
      !assetEquals(state.fromAsset, state.toAsset),
  );
}

export function humanAsset(asset: Asset): string {
  return formatAssetForDisplay(asset);
}

export function isCurrentQuoteStale(state: Store): boolean {
  if (!state.quote) return true;
  return isQuoteExpired(state.quote.expiresAt);
}
