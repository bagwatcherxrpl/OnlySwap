"use client";

import { Asset } from "@/lib/assets/types";
import { QuoteResponse } from "@/lib/xrpl/types";
import { formatAssetForDisplay } from "@/lib/assets/parser";

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  fromAsset: Asset;
  toAsset: Asset;
  inputAmount: string;
  quote: QuoteResponse | null;
  walletLabel: string;
  busy: boolean;
};

export function ReviewSwapModal(props: Props) {
  const networkFeeXrp = "0.000012";

  if (!props.open || !props.quote) return null;
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-zinc-900 p-4 shadow-2xl">
        <h3 className="text-base font-semibold">Review transaction</h3>
        <p className="mt-1 text-xs text-zinc-400">Approve wallet request for swap execution.</p>
        <div className="mt-4 space-y-2 rounded-xl border border-white/10 bg-black/20 p-3 text-sm">
          <div className="flex justify-between"><span>Pay</span><span>{props.inputAmount} {formatAssetForDisplay(props.fromAsset)}</span></div>
          <div className="flex justify-between"><span>Receive (est.)</span><span>{props.quote.estimatedOutput} {formatAssetForDisplay(props.toAsset)}</span></div>
          <div className="flex justify-between"><span>Network fee (est.)</span><span>{networkFeeXrp} XRP</span></div>
          <div className="flex justify-between"><span>Route</span><span>{props.quote.routeSummary}</span></div>
          <div className="flex justify-between"><span>Wallet</span><span>{props.walletLabel}</span></div>
        </div>
        {props.quote.warnings.length ? (
          <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
            {props.quote.warnings.join(" ")}
          </div>
        ) : null}
        <p className="mt-3 text-xs text-zinc-400">
          Final execution depends on XRPL routing and market conditions.
        </p>
        <div className="mt-4 flex gap-2">
          <button onClick={props.onClose} className="flex-1 rounded-lg border border-white/15 px-3 py-2">Cancel</button>
          <button
            disabled={props.busy}
            onClick={() => props.onConfirm()}
            className="flex-1 rounded-lg bg-violet-500 px-3 py-2 font-medium disabled:opacity-60"
          >
            {props.busy ? "Submitting..." : "Confirm & Sign"}
          </button>
        </div>
      </div>
    </div>
  );
}
